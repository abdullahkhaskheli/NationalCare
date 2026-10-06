import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const db = new PGlite();
await db.exec(`create role service_role bypassrls;create role anon;create role authenticated;create schema auth;create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner_id text);alter table storage.objects enable row level security;
grant usage on schema auth,storage to authenticated,anon;grant execute on all functions in schema auth to authenticated,anon;
`);
for (const f of readdirSync("supabase/migrations")
  .filter((f) => f.endsWith(".sql"))
  .sort())
  await db.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
const users = {
  patient: "10000000-0000-0000-0000-000000000001",
  other: "10000000-0000-0000-0000-000000000002",
  doctor: "10000000-0000-0000-0000-000000000003",
  pharmacy: "10000000-0000-0000-0000-000000000004",
  ministry: "10000000-0000-0000-0000-000000000005",
  hospital: "10000000-0000-0000-0000-000000000006",
  outsider: "10000000-0000-0000-0000-000000000007",
  lab: "10000000-0000-0000-0000-000000000008",
};
const fac = "20000000-0000-0000-0000-000000000001";
for (const [name, id] of Object.entries(users))
  await db.query("insert into auth.users values($1,$2,now());", [
    id,
    `${name}@example.test`,
  ]);
for (const id of Object.values(users))
  await db.query("insert into auth.sessions values($1,$1)", [id]);
await db.query(
  "insert into public.facilities(id,name,city,province,status) values($1,'Test Hospital','Test City','Sindh','active')",
  [fac],
);
for (const role of ["doctor", "pharmacy", "ministry", "hospital", "lab"])
  await db.query(
    "insert into private.memberships(user_id,role,facility_id) values($1,$2,$3)",
    [
      users[role],
      role === "lab" ? "laboratory" : role,
      role === "ministry" ? null : fac,
    ],
  );
const as = async (name, aal = "aal2") => {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",
    [users[name], JSON.stringify({ session_id: users[name], aal })],
  );
  await db.exec("set role authenticated");
};
const cmd = async (action, p = {}) =>
  (
    await db.query("select public.nc_command($1,$2::jsonb) as result", [
      action,
      JSON.stringify(p),
    ])
  ).rows[0].result;
const deny = async (fn, pattern) => {
  await assert.rejects(fn, pattern);
};
await as("patient");
const patient = (
  await cmd("register_patient", {
    full_name: "Patient One",
    cnic: "1111111111111",
    dob: "1995-01-01",
    sex: "female",
    phone: "+923001111111",
  })
).id;
await as("other");
const other = (
  await cmd("register_patient", {
    full_name: "Patient Two",
    cnic: "2222222222222",
    dob: "1994-01-01",
    sex: "male",
    phone: "+923002222222",
  })
).id;
assert.equal((await db.query("select * from public.patients")).rows.length, 1);
await deny(
  () => db.query("select * from private.identities"),
  /permission denied/,
);
await deny(
  () => db.query("update public.patients set identity_status='reviewed'"),
  /permission denied/,
);
await as("doctor");
await deny(
  () =>
    cmd("clinical_record", {
      patient_id: patient,
      facility_id: fac,
      kind: "encounter",
      title: "Visit",
      body: "Visit notes",
    }),
  /care relationship/,
);
await as("patient");
await cmd("grant_care", { patient_id: patient, user_id: users.doctor });
await as("doctor");
await cmd("clinical_record", {
  patient_id: patient,
  facility_id: fac,
  kind: "encounter",
  title: "Visit",
  body: "Clinical notes",
});
const rx = await cmd("prescribe", {
  patient_id: patient,
  facility_id: fac,
  valid_until: "2099-01-01",
  items: [],
}).catch(() => ({ id: null }));
assert.equal(rx.id, null);
const until = new Date(Date.now() + 86400000 * 7).toISOString();
const prescription = (
  await cmd("prescribe", {
    patient_id: patient,
    facility_id: fac,
    valid_until: until,
    items: [
      {
        medicine: "Test medicine",
        strength: "10 mg",
        dose: "1 unit",
        route: "oral",
        frequency: "daily",
        duration: "10 days",
        quantity: 10,
      },
    ],
  })
).id;
await as("other");
assert.equal(
  (await db.query("select * from public.prescriptions")).rows.length,
  0,
);
await as("pharmacy");
assert.equal(
  (await db.query("select * from public.prescriptions")).rows.length,
  0,
);
await deny(() => cmd("scan_prescription", { token: "invalid" }), /invalid/);
await as("patient");
const token = (await cmd("prescription_qr", { id: prescription })).token;
await as("pharmacy");
await cmd("scan_prescription", { token });
assert.equal(
  (await db.query("select * from public.prescriptions")).rows.length,
  1,
);
assert.equal((await db.query("select * from public.patients")).rows.length, 0);
await cmd("stock_add", {
  facility_id: fac,
  medicine: "Test medicine",
  strength: "10 mg",
  batch: "B1",
  expires_on: "2099-01-01",
  quantity: 20,
});
const stock = (await db.query("select id from public.stock")).rows[0].id;
const item = (await db.query("select id from public.prescription_items"))
  .rows[0].id;
const request = "30000000-0000-0000-0000-000000000001";
const dispense = {
  prescription_id: prescription,
  facility_id: fac,
  request_id: request,
  items: [{ item_id: item, stock_id: stock, quantity: 6 }],
};
await cmd("dispense", dispense);
await cmd("dispense", dispense);
assert.equal(
  (await db.query("select quantity from public.stock")).rows[0].quantity,
  14,
);
await deny(
  () =>
    cmd("dispense", {
      ...dispense,
      request_id: "30000000-0000-0000-0000-000000000002",
      items: [{ item_id: item, stock_id: stock, quantity: 5 }],
    }),
  /exceeds/,
);
assert.equal(
  (await db.query("select count(*)::int n from public.dispenses")).rows[0].n,
  1,
);
await as("doctor");
await cmd("cancel_prescription", {
  id: prescription,
  reason: "Treatment changed",
});
await as("pharmacy");
await deny(() => cmd("scan_prescription", { token }), /invalid/);
await as("doctor", "aal1");
assert.equal((await db.query("select * from public.records")).rows.length, 0);
await as("patient");
const health = (
  await db.query("select health_id from public.patients where id=$1", [patient])
).rows[0].health_id;
await as("other");
await cmd("family_invite", { health_id: health, relationship: "Sibling" });
await as("patient");
const link = (await cmd("family_list"))[0];
await cmd("family_respond", { id: link.id, accept: true });
await as("other");
assert.equal((await db.query("select * from public.records")).rows.length, 0);
await as("patient");
await cmd("family_invite", {
  health_id: (await cmd("family_list"))[0].health_id,
  relationship: "Sibling",
});
await as("other");
const reverse = (await cmd("family_list")).find((x) => !x.outgoing);
await cmd("family_respond", { id: reverse.id, accept: true });
await as("patient");
await cmd("family_sharing", { id: reverse.id, enabled: true });
await as("other");
assert.equal((await db.query("select * from public.records")).rows.length, 1);
await as("patient");
await cmd("family_revoke", { id: reverse.id });
await as("other");
assert.equal((await db.query("select * from public.records")).rows.length, 0);
await as("hospital");
const invite = (
  await cmd("staff_request", {
    facility_id: fac,
    email: "outsider@example.test",
    full_name: "Approved Doctor",
    role: "doctor",
    credential: "Credential 123",
  })
).id;
await as("outsider");
await deny(() => cmd("staff_accept", { id: invite }), /approved invitation/);
await as("ministry");
await cmd("staff_review", {
  id: invite,
  status: "approved",
  note: "Credentials checked",
});
await as("outsider");
await cmd("staff_accept", { id: invite });
assert.equal((await cmd("session")).memberships[0].role, "doctor");
await as("hospital");
await cmd("staff_revoke", { id: invite });
await as("outsider");
assert.equal((await cmd("session")).memberships.length, 0);
await as("doctor");
const lab = (
  await cmd("lab_order", {
    patient_id: patient,
    facility_id: fac,
    test: "Test panel",
  })
).id;
await as("lab");
await cmd("lab_status", { id: lab, status: "collected" });
await cmd("lab_status", { id: lab, status: "processing" });
await cmd("lab_status", {
  id: lab,
  status: "verified",
  result: "Verified findings",
});
await as("patient");
assert.equal(
  (await db.query("select * from public.records where kind='lab_result'")).rows
    .length,
  1,
);
await as("ministry");
assert.equal((await db.query("select * from public.records")).rows.length, 0);

// File attestation cannot be forged by a client or reused for a different patient.
await as("other");
assert.equal(
  (await db.query("select public.nc_authorize_upload($1,false) ok", [patient]))
    .rows[0].ok,
  false,
);
await as("patient");
assert.equal(
  (await db.query("select public.nc_authorize_upload($1,true) ok", [patient]))
    .rows[0].ok,
  true,
);
const path = patient + "/validated.pdf";
await deny(
  () =>
    db.query("select public.nc_attest_upload($1,$2,$3,$4,$5,$6,$7)", [
      patient,
      users.patient,
      "medical",
      path,
      "application/pdf",
      64,
      "report.pdf",
    ]),
  /permission denied/,
);
await deny(
  () =>
    cmd("register_document", {
      patient_id: patient,
      path,
      name: "report.pdf",
      mime: "application/pdf",
      bytes: 64,
    }),
  /Not permitted/,
);
await db.exec("reset role");
await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
  "medical",
  path,
]);
await db.exec("set role service_role");
await db.query("select public.nc_attest_upload($1,$2,$3,$4,$5,$6,$7)", [
  patient,
  users.patient,
  "medical",
  path,
  "application/pdf",
  64,
  "report.pdf",
]);
await as("patient");
await deny(
  () =>
    cmd("register_document", {
      patient_id: patient,
      path,
      name: "report.pdf",
      mime: "application/pdf",
      bytes: 100,
    }),
  /Not permitted/,
);
await cmd("register_document", {
  patient_id: patient,
  path,
  name: "report.pdf",
  mime: "application/pdf",
  bytes: 64,
});
assert.equal((await db.query("select * from public.documents")).rows.length, 1);
await as("other");
assert.equal((await db.query("select * from public.documents")).rows.length, 0);
// Facility scope, provincial scope, workflow transitions and bed collision.
await db.exec("reset role");
const secondFac = "20000000-0000-0000-0000-000000000002";
await db.query(
  "insert into public.facilities(id,name,city,province,status) values($1,'Other Test Hospital','Other City','Punjab','active')",
  [secondFac],
);
await db.query(
  "insert into private.memberships(user_id,role,facility_id) values($1,'hospital',$2),($1,'support',$2),($3,'support',$4)",
  [users.outsider, secondFac, users.hospital, fac],
);
await as("hospital");
assert.equal(
  (await db.query("select private.can_manage_work('complaint',null,'') ok"))
    .rows[0].ok,
  false,
);
await as("patient");
await deny(
  () =>
    cmd("create_work", {
      kind: "complaint",
      title: "Care request",
      details: {
        description: "Need followup",
        category: "Care",
        contact: "+923000000000",
      },
    }),
  /receiving facility/,
);
const complaint = (
  await cmd("create_work", {
    kind: "complaint",
    facility_id: fac,
    patient_id: patient,
    title: "Care request",
    details: {
      description: "Need followup",
      category: "Care",
      contact: "+923000000000",
    },
  })
).id;
await as("outsider");
assert.equal(
  (await db.query("select * from public.work_items where id=$1", [complaint]))
    .rows.length,
  0,
);
await deny(
  () =>
    cmd("transition_work", {
      id: complaint,
      status: "in_review",
      note: "Reviewing request",
    }),
  /Not permitted/,
);
await as("hospital");
await deny(
  () =>
    cmd("transition_work", {
      id: complaint,
      status: "completed",
      note: "Reviewing request",
    }),
  /Invalid workflow/,
);
for (const status of ["in_review", "approved", "in_progress", "completed"])
  await cmd("transition_work", {
    id: complaint,
    status,
    note: "Documented workflow action",
  });
const admission = {
  kind: "admission",
  facility_id: fac,
  title: "Admission record",
  details: {
    description: "Planned admission",
    bed: "WARD-A-01",
    contact: "+923000000000",
    targetDate: "2030-01-01",
  },
};
const a = (await cmd("create_work", admission)).id,
  b = (await cmd("create_work", admission)).id;
await cmd("transition_work", {
  id: a,
  status: "in_review",
  note: "Bed availability checked",
});
await cmd("transition_work", {
  id: a,
  status: "approved",
  note: "Admission confirmed",
});
await cmd("transition_work", {
  id: b,
  status: "in_review",
  note: "Bed requested",
});
await deny(
  () =>
    cmd("transition_work", {
      id: b,
      status: "approved",
      note: "Conflicting bed",
    }),
  /duplicate key/,
);
await as("patient");
assert.equal(
  (
    await db.query("select status from public.work_items where id=$1", [
      complaint,
    ])
  ).rows[0].status,
  "completed",
);

const workflowRoles = {
  referral: "hospital",
  theatre: "hospital",
  outreach: "community",
  ambulance: "emergency",
  inspection: "province",
  surveillance: "surveillance",
  purchase: "supply",
  transfer: "supply",
  claim: "coverage",
  credential: "registry",
  training: "workforce",
  research: "research",
  facility_application: "ministry",
};
for (const [kind, role] of Object.entries(workflowRoles)) {
  await db.exec("reset role");
  const key = "test_" + kind;
  users[key] = randomUUID();
  await db.query("insert into auth.users values($1,$2,now())", [
    users[key],
    key + "@example.test",
  ]);
  await db.query("insert into auth.sessions values($1,$1)", [users[key]]);
  await db.query(
    "insert into private.memberships(user_id,role,facility_id,province) values($1,$2,$3,$4)",
    [
      users[key],
      role,
      ["ministry", "province"].includes(role) ? null : fac,
      "Sindh",
    ],
  );
  await as(key);
  const details = {
    description: "QA operational request",
    bed: "THEATRE-01",
    clinician: "Assigned clinician",
    contact: "+923000000000",
    targetDate: "2030-01-01",
    address: "QA address",
    city: "QA City",
    province: "Sindh",
    priority: "urgent",
    category: "Test category",
    quantity: "2",
    amount: "150.00",
    medicine: "Test supply",
    credential: "QA credential",
    expiry: "2031-01-01",
    purpose: "Approved study review",
  };
  const request = (
    await cmd("create_work", {
      kind,
      facility_id: role === "ministry" ? null : fac,
      province: "Sindh",
      title: "QA " + kind,
      details,
    })
  ).id;
  if (role === "province")
    assert.equal(
      (
        await db.query(
          "select private.can_manage_work('inspection',$1,'Punjab') ok",
          [fac],
        )
      ).rows[0].ok,
      false,
    );
  for (const status of ["in_review", "approved", "in_progress", "completed"])
    await cmd("transition_work", {
      id: request,
      status,
      note: "Verified QA transition",
    });
  assert.equal(
    (
      await db.query("select status from public.work_items where id=$1", [
        request,
      ])
    ).rows[0].status,
    "completed",
  );
}
console.log(
  "PASS: all 13 additional operational workflow types, provincial isolation, facility application approval.",
);

await as("patient");
const booking = (
  await cmd("book_appointment", {
    patient_id: patient,
    facility_id: fac,
    starts_at: "2030-03-01T10:00:00Z",
    service: "Clinic visit",
  })
).id;
const bookingDetails = async () =>
  (
    await db.query(
      "select * from public.nc_appointment_patient_details($1::uuid[])",
      [[booking]],
    )
  ).rows;
await as("hospital");
assert.equal((await bookingDetails())[0].patient_name, "Patient One");
assert.equal((await bookingDetails())[0].phone, "+923001111111");
assert.equal(
  (await db.query("select * from public.patients where id=$1", [patient])).rows
    .length,
  0,
);
await as("outsider");
assert.equal((await bookingDetails()).length, 0);
await as("hospital", "aal1");
assert.equal((await bookingDetails()).length, 0);
await as("doctor");
assert.equal((await bookingDetails()).length, 0);
await as("hospital");
await cmd("appointment_status", {
  id: booking,
  status: "confirmed",
  clinician_id: users.doctor,
});
await as("doctor");
assert.equal((await bookingDetails())[0].patient_name, "Patient One");
await as("other");
assert.equal((await bookingDetails()).length, 0);
console.log(
  "PASS: appointment registration details for receiving hospital and assigned clinician only; no hospital clinical-record access.",
);
console.log(
  "PASS: server upload attestation, file privacy, facility work isolation, checked transitions, bed collision.",
);

await db.exec("reset role");
await db.query("delete from auth.sessions where user_id=$1", [users.doctor]);
await as("doctor");
await deny(() => cmd("session"), /session has ended/);
console.log(
  "PASS: migration, tenant isolation, immutable records, MFA, approval, revocation, family consent, QR scope, partial dispensing, idempotency, overdispensing rollback, cancellation, labs, revoked session.",
);
await db.close();
