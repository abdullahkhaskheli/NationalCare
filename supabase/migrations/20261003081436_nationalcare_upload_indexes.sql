begin;
create index validated_upload_actor_idx on private.validated_uploads(actor_id);
create index validated_upload_patient_idx on private.validated_uploads(patient_id);
commit;
