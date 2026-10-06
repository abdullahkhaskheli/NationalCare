import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,DELETE,OPTIONS",
  "Content-Type": "application/json",
};
const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: cors });
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!["POST", "DELETE"].includes(req.method))
    return respond(405, { error: "Method not allowed" });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return respond(401, { error: "Sign in required" });
    const url = Deno.env.get("SUPABASE_URL")!;
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: identity, error: authError } = await client.auth.getUser(
      authorization.slice(7),
    );
    if (authError || !identity.user)
      return respond(401, { error: "Invalid session" });
    if (req.method === "DELETE") {
      const removed = await client.rpc("nc_remove_photo");
      if (removed.error)
        return respond(403, { error: "Unable to remove photo" });
      if (removed.data) {
        const admin = createClient(
          url,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          { auth: { persistSession: false } },
        );
        const deleted = await admin.storage
          .from("photos")
          .remove([removed.data]);
        if (deleted.error)
          return respond(502, {
            error:
              "Photo removed from profile; storage cleanup needs administrator attention",
          });
      }
      return respond(200, { removed: true });
    }
    if (Number(req.headers.get("content-length")) > 11000000)
      return respond(413, { error: "File too large" });
    const body = await req.formData();
    const file = body.get("file");
    const pid = body.get("patient_id");
    const photo = body.get("photo") === "true";
    if (!(file instanceof File) || typeof pid !== "string")
      return respond(400, { error: "File and patient are required" });
    if (file.size < 1 || file.size > (photo ? 2097152 : 10485760))
      return respond(413, {
        error: photo
          ? "Maximum photo size is 2 MB"
          : "Maximum document size is 10 MB",
      });
    const { data: allowed, error: accessError } = await client.rpc(
      "nc_authorize_upload",
      { pid, photo },
    );
    if (accessError || allowed !== true)
      return respond(403, {
        error: "You do not have permission to upload for this patient",
      });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every(
      (x, i) => bytes[i] === x,
    );
    const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    const pdf = new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
    const mime = png
      ? "image/png"
      : jpeg
        ? "image/jpeg"
        : pdf && !photo
          ? "application/pdf"
          : null;
    if (!mime || mime !== file.type)
      return respond(415, {
        error: "Upload a valid JPEG, PNG or PDF with the correct file type",
      });
    // This rejects common active PDF features; it is not an antivirus scanner.
    if (
      pdf &&
      /\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction|AA)\b/i.test(
        new TextDecoder("latin1").decode(bytes),
      )
    )
      return respond(415, {
        error: "Active or embedded content is not accepted in medical PDFs",
      });
    const bucket = photo ? "photos" : "medical";
    const path = `${pid}/${crypto.randomUUID()}.${png ? "png" : jpeg ? "jpg" : "pdf"}`;
    const name =
      file.name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180) ||
      "document";
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const uploaded = await admin.storage
      .from(bucket)
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploaded.error)
      return respond(502, {
        error: "File storage is unavailable. Please retry.",
      });
    const attested = await admin.rpc("nc_attest_upload", {
      pid,
      actor: identity.user.id,
      bucket_name: bucket,
      object_path: path,
      content_type: mime,
      byte_size: file.size,
      file_name: name,
    });
    if (attested.error) {
      await admin.storage.from(bucket).remove([path]);
      return respond(500, { error: "Unable to validate upload" });
    }
    const saved = await client.rpc("nc_command", {
      action: photo ? "set_photo" : "register_document",
      p: photo
        ? { path }
        : { patient_id: pid, path, name, mime, bytes: file.size },
    });
    if (saved.error) {
      await admin.storage.from(bucket).remove([path]);
      return respond(403, {
        error: "Upload permission changed. Please sign in and retry.",
      });
    }
    return respond(201, { path });
  } catch {
    return respond(400, { error: "Unable to process upload" });
  }
});
