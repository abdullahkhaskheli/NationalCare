# Implementation boundaries

The application contains functional interconnected workflows, not inactive screen mockups. The following distinctions matter when deciding whether it satisfies your full national healthcare vision.

## Working now

Real Supabase authentication and database commands; 18 role-based workspaces; staff review and role acceptance; staff MFA; facility isolation; patient records and private attachments; separate Health ID; family consent; doctor prescriptions; secure QR lookup; transactional partial/full pharmacy dispensing; stock batches; appointments; laboratory result workflow; audit/notification records; PDF downloads; English/Urdu/Arabic interface with RTL layout; persisted operational request workflows.

## Not implemented or not verified for production

- No NADRA API connection, automatic family tree or government identity verification. Email is verified by Auth; phone is collected and format-checked but SMS ownership is not verified.
- Family sharing covers registered consenting accounts. A legally verified guardianship/minor-dependent registration process is not implemented. A birth/death timeline entry is clinical information, not civil registration.
- Ministry and other authority labels describe roles in your independent platform. No government affiliation, accreditation or institution partnership is established.
- Emergency dispatch is persisted request/decision tracking, not a connection to ambulance operators, GPS dispatch or emergency telephone services.
- Coverage handles claims and decisions, not insurer eligibility/payment integration. Purchase and transfer requests do not implement supplier payments, procurement accounting or automatic inter-facility stock movement.
- Lab/imaging supports orders and verified text results. There is no analyzer interface, DICOM/PACS, FHIR exchange, blood-bank compatibility engine or medical-device ingestion.
- Prescribing uses clinician-entered medicines/directions. There is no certified drug catalogue, interaction engine, dose calculator, controlled-drug service or digital-signature certification.
- Credential review records administrative decisions; it does not query a professional regulator.
- Research approval does not produce a de-identified dataset or automatically grant patient access.
- Dashboard counts use loaded authorized rows, not a national analytics warehouse. Some screens load the first 100 rows; records and operational lists provide more-page controls. Full timeline PDF export and prescription-item/dispensing reads paginate their underlying records.
- Core interface labels are translated. User-entered clinical text and some database validation errors are not automatically translated. Native-language medical terminology and accessibility need specialist acceptance review.
- Upload signature checks/common active-PDF rejection are not full malware scanning. Account email delivery, password recovery emails, real hospital onboarding and live camera behavior on each target mobile device still require deployment acceptance tests.
- Formal penetration testing, national-scale load testing, disaster-recovery drills, clinical certification and regulatory approval have not been completed. No promise of zero bugs or never losing data is made.

These are concrete remaining requirements, not functions silently represented by dummy integrations. Do not place real patient data into service until the relevant controls and reviews are complete.
