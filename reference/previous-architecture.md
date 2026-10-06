# NationalCare concept prototype — architecture note

## Scope and trust boundary

This release is a browser-only concept prototype. It has no trusted server, secure identity provider, database, backup service, or regulated clinical integration. All state is synthetic and stored in the current browser's local storage. The UI and local mock service layer demonstrate intended workflows; they are not production security controls.

## Portal map

| Workspace | Intended scope | Demo pages / actions |
|---|---|---|
| Public information | Public service discovery, notices, aggregate examples | Landing, services, facility finder, health information, public data, help |
| Ministry administration | Registries, organization decisions, configuration and audit | Facility review, workforce status, announcements, analytics, audit |
| District analyst | Assigned district facility and synthetic aggregate view | Coverage, capacity and aggregate indicators |
| Facility administration | One facility tenant | Appointments, services, staff invitations, inventory and activity |
| Clinician | Assigned care relationships and facility workflows | Patient lookup, encounter, prescription, diagnostic order, report and amendment |
| Citizen | Own demo identity | Booking, available record, PDF export, correction, consent and access history |
| Pharmacy | Authorized facility prescription queue | Prescription review and dispense status |
| Laboratory | Orders routed to the affiliated demo lab | Order status, result verification and amendment |
| Support | Case details needed to resolve service requests | Case submission, assignment placeholder and response state |

## Demo authorization rules

The local service layer checks the selected role and organization for mutations. Citizens can book and export only for their own demo patient ID. Clinicians must have an assigned appointment or encounter and provide a purpose before opening a record. Facility administrators are limited to their facility's staff and operations. Pharmacy actions require the facility scope to match the prescription. Laboratory users see orders routed to their demo lab. Ministry users manage organization and platform workflows and use aggregate reports; the Ministry dashboard does not include a patient-record browser. Support accounts have support-case views only.

These checks are useful for exercising prototype flows but can be bypassed by editing browser state. A real service needs authenticated server APIs, tenant isolation, policy evaluation, purpose-of-use checks, token/session lifecycle, privileged access controls, rate limits and security monitoring.

## Entity concepts

The local seed and services model users, roles, organizations, facilities, staff affiliation, appointments, patient demo identities, encounters, prescriptions and dispense state, lab orders/results/amendments, report metadata and versions, corrections, service cases, notifications, consent preferences, public notices, history-export jobs and audit events. Signed encounters and verified results retain amendment chains and provenance. Attached document metadata includes patient and encounter link, category, source, uploader, service date, upload date, verification state, version and supersedes reference.

## Interoperability and production path

Keep the local services as a replaceable seam for future APIs. HL7 FHIR may be assessed for exchange resources such as Patient, Practitioner, Organization, Appointment, Encounter, ServiceRequest, DiagnosticReport, MedicationRequest, MedicationDispense, DocumentReference, Provenance, Consent and AuditEvent. This prototype does not implement or claim FHIR conformance. Terminology, profiles, identity matching and exchange governance need local clinical and technical review.

Before real deployment, verify which federal, provincial, territorial and district bodies own each workflow; applicable privacy, cyber-security, medical-record, retention, prescribing, laboratory, licensing and consent rules; the correct facility/workforce registries; accessibility and language needs; procurement and operational support responsibilities; and permitted emergency messaging. This note is not legal or clinical advice.

## Record preservation and recovery

The product requirement that patient history should not disappear is represented as a design goal, not a zero-loss promise. Production design should use durable versioned records with provenance, integrity checksums for documents, encrypted storage and transport, access-controlled retention, separated encrypted backups, monitored backup health, documented restore rehearsal, migration verification, incident handling, legal holds and recovery objectives approved by real service owners. Restore tests should confirm record and attachment integrity together. Local storage in this prototype is neither backed up nor durable enough for clinical use.

## PDF export boundary

Citizen export is a point-in-time browser-generated PDF from records authorized to that citizen demo account. The manifest shows included categories and date scope. The export explicitly says NationalCare may not contain records held elsewhere and labels imported or unverified documents. A production export service would need server-side authorization, job tracking, secure temporary storage and expiry, audit, access-limited download delivery, and robust PDF generation.
