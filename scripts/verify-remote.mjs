import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .trim()
    .split("\n")
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const db = createClient(
  env.VITE_SUPABASE_URL,
  env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false } },
);
const { data, error } = await db.from("facilities").select("name,status");
if (error) throw error;
if (!data || data.length < 4) throw new Error("Public directory missing");
const clinical = await db.from("records").select("*");
if (!clinical.error && clinical.data.length)
  throw new Error("Anonymous clinical access");
const command = await db.rpc("nc_command", { action: "session", p: {} });
if (!command.error) throw new Error("Anonymous command unexpectedly permitted");
const edge = await fetch(
  env.VITE_SUPABASE_URL + "/functions/v1/send-staff-invite",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
    body: "{}",
  },
);
if (edge.status !== 401)
  throw new Error(
    "Invitation endpoint did not reject anonymous call: " + edge.status,
  );
console.log(
  "PASS: live public directory; anonymous clinical access blocked; anonymous command blocked; invitation endpoint rejects unauthenticated calls.",
);
