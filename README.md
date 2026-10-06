# NationalCare

A connected healthcare web application with 18 role-based workspaces, English/Urdu/Arabic, a Pakistan hospital directory, and a live Supabase backend.

## Run on your computer

1. Install Node.js 24 LTS.
2. Extract this project, open its `nationalcare` folder in VS Code, and open a terminal there.
3. Run `npm ci`, then `npm run dev`.
4. Open **http://localhost:5173**. Keep the terminal open.

The included `.env.local` contains your connected project's public URL and publishable key. It contains **no service-role key**. These public settings are meant for the browser; database policies enforce access.

For an optimized build: `npm run build`. To inspect that build locally: `npm run preview`.

## What is implemented

| # | Workspace | Implemented workflows |
|---|---|---|
| 1 | Public services | Discovery slides, hospital search/location filter, real institution links/logos, FAQs, language switching |
| 2 | Patient | Email authentication, self-declared CNIC registration, separate Health ID, photo, contact details, appointments, clinical timeline, prescriptions, private uploads, PDFs, notifications, activity log |
| 3 | Family & guardians | Health-ID invitations, accept/decline, explicit record sharing, revocation, authorized family records |
| 4 | Doctor | Consented patient selection, clinical entries/amendments, prescriptions, cancellation, QR/PDF, appointments, lab orders, attachments |
| 5 | Hospital | Appointment assignment/status, staff requests/invitations/revocation, admissions and bed conflict protection, referrals, theatre requests |
| 6 | Community health | Outreach requests, consented clinical records, attachments |
| 7 | Pharmacy | Camera/manual QR lookup, scoped prescription access, allergy summary, stock batches/expiry, transactional partial/full dispensing |
| 8 | Laboratory & imaging | Orders, collection, processing, verified result entered into the patient timeline |
| 9 | Emergency | Dispatch request tracking and handover notes; consented records |
| 10 | Provincial health | Province-scoped inspections, decisions, institution directory |
| 11 | Ministry administration | Facility activation/suspension, facility applications, staff review, announcements, audit oversight |
| 12 | Public health | Surveillance reports, quantity/category/location and response tracking |
| 13 | Supply chain | Stock, purchase requests, transfer requests and approval tracking |
| 14 | Coverage | Claim submission, amount/category, review and decisions |
| 15 | Provider registry | Credential requests, expiry details, review and decisions |
| 16 | Workforce | Training requests, scheduling details, review and completion |
| 17 | Research | Purpose-based data requests, review and decisions; no automatic release of identifiable records |
| 18 | Support | Facility-routed complaints, correspondence, decisions and resolution |

Operational requests use checked transitions: submitted → in review → approved → in progress → completed, with rejection, information requests and permitted cancellation. Decisions and comments are persisted in an activity timeline.

## Connected prescription workflow

An approved doctor with an active care relationship issues the prescription. The patient's authenticated Realtime subscription refreshes the prescription list. The patient or doctor generates a limited-lifetime QR token. An approved, MFA-authenticated pharmacist scans it, sees the authorized prescription and allergy summary, selects valid stock, and records quantities supplied. The database locks prescription and stock rows, rejects over-dispensing, and prevents duplicate submission using an idempotency key. Partial dispensing remains visible; completing all quantities shows dispensed. Cancellation invalidates QR tokens.

A QR provides access to its prescription, **not unrestricted access to every medicine or medical record in the patient's life**. Lifetime records are available to their owner and explicitly authorized care/family relationships.

## First administrator and real staff

There are no shared default passwords or seeded real staff accounts. Register and confirm your own email first. The database owner must grant that exact verified Auth user the initial `ministry` role; `scripts/bootstrap-admin.sql` contains the command. Enable TOTP two-factor authentication before using staff workspaces.

The administrator activates an actual participating facility and appoints its hospital administrator. The hospital requests staff access; Ministry administration approves it; the hospital sends the approved email invitation. The recipient confirms email, sets a personal password, accepts the invitation, and enables MFA. Roles cannot be selected during public signup.

The four named Pakistani hospitals are **directory entries**, not enrolled partners. They remain inactive for appointment booking until explicitly activated by your administrator.

## Verification performed

- Production TypeScript/Vite build.
- PostgreSQL migration and authorization tests with PGlite: patient isolation, MFA, staff approval/revocation, consent, QR scope, dispensing/idempotency/rollback, laboratory results, upload attestation, operational workflow transitions, provincial/facility isolation and duplicate-bed prevention.
- Four public browser tests: directory, FAQ, sliders, 18 portals, all three languages, mobile overflow and protected routes.
- Two authenticated browser tests against actual Supabase responses: patient photo/prescriptions/PDF and doctor authorization.
- Live Supabase test with isolated synthetic accounts: real Auth, TOTP, prescription Realtime delivery, unrelated-account isolation, QR dispensing Realtime delivery, valid/invalid private uploads.
- Production dependency audit reported zero known vulnerabilities at the time of testing. Supabase security advisor reported no warnings/errors in the new application schema; the pre-existing `patient_registry` table has an informational no-policy finding and remains untouched.

Run `npm test` for database tests. Start the app, install Chromium with `npx playwright install chromium`, then run `npm run test:e2e` for browser tests. Authenticated tests require an explicitly supplied synthetic test fixture and skip when it is absent. `tests/live.mjs` is an operator-run integration test, not a public signup or administrator bypass.

## Deployment and remaining work

Read **DEPLOYMENT.md** before deployment and **READINESS.md** for the exact implementation boundaries. This is working application source and a deployed backend, but it is **not certified or cleared for national-scale clinical production**. Frontend hosting, owner activation, operational configuration and independent clinical/security acceptance remain outstanding.

Your original starter files are preserved in `reference/`. Source is in `src/`, tracked schema changes in `supabase/migrations/`, and server handlers in `supabase/functions/`.
