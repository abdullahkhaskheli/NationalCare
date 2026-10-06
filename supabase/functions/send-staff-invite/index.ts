import { createClient } from "npm:@supabase/supabase-js@2.117.2";
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization,x-client-info,apikey,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Content-Type": "application/json",
};
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer "))
      return new Response(JSON.stringify({ error: "Sign in required" }), {
        status: 401,
        headers,
      });
    const url = Deno.env.get("SUPABASE_URL")!;
    const client = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const { data: identity, error: authError } = await client.auth.getUser(
      authorization.slice(7),
    );
    if (authError || !identity.user)
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers,
      });
    const body = await req.json();
    if (
      typeof body.request_id !== "string" ||
      typeof body.redirect_to !== "string"
    )
      return new Response(JSON.stringify({ error: "Invalid request" }), {
        status: 400,
        headers,
      });
    const { data: invite, error } = await client.rpc(
      "nc_prepare_staff_invite",
      { request_id: body.request_id, redirect_origin: body.redirect_to },
    );
    if (error)
      return new Response(JSON.stringify({ error: error.message }), {
        status: 403,
        headers,
      });
    const admin = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const sent = await admin.auth.admin.inviteUserByEmail(invite.email, {
      redirectTo: invite.redirect_to,
      data: { full_name: invite.name },
    });
    if (sent.error) {
      if (
        sent.error.code === "email_exists" ||
        sent.error.message.includes("already been registered")
      )
        return new Response(
          JSON.stringify({
            message:
              "This account already exists. The staff member can sign in and accept the approved invitation in their workspace.",
          }),
          { headers },
        );
      return new Response(
        JSON.stringify({
          error:
            "The invitation could not be delivered. Check the project email configuration and try again.",
        }),
        { status: 502, headers },
      );
    }
    return new Response(
      JSON.stringify({
        message:
          "Invitation sent. The recipient must verify their email, accept the role and enable two-factor authentication.",
      }),
      { headers },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "Unable to process the invitation" }),
      { status: 400, headers },
    );
  }
});
