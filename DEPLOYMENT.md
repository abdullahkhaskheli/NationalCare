# Deployment and ownership

## Connected backend

Project: `acgrqwqvslzlgircbznx` (National Care), region `ap-south-1`.

The six migrations in `supabase/migrations/` have been applied to the connected project. Do not blindly reapply them. The `send-staff-invite` and `upload-medical` Edge Functions are deployed. The pre-existing `public.patient_registry` table was preserved.

The frontend is not published to a public domain. It runs locally with `npm run dev`. A static host should build with `npm ci && npm run build` and publish **dist**, not `dist/client`. The included Netlify configuration supplies this mapping. The included `dist` folder is also a compiled snapshot; rebuilding from source is preferred.

## Required account configuration

In the project's Supabase dashboard:

1. Set Authentication Site URL to your final HTTPS frontend origin. Add exact development and production redirect URLs for sign-up, invitation and recovery.
2. Configure a real SMTP sender and verify delivery to your own address. Email sending to arbitrary recipients was not tested, and Supabase's default sender is unsuitable as a general production mail service.
3. Require confirmed email, minimum password length 12, appropriate rate limits and your selected abuse protection. The local `config.toml` supplies development settings; it does **not** automatically update hosted Auth configuration.
4. Create/verify your personal account. Use its exact Auth UUID with `scripts/bootstrap-admin.sql` from a trusted database-owner session. Never put the database password or service-role key in frontend code.
5. Log in and enable authenticator-app MFA. Activate only institutions you operate or have authorization to enroll. Create and approve the initial hospital staff invitation.
6. Add your exact production origin to `private.allowed_origins` through the database owner's SQL editor, for example `insert into private.allowed_origins(origin) values ('https://your-owned-domain.example');` after replacing the example with the real origin. This allowlist controls staff-invitation redirects independently of Supabase Auth redirects.

Public environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Edge Functions use the server-managed Supabase service credential; never copy it into a VITE variable.

## Static hosting

The application uses hash routes, so bookmarks work without a custom application server. Preserve the security headers in `public/_headers`, or configure equivalent headers on a host that does not read that file. Serve over HTTPS for camera scanning. Host images/fonts locally as included. Do not cache authenticated API responses or private signed file URLs.

## Database and file protection

All exposed application tables have RLS. Direct client mutations are denied; authenticated commands authorize their actor, role, facility and patient relationship. Staff roles require AAL2. Sensitive authorization verifies the JWT session against `auth.sessions`, so removed sessions stop working before JWT expiry.

CNIC is self-declared. The backend stores its last four digits and a peppered SHA-256 fingerprint for uniqueness, not its full plaintext value. This is not NADRA verification.

Medical records are append-only through the application. Amendments reference previous records. Photos and documents are private; signed reads expire after two minutes. Uploads pass a server handler that checks permission, size, type signatures and common active-PDF features. Client code cannot forge server upload attestations. This is not a malware scanner or document authenticity check.

Realtime delivers RLS-authorized changes. The UI refreshes after subscription/reconnection, local mutations and focus, with a 30-second reconciliation interval. Realtime is not the source of truth; PostgreSQL is.

## Operations before clinical launch

Configure monitoring and alerts, test backup restoration of both database and storage, assign incident-response ownership, conduct independent security testing and clinical workflow acceptance, and measure capacity under your expected concurrency. Confirm retention/deletion policies and locally applicable obligations with qualified reviewers. These operational controls have not been configured or certified by the source package.

The connected project uses the free plan. Free quotas and service availability cannot support an unconditional national-scale uptime or never-lost-record guarantee. Select capacity and recovery arrangements based on measured use; no paid services were enabled here.
