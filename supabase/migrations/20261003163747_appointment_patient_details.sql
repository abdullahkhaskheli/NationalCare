begin;
-- Reception may identify booked patients without receiving their medical history.
create function private.appointment_patient_details(appointment_ids uuid[])
returns table(appointment_id uuid,patient_name text,health_id text,phone text,dob date,sex text)
language plpgsql stable security definer set search_path='' as $$
begin
 if private.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 if coalesce(cardinality(appointment_ids),0)>1000 then raise exception 'Too many appointments';end if;
 return query select a.id,p.full_name,p.health_id,p.phone,p.dob,p.sex
 from public.appointments a join public.patients p on p.id=a.patient_id
 where a.id=any(appointment_ids) and (
 private.owns_patient(a.patient_id)
 or private.has_role(array['hospital'],a.facility_id)
 or (a.clinician_id=private.uid() and private.has_role(array['doctor'],a.facility_id)));
end$$;
create function public.nc_appointment_patient_details(appointment_ids uuid[])
returns table(appointment_id uuid,patient_name text,health_id text,phone text,dob date,sex text)
language sql stable security invoker set search_path='' as $$ select * from private.appointment_patient_details(appointment_ids) $$;
revoke all on function private.appointment_patient_details(uuid[]), public.nc_appointment_patient_details(uuid[]) from public,anon;
grant execute on function private.appointment_patient_details(uuid[]), public.nc_appointment_patient_details(uuid[]) to authenticated;
commit;
