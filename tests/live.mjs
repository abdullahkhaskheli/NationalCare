// Requires isolated synthetic accounts created by the database owner; never use real patients.
import { readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { HttpsProxyAgent } from "https-proxy-agent";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .trim()
    .split("\n")
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const fixturePath = process.env.NC_QA_FIXTURE || "../nc-qa.json";
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
class Socket extends WebSocket {
  constructor(url, protocols) {
    super(
      url,
      protocols,
      process.env.HTTPS_PROXY
        ? { agent: new HttpsProxyAgent(process.env.HTTPS_PROXY) }
        : {},
    );
  }
}
function totp(secret) {
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, ""))
    bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
      .indexOf(char)
      .toString(2)
      .padStart(5, "0");
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8)
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const offset = hash.at(-1) & 15;
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
const clients = {};
const sessions = {};
const cmd = async (client, action, p = {}) => {
  const r = await client.rpc("nc_command", { action, p });
  if (r.error) throw new Error(`${action}: ${r.error.message}`);
  return r.data;
};
try {
  for (const [name, user] of Object.entries(fixture.users)) {
    const db = createClient(
      env.VITE_SUPABASE_URL,
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false }, realtime: { transport: Socket } },
    );
    clients[name] = db;
    const login = await db.auth.signInWithPassword({
      email: user.email,
      password: user.password,
    });
    if (login.error) throw new Error(`${name} sign-in: ${login.error.message}`);
    if (["doctor", "pharmacy"].includes(name)) {
      const factors = await db.auth.mfa.listFactors();
      let factor = factors.data?.totp.find((f) => f.status === "verified");
      if (!factor) {
        const enrolled = await db.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "Automated QA",
        });
        if (enrolled.error) throw enrolled.error;
        fixture.users[name].secret = enrolled.data.totp.secret;
        factor = enrolled.data;
        writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), {
          mode: 0o600,
        });
      }
      const mfa = await db.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: totp(fixture.users[name].secret),
      });
      if (mfa.error) throw mfa.error;
    }
    sessions[name] = (await db.auth.getSession()).data.session;
    await db.realtime.setAuth(sessions[name].access_token);
  }
  console.log("PASS: real Auth sign-in and staff TOTP MFA.");
  const { patient, doctor, pharmacy, other } = clients;
  let own = (await cmd(patient, "session")).patient;
  if (!own) {
    await cmd(patient, "register_patient", {
      full_name: "Automated QA Patient",
      cnic: "9" + randomInt(100000000000, 999999999999),
      dob: "1994-03-01",
      sex: "unspecified",
      phone: "+923000000000",
    });
    own = (await cmd(patient, "session")).patient;
  }
  await cmd(patient, "grant_care", {
    patient_id: own.id,
    user_id: fixture.users.doctor.id,
  });
  const events = [];
  const foreignEvents = [];
  const subscribe = async (client, name, table, list) =>
    new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("Realtime subscription timeout: " + name)),
        20000,
      );
      const channel = client
        .channel(name)
        .on("system", {}, (p) =>
          console.log("Realtime system", name, p.status, p.message),
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table },
          (p) => list.push(p.new),
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timeout);
            resolve(channel);
          }
          if (status === "CHANNEL_ERROR") {
            clearTimeout(timeout);
            reject(new Error("Realtime channel error: " + name));
          }
        });
    });
  await subscribe(patient, "qa-prescriptions", "prescriptions", events);
  await subscribe(other, "qa-isolation", "prescriptions", foreignEvents);
  const rx = await cmd(doctor, "prescribe", {
    patient_id: own.id,
    facility_id: fixture.facility,
    valid_until: new Date(Date.now() + 86400000).toISOString(),
    items: [
      {
        medicine: "Synthetic QA medicine",
        strength: "10 mg",
        dose: "1 unit",
        route: "oral",
        frequency: "daily",
        duration: "10 days",
        quantity: 10,
      },
    ],
  });
  assert.equal(
    (await patient.from("prescriptions").select("id").eq("id", rx.id)).data
      ?.length,
    1,
    "Patient can query own prescription",
  );
  const until = Date.now() + 15000;
  while (!events.some((e) => e.id === rx.id) && Date.now() < until)
    await new Promise((r) => setTimeout(r, 100));
  assert(
    events.some((e) => e.id === rx.id),
    "Patient must receive real prescription event",
  );
  assert.equal(foreignEvents.length, 0);
  assert.equal(
    (await other.from("prescriptions").select("id").eq("id", rx.id)).data
      ?.length,
    0,
  );
  console.log(
    "PASS: doctor prescription reaches patient through live Realtime; unrelated account receives no record.",
  );
  const token = await cmd(patient, "prescription_qr", { id: rx.id });
  const scan = await cmd(pharmacy, "scan_prescription", { token: token.token });
  assert.equal(scan.patient_name, own.full_name);
  await cmd(pharmacy, "stock_add", {
    facility_id: fixture.facility,
    medicine: "Synthetic QA medicine",
    strength: "10 mg",
    batch: randomUUID(),
    expires_on: "2099-01-01",
    quantity: 20,
  });
  const stock = (
    await pharmacy
      .from("stock")
      .select("id")
      .eq("facility_id", fixture.facility)
      .limit(1)
  ).data[0];
  const item = (
    await pharmacy
      .from("prescription_items")
      .select("id")
      .eq("prescription_id", rx.id)
  ).data[0];
  const dispensed = [];
  await subscribe(patient, "qa-dispensing", "dispense_items", dispensed);
  await cmd(pharmacy, "dispense", {
    prescription_id: rx.id,
    facility_id: fixture.facility,
    request_id: randomUUID(),
    items: [{ item_id: item.id, stock_id: stock.id, quantity: 4 }],
  });
  const end = Date.now() + 15000;
  while (
    !dispensed.some((e) => e.prescription_item_id === item.id) &&
    Date.now() < end
  )
    await new Promise((r) => setTimeout(r, 100));
  assert.equal(
    dispensed.find((e) => e.prescription_item_id === item.id)?.quantity,
    4,
  );
  console.log(
    "PASS: QR-scoped pharmacy access and partial dispensing reach the patient live.",
  );
  const fake = new FormData();
  fake.append("patient_id", own.id);
  fake.append("photo", "true");
  fake.append(
    "file",
    new File(["not a png"], "bad.png", { type: "image/png" }),
  );
  const invalid = await patient.functions.invoke("upload-medical", {
    body: fake,
  });
  assert(invalid.error, "Invalid bytes must be rejected");
  const photo = new FormData();
  photo.append("patient_id", own.id);
  photo.append("photo", "true");
  photo.append(
    "file",
    new File(
      [
        Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
          "base64",
        ),
      ],
      "qa.png",
      { type: "image/png" },
    ),
  );
  const upload = await patient.functions.invoke("upload-medical", {
    body: photo,
  });
  if (upload.error) {
    let detail = upload.error.message;
    try {
      detail = await upload.error.context.text();
    } catch {}
    throw new Error("Real photo upload: " + detail);
  }
  fixture.upload = { bucket: "photos", path: upload.data.path };
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2), { mode: 0o600 });
  const privatePhoto = await other.storage
    .from("photos")
    .createSignedUrl(upload.data.path, 60);
  assert(privatePhoto.error, "Unrelated user must not sign photo URL");
  console.log(
    "PASS: server validates upload bytes; genuine photo saves; another account cannot access it.",
  );
  writeFileSync("../nc-qa-sessions.json", JSON.stringify(sessions), {
    mode: 0o600,
  });
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await Promise.all(Object.values(clients).map((c) => c.removeAllChannels()));
}
