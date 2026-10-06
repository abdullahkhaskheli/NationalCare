import { createClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState, useRef } from "react";
const env = import.meta.env as Record<string, string>;
export const configured = !!(
  env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
);
export const db = configured
  ? createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
export type Row = Record<string, any>;
export async function command(action: string, p: Row = {}): Promise<any> {
  if (!db) throw new Error("Backend connection is not configured.");
  const { data, error } = await db.rpc("nc_command", { action, p });
  if (error) throw new Error(error.message);
  window.dispatchEvent(new Event("nc-refresh"));
  return data;
}
const ordering = (table: string) =>
  table === "stock"
    ? "medicine"
    : table === "facilities"
      ? "name"
      : ["prescription_items", "dispense_items"].includes(table)
        ? "id"
        : "created_at";
export async function query(
  table: string,
  filters: Row = {},
  limit = 100,
): Promise<Row[]> {
  if (!db) throw new Error("Backend connection is not configured.");
  const result: Row[] = [];
  const all =
    ["prescription_items", "dispense_items"].includes(table) ||
    limit === Infinity;
  for (let offset = 0; ; offset += 500) {
    let q = db.from(table).select("*");
    for (const [key, value] of Object.entries(filters))
      if (value !== undefined && value !== null && value !== "")
        q = Array.isArray(value) ? q.in(key, value) : q.eq(key, value);
    q = q.order(ordering(table), {
      ascending: table === "stock" || table === "facilities",
    });
    if (ordering(table) !== "id") q = q.order("id");
    const end = all ? offset + 499 : Math.min(offset + 499, limit - 1);
    const { data, error } = await q.range(offset, end);
    if (error) throw new Error(error.message);
    result.push(...(data || []));
    if (
      (data?.length || 0) < end - offset + 1 ||
      (!all && result.length >= limit)
    ) {
      if (table === "appointments" && result.length) {
        const details = new Map<string, Row>();
        for (let i = 0; i < result.length; i += 100) {
          const r = await db.rpc("nc_appointment_patient_details", {
            appointment_ids: result.slice(i, i + 100).map((a) => a.id),
          });
          if (r.error) throw new Error(r.error.message);
          for (const patient of r.data || [])
            details.set(patient.appointment_id, patient);
        }
        return result.map((a) => ({
          ...a,
          patient: details.get(a.id) || null,
        }));
      }
      return result;
    }
  }
}
export function useRows(table: string, filters: Row = {}, enabled = true) {
  const [rows, setRows] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [limit, setLimit] = useState(100);
  const sequence = useRef(0);
  const key = JSON.stringify(filters);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    if (!enabled || !db) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const next = await query(table, JSON.parse(key), limit);
      if (request === sequence.current) {
        setRows(next);
        setError("");
      }
    } catch (e) {
      if (request === sequence.current) setError((e as Error).message);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [table, key, enabled, limit]);
  useEffect(() => {
    setRows([]);
    void refresh();
    window.addEventListener("nc-refresh", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      sequence.current++;
      window.removeEventListener("nc-refresh", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);
  return {
    rows,
    error,
    loading,
    refresh,
    more: () => setLimit((n) => n + 100),
    hasMore: rows.length === limit,
  };
}
export async function fileUrl(bucket: string, path: string) {
  if (!db) throw new Error("Backend not configured");
  const { data, error } = await db.storage
    .from(bucket)
    .createSignedUrl(path, 120);
  if (error) throw error;
  return data.signedUrl;
}
export async function uploadFile(file: File, patientId: string, photo = false) {
  if (!db) throw new Error("Backend not configured");
  const body = new FormData();
  body.append("file", file);
  body.append("patient_id", patientId);
  body.append("photo", String(photo));
  const { data, error } = await db.functions.invoke("upload-medical", { body });
  if (error) {
    let message = error.message;
    try {
      message = (await error.context.json()).error || message;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  window.dispatchEvent(new Event("nc-refresh"));
}
