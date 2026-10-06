begin;
-- Public directory entries; none claims institutional participation.
insert into public.facilities(name,city,province,address,website,logo)
select v.* from (values
('Aga Khan University Hospital','Karachi','Sindh','Stadium Road, Karachi','https://hospitals.aku.edu/pakistan/facility/akuh-main-campus','/assets/aku.svg'),
('Shaukat Khanum Memorial Cancer Hospital','Lahore','Punjab','7A Block R-3, Johar Town, Lahore','https://shaukatkhanum.org.pk/contact-us/','/assets/shaukat.webp'),
('Pakistan Institute of Medical Sciences','Islamabad','Islamabad Capital Territory','Ibn-e-Sina Road, G-8/3, Islamabad','https://pims.gov.pk/ContactUs.php','/assets/pims.png'),
('Sindh Institute of Urology and Transplantation','Karachi','Sindh','Chand Bibi Road, Karachi','https://siut.org/','/assets/siut.png')
) as v(name,city,province,address,website,logo) where not exists(select 1 from public.facilities f where f.name=v.name);
-- Explicit denial documents that private state is callable only through checked routines.
create policy deny_direct_identity on private.identities for all to authenticated using(false) with check(false);
create policy deny_direct_settings on private.identity_settings for all to authenticated using(false) with check(false);
create policy deny_direct_membership on private.memberships for all to authenticated using(false) with check(false);
create policy deny_direct_rx_access on private.rx_access for all to authenticated using(false) with check(false);
create policy deny_direct_rx_tokens on private.rx_tokens for all to authenticated using(false) with check(false);
-- Requests are constrained server-side, including required fields and valid amounts.
create function private.validate_work() returns trigger language plpgsql security invoker set search_path='' as $$
declare required text[]; field text;
begin
 required:=case new.kind
 when 'admission' then array['bed','contact','targetDate'] when 'referral' then array['contact','targetDate'] when 'theatre' then array['bed','clinician','targetDate']
 when 'outreach' then array['address','contact','targetDate'] when 'ambulance' then array['address','contact','priority'] when 'inspection' then array['address','targetDate']
 when 'surveillance' then array['category','address','quantity','targetDate'] when 'purchase' then array['medicine','quantity','amount','targetDate'] when 'transfer' then array['medicine','quantity','address']
 when 'claim' then array['amount','category'] when 'credential' then array['credential','expiry'] when 'training' then array['category','contact','targetDate']
 when 'research' then array['purpose','targetDate'] when 'complaint' then array['category','contact'] when 'facility_application' then array['address','city','province','contact','credential'] end;
 foreach field in array required loop if length(trim(coalesce(new.details->>field,'')))=0 then raise exception 'Required field: %',field;end if;end loop;
 if new.details ? 'quantity' and (new.details->>'quantity' !~ '^[0-9]+$' or (new.details->>'quantity')::integer<=0) then raise exception 'Quantity must be positive';end if;
 if new.details ? 'amount' and (new.details->>'amount' !~ '^[0-9]+(\.[0-9]{1,2})?$' or (new.details->>'amount')::numeric<=0) then raise exception 'Amount must be positive';end if;
 return new;
end$$;
create trigger validate_work before insert or update on public.work_items for each row execute function private.validate_work();
-- Approval of a reviewed facility application creates its institution record.
create function private.activate_facility_application() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if private.uid() is null or not private.has_role(array['ministry']) then raise exception 'Ministry authorization required';end if;
 if new.kind='facility_application' and new.status='approved' and old.status<>new.status then
 insert into public.facilities(name,city,province,address,kind,status) values(new.title,new.details->>'city',new.details->>'province',new.details->>'address',coalesce(new.details->>'kind','hospital'),'active');
 end if;return new;
end$$;
create trigger activate_facility_application after update on public.work_items for each row when(new.kind='facility_application' and new.status='approved') execute function private.activate_facility_application();
-- Prevent concurrent active admissions using the same named bed.
create unique index active_bed_unique on public.work_items(facility_id,(lower(details->>'bed'))) where kind='admission' and status in ('approved','in_progress');
alter table public.staff_requests add column invited_at timestamptz;
create table private.allowed_origins(origin text primary key);
insert into private.allowed_origins values('http://localhost:5173'),('http://127.0.0.1:5173');
alter table private.allowed_origins enable row level security;
create policy deny_direct_origins on private.allowed_origins for all to authenticated using(false) with check(false);
-- Trusted server only; per-caller authorization still happens inside this routine.
create function private.prepare_staff_invite(request_id uuid,redirect_origin text) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.staff_requests;
begin
 if private.uid() is null then raise exception 'Sign in required';end if;
 select * into r from public.staff_requests where id=request_id for update;
 if not found or r.status<>'approved' or not(private.has_role(array['ministry']) or private.has_role(array['hospital'],r.facility_id)) then raise exception 'Approved invitation and authorized administrator required';end if;
 if not exists(select 1 from private.allowed_origins where origin=redirect_origin) then raise exception 'Application origin is not approved';end if;
 if r.invited_at>now()-interval '2 minutes' then raise exception 'Wait two minutes before resending';end if;
 update public.staff_requests set invited_at=now() where id=request_id;
 insert into public.audit_events(actor_id,action,entity_id) values(private.uid(),'staff_invite_requested',request_id);
 return jsonb_build_object('email',r.email,'name',r.full_name,'redirect_to',redirect_origin||'/#workspace/patient');
end$$;
create function public.nc_prepare_staff_invite(request_id uuid,redirect_origin text) returns jsonb language sql security invoker set search_path='' as $$select private.prepare_staff_invite(request_id,redirect_origin)$$;
revoke all on function private.prepare_staff_invite(uuid,text),public.nc_prepare_staff_invite(uuid,text),private.activate_facility_application(),private.validate_work() from public,anon;
grant execute on function private.prepare_staff_invite(uuid,text),public.nc_prepare_staff_invite(uuid,text) to authenticated;
-- Complete FK indexes for common RLS and join paths.
create index if not exists appointment_clinician_idx on public.appointments(clinician_id);
create index if not exists records_facility_idx on public.records(facility_id);
create index if not exists records_author_idx on public.records(author_id);
create index if not exists records_supersedes_idx on public.records(supersedes);
create index if not exists rx_clinician_idx on public.prescriptions(clinician_id);
create index if not exists rx_facility_idx on public.prescriptions(facility_id);
create index if not exists dispense_pharmacy_idx on public.dispenses(pharmacy_id);
create index if not exists dispense_pharmacist_idx on public.dispenses(pharmacist_id);
create index if not exists dispense_header_idx on public.dispense_items(dispense_id);
create index if not exists dispense_stock_idx on public.dispense_items(stock_id);
create index if not exists lab_requester_idx on public.lab_orders(requested_by);
create index if not exists lab_result_idx on public.lab_orders(result_id);
create index if not exists document_uploader_idx on public.documents(uploaded_by);
create index if not exists staff_requester_idx on public.staff_requests(requested_by);
create index if not exists staff_reviewer_idx on public.staff_requests(reviewed_by);
create index if not exists staff_user_idx on public.staff_requests(user_id);
create index if not exists work_patient_idx on public.work_items(patient_id);
create index if not exists event_actor_idx on public.work_events(actor_id);
create index if not exists audit_actor_idx on public.audit_events(actor_id);
create index if not exists member_facility_idx on private.memberships(facility_id);
create index if not exists token_rx_idx on private.rx_tokens(prescription_id);
create index if not exists token_creator_idx on private.rx_tokens(created_by);
create index if not exists access_user_idx on private.rx_access(user_id);
commit;
