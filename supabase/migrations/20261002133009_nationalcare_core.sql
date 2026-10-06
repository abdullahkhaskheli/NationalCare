-- NationalCare: authenticated commands, private authorization, immutable clinical events.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
create table public.facilities(id uuid primary key default gen_random_uuid(), name text not null, city text not null, province text not null, address text not null default '', website text not null default '', logo text, kind text not null default 'hospital' check(kind in ('hospital','clinic','pharmacy','laboratory','authority')), status text not null default 'directory' check(status in ('directory','pending','active','suspended')), created_at timestamptz not null default now());
create table public.profiles(id uuid primary key references auth.users(id), full_name text not null, locale text not null default 'en' check(locale in ('en','ur','ar')), phone text, created_at timestamptz not null default now());
create table private.memberships(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), role text not null check(role in ('ministry','province','hospital','doctor','community','pharmacy','laboratory','emergency','surveillance','supply','coverage','registry','workforce','research','support')), facility_id uuid references public.facilities(id), province text, active boolean not null default true, created_at timestamptz not null default now());
create unique index membership_unique on private.memberships(user_id,role,coalesce(facility_id,'00000000-0000-0000-0000-000000000000'::uuid));
create table public.patients(id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references auth.users(id), health_id text not null unique default ('NC-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16))), full_name text not null, dob date not null check(dob <= current_date), sex text not null check(sex in ('female','male','other','unspecified')), phone text not null, cnic_last4 text not null check(cnic_last4 ~ '^[0-9]{4}$'), identity_status text not null default 'self_declared' check(identity_status in ('self_declared','reviewed')), photo_path text, emergency_contact text not null default '', created_at timestamptz not null default now());
create table private.identity_settings(id boolean primary key default true check(id), pepper text not null);
insert into private.identity_settings values(true,gen_random_uuid()::text||gen_random_uuid()::text);
create table private.identities(patient_id uuid primary key references public.patients(id), fingerprint text unique not null);
create table public.care_grants(id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id), user_id uuid not null references auth.users(id), expires_at timestamptz not null, created_at timestamptz not null default now(), unique(patient_id,user_id));
create table public.family_links(id uuid primary key default gen_random_uuid(), inviter_id uuid not null references public.patients(id), invitee_id uuid not null references public.patients(id), relationship text not null check(length(relationship) between 2 and 60), status text not null default 'pending' check(status in ('pending','accepted','declined','revoked')), share_records boolean not null default false, created_at timestamptz not null default now(), check(inviter_id<>invitee_id),unique(inviter_id,invitee_id));
create table public.appointments(id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id), facility_id uuid not null references public.facilities(id), clinician_id uuid references auth.users(id), starts_at timestamptz not null, service text not null, status text not null default 'requested' check(status in ('requested','confirmed','arrived','completed','cancelled')), created_at timestamptz not null default now());
create unique index clinician_slot on public.appointments(clinician_id,starts_at) where status in ('confirmed','arrived');
create table public.records(id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id), facility_id uuid references public.facilities(id), author_id uuid not null references auth.users(id), kind text not null check(kind in ('encounter','allergy','condition','vaccination','vitals','procedure','discharge','lab_result','care_plan','birth','death','amendment')), title text not null check(length(title) between 1 and 200), body text not null check(length(body) between 1 and 20000), supersedes uuid references public.records(id), created_at timestamptz not null default now());
create table public.prescriptions(id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id), clinician_id uuid not null references auth.users(id), facility_id uuid not null references public.facilities(id), notes text not null default '', valid_until timestamptz not null, status text not null default 'issued' check(status in ('issued','cancelled')), cancellation_reason text, created_at timestamptz not null default now());
create table public.prescription_items(id uuid primary key default gen_random_uuid(), prescription_id uuid not null references public.prescriptions(id), medicine text not null, strength text not null, dose text not null, route text not null, frequency text not null, duration text not null, quantity integer not null check(quantity between 1 and 10000), instructions text not null default '');
create table private.rx_tokens(hash text primary key, prescription_id uuid not null references public.prescriptions(id), expires_at timestamptz not null, created_by uuid not null references auth.users(id));
create table private.rx_access(prescription_id uuid not null references public.prescriptions(id), user_id uuid not null references auth.users(id), expires_at timestamptz not null,primary key(prescription_id,user_id));
create table public.stock(id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id), medicine text not null, strength text not null, batch text not null, expires_on date not null, quantity integer not null check(quantity>=0), unit text not null default 'unit', unique(facility_id,medicine,strength,batch));
create table public.dispenses(id uuid primary key default gen_random_uuid(), prescription_id uuid not null references public.prescriptions(id), pharmacy_id uuid not null references public.facilities(id), pharmacist_id uuid not null references auth.users(id), request_id uuid not null unique, created_at timestamptz not null default now());
create table public.dispense_items(id uuid primary key default gen_random_uuid(), dispense_id uuid not null references public.dispenses(id), prescription_item_id uuid not null references public.prescription_items(id), stock_id uuid not null references public.stock(id), quantity integer not null check(quantity>0));
create table public.lab_orders(id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id), facility_id uuid not null references public.facilities(id), requested_by uuid not null references auth.users(id), test text not null, instructions text not null default '', status text not null default 'ordered' check(status in ('ordered','collected','processing','verified','cancelled')), result_id uuid references public.records(id),created_at timestamptz not null default now());
create table public.documents(id uuid primary key default gen_random_uuid(), patient_id uuid not null references public.patients(id), uploaded_by uuid not null references auth.users(id), name text not null, path text not null unique, mime text not null check(mime in ('application/pdf','image/jpeg','image/png')), bytes integer not null check(bytes between 1 and 10485760), source text not null default 'patient_upload',created_at timestamptz not null default now());
create table public.staff_requests(id uuid primary key default gen_random_uuid(), facility_id uuid not null references public.facilities(id), email text not null, full_name text not null, role text not null check(role in ('hospital','doctor','community','pharmacy','laboratory','emergency','surveillance','supply','coverage','registry','workforce','research','support','province')), credential text not null, requested_by uuid not null references auth.users(id), status text not null default 'pending' check(status in ('pending','approved','rejected','active','revoked')), reviewed_by uuid references auth.users(id), review_note text, user_id uuid references auth.users(id),created_at timestamptz not null default now());
create unique index staff_pending_unique on public.staff_requests(facility_id,lower(email),role) where status in ('pending','approved','active');
create table public.work_items(id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('admission','referral','theatre','outreach','ambulance','inspection','surveillance','purchase','transfer','claim','credential','training','research','complaint','facility_application')), facility_id uuid references public.facilities(id), province text not null default '', patient_id uuid references public.patients(id), created_by uuid not null references auth.users(id), title text not null check(length(title) between 3 and 200), details jsonb not null default '{}', status text not null default 'submitted', created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.work_events(id uuid primary key default gen_random_uuid(), work_item_id uuid not null references public.work_items(id), actor_id uuid not null references auth.users(id), status text not null, note text not null default '',created_at timestamptz not null default now());
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id), title text not null, target_id uuid, read_at timestamptz,created_at timestamptz not null default now());
create table public.audit_events(id bigint generated always as identity primary key, actor_id uuid not null references auth.users(id), action text not null, patient_id uuid references public.patients(id), entity_id uuid,created_at timestamptz not null default now());
create table public.announcements(id uuid primary key default gen_random_uuid(), title text not null, body text not null, published boolean not null default true,created_at timestamptz not null default now());
-- Helpers do not trust editable user_metadata or client-supplied roles.
create function private.uid() returns uuid language sql stable security definer set search_path='' as $$ select auth.uid() where exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id') $$;
create function private.has_role(roles text[],fac uuid default null) returns boolean language sql stable security definer set search_path='' as $$ select private.uid() is not null and coalesce(auth.jwt()->>'aal','')='aal2' and exists(select 1 from private.memberships m where m.user_id=private.uid() and m.active and m.role=any(roles) and (fac is null or m.facility_id=fac) and (m.facility_id is null or exists(select 1 from public.facilities f where f.id=m.facility_id and f.status='active'))) $$;
create function private.owns_patient(pid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.patients p where p.id=pid and p.owner_id=private.uid()) $$;
create function private.can_read_patient(pid uuid) returns boolean language sql stable security definer set search_path='' as $$ select private.owns_patient(pid) or exists(select 1 from public.care_grants g where g.patient_id=pid and g.user_id=private.uid() and g.expires_at>now() and private.has_role(array['doctor','community','emergency'])) or exists(select 1 from public.family_links l join public.patients p on p.id=l.invitee_id where l.inviter_id=pid and l.status='accepted' and l.share_records and p.owner_id=private.uid()) $$;
create function private.can_read_rx(rid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.prescriptions r where r.id=rid and (private.can_read_patient(r.patient_id) or (r.clinician_id=private.uid() and private.has_role(array['doctor'],r.facility_id)))) or exists(select 1 from private.rx_access x where x.prescription_id=rid and x.user_id=private.uid() and x.expires_at>now() and private.has_role(array['pharmacy'])) $$;
create function private.work_role(k text) returns text language sql immutable set search_path='' as $$ select case k when 'admission' then 'hospital' when 'referral' then 'hospital' when 'theatre' then 'hospital' when 'outreach' then 'community' when 'ambulance' then 'emergency' when 'inspection' then 'province' when 'surveillance' then 'surveillance' when 'purchase' then 'supply' when 'transfer' then 'supply' when 'claim' then 'coverage' when 'credential' then 'registry' when 'training' then 'workforce' when 'research' then 'research' when 'complaint' then 'support' when 'facility_application' then 'ministry' end $$;
create function private.can_manage_work(k text,fac uuid,prov text) returns boolean language sql stable security definer set search_path='' as $$ select private.has_role(array[private.work_role(k)],fac) or (k='inspection' and private.has_role(array['province']) and exists(select 1 from private.memberships m where m.user_id=private.uid() and m.active and m.role='province' and m.province=prov)) $$;
create function private.can_read_work(wid uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.work_items w where w.id=wid and (w.created_by=private.uid() or private.owns_patient(w.patient_id) or private.can_manage_work(w.kind,w.facility_id,w.province))) $$;
-- Read-only Data API. All mutation is through the checked command function.
create function private.command(action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=private.uid(); pid uuid; fid uuid; rid uuid; eid uuid; tok text; rowdata record; item jsonb; sid uuid; qty integer; remaining integer; oldstatus text; newstatus text; k text; result jsonb:='{}';
begin
 if u is null then raise exception 'Your session has ended. Please sign in again.' using errcode='42501'; end if;
 if not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Confirm your email address first.'; end if;
 if octet_length(p::text)>100000 then raise exception 'Request too large'; end if;
 case action
 when 'session' then
  select jsonb_build_object('user_id',u,'profile',(select to_jsonb(x) from public.profiles x where id=u),'patient',(select to_jsonb(x) from public.patients x where owner_id=u),'memberships',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'role',m.role,'facility_id',m.facility_id,'province',m.province,'name',f.name)) from private.memberships m left join public.facilities f on f.id=m.facility_id where m.user_id=u and m.active),'[]'::jsonb)) into result;
 when 'profile' then
  if length(trim(p->>'full_name')) not between 2 and 150 then raise exception 'Enter your full name';end if;
  insert into public.profiles(id,full_name,locale,phone) values(u,trim(p->>'full_name'),coalesce(p->>'locale','en'),p->>'phone') on conflict(id) do update set full_name=excluded.full_name,locale=excluded.locale,phone=excluded.phone;
 when 'register_patient' then
  if coalesce(p->>'cnic','') !~ '^[0-9]{13}$' or coalesce(p->>'phone','') !~ '^\+[1-9][0-9]{7,14}$' or length(trim(p->>'full_name')) not between 2 and 150 then raise exception 'Enter a 13-digit CNIC, full name and international phone number';end if;
  insert into public.patients(owner_id,full_name,dob,sex,phone,cnic_last4,emergency_contact) values(u,trim(p->>'full_name'),(p->>'dob')::date,p->>'sex',p->>'phone',right(p->>'cnic',4),coalesce(p->>'emergency_contact','')) returning id into pid;
  insert into private.identities(patient_id,fingerprint) select pid,encode(sha256(convert_to((p->>'cnic')||pepper,'UTF8')),'hex') from private.identity_settings;
  insert into public.profiles(id,full_name,phone) values(u,p->>'full_name',p->>'phone') on conflict(id) do nothing;
  result:=jsonb_build_object('id',pid);
 when 'update_patient' then
  pid:=(p->>'patient_id')::uuid;if not private.owns_patient(pid) then raise exception 'Not permitted' using errcode='42501';end if;
  update public.patients set phone=coalesce(p->>'phone',phone),emergency_contact=coalesce(p->>'emergency_contact',emergency_contact) where id=pid;
 when 'family_invite' then
  select id into pid from public.patients where owner_id=u;
  select id into eid from public.patients where health_id=upper(trim(p->>'health_id'));
  if pid is null or eid is null or pid=eid then raise exception 'Cannot create this family invitation. Check the Health ID.';end if;
  insert into public.family_links(inviter_id,invitee_id,relationship,share_records) values(pid,eid,p->>'relationship',false) returning id into rid;
  insert into public.notifications(user_id,title,target_id) select owner_id,'family_invitation',rid from public.patients where id=eid;
 when 'family_respond' then
  select * into rowdata from public.family_links where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;
  if not private.owns_patient(rowdata.invitee_id) or rowdata.status<>'pending' then raise exception 'Not permitted';end if;
  update public.family_links set status=case when (p->>'accept')::boolean then 'accepted' else 'declined' end where id=rowdata.id;
 when 'family_sharing' then
  select * into rowdata from public.family_links where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;
  if not private.owns_patient(rowdata.inviter_id) or rowdata.status<>'accepted' then raise exception 'Only the record owner can change sharing';end if;
  update public.family_links set share_records=(p->>'enabled')::boolean where id=rowdata.id;
 when 'family_revoke' then
  select * into rowdata from public.family_links where id=(p->>'id')::uuid; if not found then raise exception 'Record not found';end if;
  if not(private.owns_patient(rowdata.inviter_id) or private.owns_patient(rowdata.invitee_id)) then raise exception 'Not permitted';end if;
  update public.family_links set status='revoked',share_records=false where id=rowdata.id;
 when 'family_list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'relationship',l.relationship,'status',l.status,'share_records',l.share_records,'outgoing',private.owns_patient(l.inviter_id),'member_name',q.full_name,'health_id',q.health_id,'patient_id',q.id)),'[]') into result from public.family_links l join public.patients q on q.id=case when private.owns_patient(l.inviter_id) then l.invitee_id else l.inviter_id end where (private.owns_patient(l.inviter_id) or private.owns_patient(l.invitee_id));
 when 'grant_care' then
  pid:=(p->>'patient_id')::uuid; eid:=(p->>'user_id')::uuid;
  if not private.owns_patient(pid) or not exists(select 1 from private.memberships m join public.facilities f on f.id=m.facility_id where m.user_id=eid and m.active and m.role in ('doctor','community','emergency') and f.status='active') then raise exception 'Not permitted';end if;
  insert into public.care_grants(patient_id,user_id,expires_at) values(pid,eid,now()+interval '30 days') on conflict(patient_id,user_id) do update set expires_at=excluded.expires_at;
 when 'revoke_care' then
  pid:=(p->>'patient_id')::uuid;if not private.owns_patient(pid) then raise exception 'Not permitted';end if;
  delete from public.care_grants where patient_id=pid and user_id=(p->>'user_id')::uuid;
 when 'book_appointment' then
  pid:=(p->>'patient_id')::uuid;fid:=(p->>'facility_id')::uuid;
  if not private.owns_patient(pid) or not exists(select 1 from public.facilities where id=fid and status='active' and kind in ('hospital','clinic')) then raise exception 'Choose an active facility and your own patient profile';end if;
  if (p->>'starts_at')::timestamptz<now() then raise exception 'Choose a future appointment';end if;
  insert into public.appointments(patient_id,facility_id,starts_at,service) values(pid,fid,(p->>'starts_at')::timestamptz,p->>'service') returning id into rid;
 when 'appointment_status' then
  select * into rowdata from public.appointments where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;
  newstatus:=p->>'status';pid:=rowdata.patient_id;
  if not (private.has_role(array['hospital'],rowdata.facility_id) or (rowdata.clinician_id=u and private.has_role(array['doctor'],rowdata.facility_id)) or (private.owns_patient(pid) and newstatus='cancelled')) then raise exception 'Not permitted';end if;
  if not ((rowdata.status='requested' and newstatus in ('confirmed','cancelled')) or (rowdata.status='confirmed' and newstatus in ('arrived','cancelled')) or (rowdata.status='arrived' and newstatus in ('completed','cancelled'))) then raise exception 'Invalid appointment transition';end if;
  eid:=coalesce(nullif(p->>'clinician_id','')::uuid,rowdata.clinician_id);
  if newstatus='confirmed' then
   if eid is null or not exists(select 1 from private.memberships where user_id=eid and role='doctor' and active and facility_id=rowdata.facility_id) then raise exception 'Assign an approved clinician';end if;
   insert into public.care_grants(patient_id,user_id,expires_at) values(pid,eid,greatest(rowdata.starts_at,now())+interval '30 days') on conflict(patient_id,user_id) do update set expires_at=greatest(public.care_grants.expires_at,excluded.expires_at);
  end if;
  update public.appointments set status=newstatus,clinician_id=eid where id=rowdata.id;
  insert into public.notifications(user_id,title,target_id) select owner_id,'appointment_updated',rowdata.id from public.patients where id=pid;
 when 'clinical_record' then
  pid:=(p->>'patient_id')::uuid;fid:=(p->>'facility_id')::uuid;
  if not private.can_read_patient(pid) or not private.has_role(array['doctor','community'],fid) then raise exception 'An active care relationship is required';end if;
  if p->>'kind'='lab_result' then raise exception 'Use verified laboratory workflow';end if;
  if nullif(p->>'supersedes','') is not null and not exists(select 1 from public.records where id=(p->>'supersedes')::uuid and patient_id=pid) then raise exception 'Invalid amendment target';end if;
  insert into public.records(patient_id,facility_id,author_id,kind,title,body,supersedes) values(pid,fid,u,p->>'kind',p->>'title',p->>'body',nullif(p->>'supersedes','')::uuid) returning id into rid;
  insert into public.notifications(user_id,title,target_id) select owner_id,'record_added',rid from public.patients where id=pid;
 when 'prescribe' then
  pid:=(p->>'patient_id')::uuid;fid:=(p->>'facility_id')::uuid;
  if not private.can_read_patient(pid) or not private.has_role(array['doctor'],fid) then raise exception 'Not permitted';end if;
  if jsonb_array_length(p->'items') not between 1 and 30 or (p->>'valid_until')::timestamptz<=now() or (p->>'valid_until')::timestamptz>now()+interval '366 days' then raise exception 'Invalid prescription';end if;
  insert into public.prescriptions(patient_id,clinician_id,facility_id,notes,valid_until) values(pid,u,fid,coalesce(p->>'notes',''),(p->>'valid_until')::timestamptz) returning id into rid;
  for item in select * from jsonb_array_elements(p->'items') loop
   if coalesce(item->>'medicine','')='' or coalesce(item->>'dose','')='' or coalesce(item->>'frequency','')='' or coalesce(item->>'duration','')='' then raise exception 'Complete all medicine directions';end if;
   insert into public.prescription_items(prescription_id,medicine,strength,dose,route,frequency,duration,quantity,instructions) values(rid,item->>'medicine',item->>'strength',item->>'dose',item->>'route',item->>'frequency',item->>'duration',(item->>'quantity')::integer,coalesce(item->>'instructions',''));
  end loop;
  insert into public.notifications(user_id,title,target_id) select owner_id,'prescription_issued',rid from public.patients where id=pid;
  result:=jsonb_build_object('id',rid);
 when 'cancel_prescription' then
  select * into rowdata from public.prescriptions where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;
  if rowdata.clinician_id<>u or not private.has_role(array['doctor'],rowdata.facility_id) or length(coalesce(p->>'reason',''))<3 then raise exception 'Only the prescriber may cancel, with a reason';end if;
  update public.prescriptions set status='cancelled',cancellation_reason=p->>'reason' where id=rowdata.id;
  delete from private.rx_tokens where prescription_id=rowdata.id;
  delete from private.rx_access where prescription_id=rowdata.id;
  pid:=rowdata.patient_id;
  insert into public.notifications(user_id,title,target_id) select owner_id,'prescription_cancelled',rowdata.id from public.patients where id=pid;
 when 'prescription_qr' then
  select * into rowdata from public.prescriptions where id=(p->>'id')::uuid; if not found then raise exception 'Record not found';end if;
  if not(private.owns_patient(rowdata.patient_id) or (rowdata.clinician_id=u and private.has_role(array['doctor'],rowdata.facility_id))) or rowdata.status<>'issued' or rowdata.valid_until<=now() then raise exception 'Prescription cannot be shared';end if;
  tok:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  delete from private.rx_tokens where prescription_id=rowdata.id;
  insert into private.rx_tokens values(encode(sha256(convert_to(tok,'UTF8')),'hex'),rowdata.id,least(rowdata.valid_until,now()+interval '7 days'),u);
  result:=jsonb_build_object('token',tok,'expires_at',least(rowdata.valid_until,now()+interval '7 days'));
 when 'scan_prescription' then
  if not private.has_role(array['pharmacy']) then raise exception 'Pharmacist access required';end if;
  select r.* into rowdata from private.rx_tokens t join public.prescriptions r on r.id=t.prescription_id where t.hash=encode(sha256(convert_to(p->>'token','UTF8')),'hex') and t.expires_at>now() and r.status='issued' and r.valid_until>now();
  if rowdata.id is null then raise exception 'This prescription code is invalid, expired or cancelled';end if;
  insert into private.rx_access values(rowdata.id,u,now()+interval '30 minutes') on conflict(prescription_id,user_id) do update set expires_at=excluded.expires_at;
  result:=jsonb_build_object('id',rowdata.id,'patient_name',(select full_name from public.patients where id=rowdata.patient_id),'health_id',(select health_id from public.patients where id=rowdata.patient_id),'allergies',coalesce((select jsonb_agg(jsonb_build_object('title',title,'body',body)) from public.records where patient_id=rowdata.patient_id and kind='allergy'),'[]'));
  pid:=rowdata.patient_id;
 when 'stock_add' then
  fid:=(p->>'facility_id')::uuid;
  if not private.has_role(array['pharmacy','supply'],fid) or (p->>'quantity')::integer<=0 or (p->>'expires_on')::date<=current_date then raise exception 'Invalid stock or not permitted';end if;
  insert into public.stock(facility_id,medicine,strength,batch,expires_on,quantity,unit) values(fid,p->>'medicine',p->>'strength',p->>'batch',(p->>'expires_on')::date,(p->>'quantity')::integer,coalesce(p->>'unit','unit')) on conflict(facility_id,medicine,strength,batch) do update set quantity=public.stock.quantity+excluded.quantity;
 when 'dispense' then
  rid:=(p->>'prescription_id')::uuid;fid:=(p->>'facility_id')::uuid;
  if not private.has_role(array['pharmacy'],fid) or not private.can_read_rx(rid) then raise exception 'Scan an authorised prescription first';end if;
  select * into rowdata from public.prescriptions where id=rid for update; if not found then raise exception 'Record not found';end if;
  if rowdata.status<>'issued' or rowdata.valid_until<=now() then raise exception 'Prescription is no longer valid';end if;
  if exists(select 1 from public.dispenses where request_id=(p->>'request_id')::uuid and pharmacist_id=u and prescription_id=rid) then return jsonb_build_object('already_processed',true);end if;
  if jsonb_array_length(p->'items') not between 1 and 30 then raise exception 'Select medicines to dispense';end if;
  insert into public.dispenses(prescription_id,pharmacy_id,pharmacist_id,request_id) values(rid,fid,u,(p->>'request_id')::uuid) returning id into eid;
  for item in select * from jsonb_array_elements(p->'items') loop
   sid:=(item->>'stock_id')::uuid;qty:=(item->>'quantity')::integer;
   select * into rowdata from public.stock where id=sid and facility_id=fid for update; if not found then raise exception 'Record not found';end if;
   if rowdata.id is null or rowdata.expires_on<=current_date or rowdata.quantity<qty or qty<=0 then raise exception 'Stock unavailable, expired or insufficient';end if;
   select i.quantity-coalesce((select sum(d.quantity) from public.dispense_items d where d.prescription_item_id=i.id),0) into remaining from public.prescription_items i where i.id=(item->>'item_id')::uuid and i.prescription_id=rid and lower(i.medicine)=lower(rowdata.medicine) and lower(i.strength)=lower(rowdata.strength);
   if remaining is null or qty>remaining then raise exception 'Quantity exceeds prescription or medicine does not match';end if;
   insert into public.dispense_items(dispense_id,prescription_item_id,stock_id,quantity) values(eid,(item->>'item_id')::uuid,sid,qty);
   update public.stock set quantity=quantity-qty where id=sid;
  end loop;
  select patient_id into pid from public.prescriptions where id=rid;
  insert into public.notifications(user_id,title,target_id) select owner_id,'medicine_dispensed',rid from public.patients where id=pid;
  result:=jsonb_build_object('id',eid);
 when 'lab_order' then
  pid:=(p->>'patient_id')::uuid;fid:=(p->>'facility_id')::uuid;
  if not private.has_role(array['doctor']) or not private.can_read_patient(pid) or not exists(select 1 from public.facilities where id=fid and status='active') then raise exception 'Not permitted';end if;
  insert into public.lab_orders(patient_id,facility_id,requested_by,test,instructions) values(pid,fid,u,p->>'test',coalesce(p->>'instructions','')) returning id into rid;
 when 'lab_status' then
  select * into rowdata from public.lab_orders where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;newstatus:=p->>'status';pid:=rowdata.patient_id;
  if not private.has_role(array['laboratory'],rowdata.facility_id) then raise exception 'Not permitted';end if;
  if not ((rowdata.status='ordered' and newstatus in ('collected','cancelled')) or (rowdata.status='collected' and newstatus in ('processing','cancelled')) or (rowdata.status='processing' and newstatus='verified')) then raise exception 'Invalid laboratory transition';end if;
  if newstatus='verified' then
   insert into public.records(patient_id,facility_id,author_id,kind,title,body) values(pid,rowdata.facility_id,u,'lab_result',rowdata.test,p->>'result') returning id into rid;
   insert into public.notifications(user_id,title,target_id) select owner_id,'lab_result_ready',rid from public.patients where id=pid;
  end if;
  update public.lab_orders set status=newstatus,result_id=rid where id=rowdata.id;
 when 'staff_request' then
  fid:=(p->>'facility_id')::uuid;
  if not(private.has_role(array['hospital'],fid) or private.has_role(array['ministry'])) then raise exception 'Hospital or Ministry access required';end if;
  if p->>'role' in ('hospital','province') and not private.has_role(array['ministry']) then raise exception 'Ministry must appoint administrators';end if;
  if coalesce(p->>'email','') !~ '^[^ @]+@[^ @]+\.[^ @]+$' or length(coalesce(p->>'credential',''))<3 then raise exception 'Email and credential required';end if;
  insert into public.staff_requests(facility_id,email,full_name,role,credential,requested_by) values(fid,lower(trim(p->>'email')),p->>'full_name',p->>'role',p->>'credential',u) returning id into rid;
 when 'staff_review' then
  if not private.has_role(array['ministry']) then raise exception 'Ministry approval required';end if;
  select * into rowdata from public.staff_requests where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;
  if rowdata.status<>'pending' or p->>'status' not in ('approved','rejected') then raise exception 'Invalid review';end if;
  update public.staff_requests set status=p->>'status',reviewed_by=u,review_note=p->>'note' where id=rowdata.id;
 when 'staff_accept' then
  select * into rowdata from public.staff_requests where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;
  if rowdata.status<>'approved' or rowdata.email<>(select lower(email) from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Sign in with the approved invitation email';end if;
  insert into private.memberships(user_id,role,facility_id,province) select u,rowdata.role,rowdata.facility_id,province from public.facilities where id=rowdata.facility_id;
  update public.staff_requests set status='active',user_id=u where id=rowdata.id;
 when 'staff_revoke' then
  select * into rowdata from public.staff_requests where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;
  if not(private.has_role(array['ministry']) or private.has_role(array['hospital'],rowdata.facility_id)) then raise exception 'Not permitted';end if;
  update private.memberships set active=false where user_id=rowdata.user_id and role=rowdata.role and facility_id=rowdata.facility_id;
  update public.staff_requests set status='revoked' where id=rowdata.id;
 when 'staff_list' then
  fid:=nullif(p->>'facility_id','')::uuid;
  if not(private.has_role(array['ministry']) or private.has_role(array['hospital'],fid)) then raise exception 'Not permitted';end if;
  select coalesce(jsonb_agg(jsonb_build_object('user_id',m.user_id,'role',m.role,'full_name',coalesce(pr.full_name,s.full_name,m.role))),'[]') into result from private.memberships m left join public.profiles pr on pr.id=m.user_id left join public.staff_requests s on s.user_id=m.user_id and s.role=m.role and s.facility_id=m.facility_id where m.active and (fid is null or m.facility_id=fid);
 when 'facility_status' then
  if not private.has_role(array['ministry']) or p->>'status' not in ('active','suspended') then raise exception 'Ministry review required';end if;
  update public.facilities set status=p->>'status' where id=(p->>'id')::uuid;
 when 'create_work' then
  k:=p->>'kind';fid:=nullif(p->>'facility_id','')::uuid;pid:=nullif(p->>'patient_id','')::uuid;
  if k not in ('complaint','claim','research','facility_application') and not private.can_manage_work(k,fid,coalesce(p->>'province','')) then raise exception 'Not permitted';end if;
  if pid is not null and not(private.owns_patient(pid) or private.can_read_patient(pid)) then raise exception 'Not permitted for this patient';end if;
  if k='claim' and (coalesce(p->'details'->>'amount','')!~'^[0-9]+(\.[0-9]{1,2})?$' or (p->'details'->>'amount')::numeric<=0) then raise exception 'Enter a valid claim amount';end if;
  if length(coalesce(p->'details'->>'description',''))<3 then raise exception 'Describe the request';end if;
  insert into public.work_items(kind,facility_id,province,patient_id,created_by,title,details) values(k,fid,coalesce(p->>'province',''),pid,u,p->>'title',p->'details') returning id into rid;
  insert into public.work_events(work_item_id,actor_id,status,note) values(rid,u,'submitted','');
 when 'transition_work' then
  select * into rowdata from public.work_items where id=(p->>'id')::uuid for update; if not found then raise exception 'Record not found';end if;newstatus:=p->>'status';
  if not private.can_manage_work(rowdata.kind,rowdata.facility_id,rowdata.province) and not(rowdata.created_by=u and newstatus='cancelled' and rowdata.status='submitted') then raise exception 'Not permitted';end if;
  if not ((rowdata.status='submitted' and newstatus in ('in_review','cancelled')) or (rowdata.status='in_review' and newstatus in ('approved','rejected','needs_information')) or (rowdata.status='needs_information' and newstatus='in_review') or (rowdata.status='approved' and newstatus in ('in_progress','cancelled')) or (rowdata.status='in_progress' and newstatus='completed')) then raise exception 'Invalid workflow transition';end if;
  if length(coalesce(p->>'note',''))<3 then raise exception 'Enter a decision or progress note';end if;
  update public.work_items set status=newstatus,updated_at=now() where id=rowdata.id;
  insert into public.work_events(work_item_id,actor_id,status,note) values(rowdata.id,u,newstatus,p->>'note');
  insert into public.notifications(user_id,title,target_id) values(rowdata.created_by,'request_updated',rowdata.id);
 when 'work_comment' then
  rid:=(p->>'id')::uuid;if not private.can_read_work(rid) or length(coalesce(p->>'note',''))<3 then raise exception 'Not permitted or empty comment';end if;
  insert into public.work_events(work_item_id,actor_id,status,note) select id,u,status,p->>'note' from public.work_items where id=rid;
 when 'announcement' then
  if not private.has_role(array['ministry']) then raise exception 'Not permitted';end if;
  insert into public.announcements(title,body) values(p->>'title',p->>'body');
 when 'read_notification' then
  update public.notifications set read_at=now() where id=(p->>'id')::uuid and user_id=u;
 when 'audit_access' then
  pid:=(p->>'patient_id')::uuid;if not private.can_read_patient(pid) then raise exception 'Not permitted';end if;
 when 'register_document' then
  pid:=(p->>'patient_id')::uuid;
  if not(private.owns_patient(pid) or (private.can_read_patient(pid) and private.has_role(array['doctor','community']))) or split_part(p->>'path','/',1)<>pid::text or not exists(select 1 from storage.objects where bucket_id='medical' and name=p->>'path' and owner_id=u::text) then raise exception 'Not permitted or upload missing';end if;
  insert into public.documents(patient_id,uploaded_by,name,path,mime,bytes,source) values(pid,u,p->>'name',p->>'path',p->>'mime',(p->>'bytes')::int,case when private.owns_patient(pid) then 'patient_upload' else 'clinician_upload' end);
 when 'set_photo' then
  select id into pid from public.patients where owner_id=u;
  if split_part(p->>'path','/',1)<>pid::text or not exists(select 1 from storage.objects where bucket_id='photos' and name=p->>'path' and owner_id=u::text) then raise exception 'Invalid photo';end if;
  update public.patients set photo_path=p->>'path' where id=pid;
 else raise exception 'Unknown action';
 end case;
 if action not in ('session','family_list','staff_list') then insert into public.audit_events(actor_id,action,patient_id,entity_id) values(u,action,pid,coalesce(rid,eid));end if;
 if rid is not null and jsonb_typeof(result)='object' then result:=result||jsonb_build_object('id',rid);end if; return result;
end $$;
create function public.nc_command(action text,p jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.command(action,p)$$;
create function private.is_email(e text) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from auth.users where id=private.uid() and lower(email)=lower(e) and email_confirmed_at is not null)$$;
create function private.rx_patient(pid uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.prescriptions r join private.rx_access a on a.prescription_id=r.id where r.patient_id=pid and a.user_id=private.uid() and a.expires_at>now() and private.has_role(array['pharmacy']))$$;
create function private.storage_patient(path text) returns uuid language plpgsql immutable set search_path='' as $$begin return split_part(path,'/',1)::uuid;exception when invalid_text_representation then return null;end$$;
-- No direct mutation grants on clinical or authorization tables.
do $$declare t text;begin
 foreach t in array array['facilities','profiles','patients','care_grants','family_links','appointments','records','prescriptions','prescription_items','stock','dispenses','dispense_items','lab_orders','documents','staff_requests','work_items','work_events','notifications','audit_events','announcements'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end$$;
alter table private.memberships enable row level security;
alter table private.identities enable row level security;
alter table private.identity_settings enable row level security;
alter table private.rx_tokens enable row level security;
alter table private.rx_access enable row level security;
grant select on public.facilities,public.announcements to anon;
create policy public_facilities on public.facilities for select to anon,authenticated using(status in ('directory','active') or private.has_role(array['ministry','registry']));
create policy public_announcements on public.announcements for select to anon,authenticated using(published);
create policy own_profile on public.profiles for select to authenticated using(id=private.uid());
create policy patient_read on public.patients for select to authenticated using(private.can_read_patient(id));
create policy care_read on public.care_grants for select to authenticated using(private.owns_patient(patient_id) or user_id=private.uid());
create policy family_read on public.family_links for select to authenticated using(private.owns_patient(inviter_id) or private.owns_patient(invitee_id));
create policy appointment_read on public.appointments for select to authenticated using(private.owns_patient(patient_id) or private.has_role(array['hospital'],facility_id) or (clinician_id=private.uid() and private.has_role(array['doctor'],facility_id)));
create policy record_read on public.records for select to authenticated using(private.can_read_patient(patient_id));
create policy rx_read on public.prescriptions for select to authenticated using(private.can_read_rx(id));
create policy rx_item_read on public.prescription_items for select to authenticated using(private.can_read_rx(prescription_id));
create policy stock_read on public.stock for select to authenticated using(private.has_role(array['pharmacy','supply'],facility_id));
create policy dispense_read on public.dispenses for select to authenticated using(private.can_read_rx(prescription_id) or private.has_role(array['pharmacy'],pharmacy_id));
create policy dispense_item_read on public.dispense_items for select to authenticated using(exists(select 1 from public.dispenses d where d.id=dispense_id));
create policy lab_read on public.lab_orders for select to authenticated using(private.can_read_patient(patient_id) or private.has_role(array['laboratory'],facility_id));
create policy document_read on public.documents for select to authenticated using(private.can_read_patient(patient_id));
create policy staff_read on public.staff_requests for select to authenticated using(private.has_role(array['ministry']) or private.has_role(array['hospital'],facility_id) or private.is_email(email));
create policy work_read on public.work_items for select to authenticated using(private.can_read_work(id));
create policy work_event_read on public.work_events for select to authenticated using(private.can_read_work(work_item_id));
create policy notification_read on public.notifications for select to authenticated using(user_id=private.uid());
create policy audit_read on public.audit_events for select to authenticated using(actor_id=private.uid() or private.owns_patient(patient_id) or private.has_role(array['ministry']));
revoke all on all functions in schema private from public,anon;
grant execute on all functions in schema private to authenticated;
-- Public directory policies may invoke this helper for non-public records.
grant usage on schema private to anon;
grant execute on function private.uid(),private.has_role(text[],uuid) to anon;
revoke all on function public.nc_command(text,jsonb) from public,anon;
grant execute on function public.nc_command(text,jsonb) to authenticated;
create index patients_owner_idx on public.patients(owner_id);
create index grants_user_idx on public.care_grants(user_id,patient_id,expires_at);
create index family_invitee_idx on public.family_links(invitee_id,status);
create index records_patient_idx on public.records(patient_id,created_at desc);
create index appointment_facility_idx on public.appointments(facility_id,starts_at);
create index appointment_patient_idx on public.appointments(patient_id);
create index rx_patient_idx on public.prescriptions(patient_id,created_at desc);
create index rx_item_idx on public.prescription_items(prescription_id);
create index dispense_rx_idx on public.dispenses(prescription_id);
create index dispense_item_rx_idx on public.dispense_items(prescription_item_id);
create index lab_patient_idx on public.lab_orders(patient_id);
create index lab_facility_idx on public.lab_orders(facility_id,status);
create index document_patient_idx on public.documents(patient_id);
create index staff_facility_idx on public.staff_requests(facility_id,status);
create index work_scope_idx on public.work_items(facility_id,kind,status);
create index work_creator_idx on public.work_items(created_by);
create index work_event_idx on public.work_events(work_item_id,created_at);
create index notification_user_idx on public.notifications(user_id,created_at desc);
create index audit_patient_idx on public.audit_events(patient_id,created_at desc);
-- Storage buckets are private; path ownership is checked independently of UI.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('medical','medical',false,10485760,array['application/pdf','image/jpeg','image/png']),('photos','photos',false,2097152,array['image/jpeg','image/png']) on conflict(id) do nothing;
create policy nc_file_select on storage.objects for select to authenticated using(bucket_id in ('medical','photos') and private.can_read_patient(private.storage_patient(name)));
create policy nc_file_insert on storage.objects for insert to authenticated with check(bucket_id in ('medical','photos') and (private.owns_patient(private.storage_patient(name)) or (bucket_id='medical' and private.can_read_patient(private.storage_patient(name)) and private.has_role(array['doctor','community']))) and owner_id=private.uid()::text);
-- Uploaded files are immutable: a correction creates a new version/path.
do $$declare t text;begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 foreach t in array array['appointments','records','prescriptions','prescription_items','dispenses','dispense_items','lab_orders','documents','notifications','work_items','work_events','staff_requests','family_links','care_grants','stock'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
 end loop;end if;
end$$;
commit;
