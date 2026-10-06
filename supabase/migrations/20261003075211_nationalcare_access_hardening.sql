-- Scope operations to their receiving facility and validate uploads server-side.
begin;
create or replace function private.can_manage_work(k text,fac uuid,prov text) returns boolean language sql stable security definer set search_path='' as $$
select private.uid() is not null and (
 (fac is not null and k<>'inspection' and private.has_role(array[private.work_role(k)],fac))
 or (fac is null and k<>'inspection' and private.has_role(array[private.work_role(k)]) and exists(select 1 from private.memberships m where m.user_id=private.uid() and m.active and m.role=private.work_role(k) and m.facility_id is null))
 or (k='inspection' and private.has_role(array['province']) and exists(select 1 from private.memberships m where m.user_id=private.uid() and m.active and m.role='province' and m.province=prov))
) $$;
create table private.validated_uploads(path text primary key,patient_id uuid not null references public.patients(id),actor_id uuid not null references auth.users(id),bucket text not null check(bucket in ('medical','photos')),mime text not null check(mime in ('image/png','image/jpeg','application/pdf')),bytes integer not null check(bytes between 1 and 10485760),name text not null,created_at timestamptz not null default now());
alter table private.validated_uploads enable row level security;
create policy deny_client_upload_attestation on private.validated_uploads to anon,authenticated using(false) with check(false);
grant usage on schema private to service_role;
grant insert on private.validated_uploads to service_role;
create function private.upload_matches(pid uuid,actor uuid,bucket_name text,object_path text,content_type text,byte_size integer,file_name text) returns boolean language sql stable security definer set search_path='' as $$
select private.uid()=actor and exists(select 1 from private.validated_uploads v where v.path=object_path and v.actor_id=actor and v.patient_id=pid and v.bucket=bucket_name and (content_type is null or v.mime=content_type) and (byte_size is null or v.bytes=byte_size) and (file_name is null or v.name=file_name)) $$;
create function private.authorize_upload(pid uuid,photo boolean) returns boolean language sql stable security definer set search_path='' as $$
select private.uid() is not null and exists(select 1 from auth.users where id=private.uid() and email_confirmed_at is not null) and (private.owns_patient(pid) or (not photo and private.can_read_patient(pid) and private.has_role(array['doctor','community']))) $$;
create function public.nc_authorize_upload(pid uuid,photo boolean) returns boolean language sql stable security invoker set search_path='' as $$ select private.authorize_upload(pid,photo) $$;
create function public.nc_attest_upload(pid uuid,actor uuid,bucket_name text,object_path text,content_type text,byte_size integer,file_name text) returns void language sql security invoker set search_path='' as $$ insert into private.validated_uploads(path,patient_id,actor_id,bucket,mime,bytes,name) values(object_path,pid,actor,bucket_name,content_type,byte_size,file_name) $$;
revoke all on function private.upload_matches(uuid,uuid,text,text,text,integer,text), private.authorize_upload(uuid,boolean),public.nc_authorize_upload(uuid,boolean),public.nc_attest_upload(uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function private.upload_matches(uuid,uuid,text,text,text,integer,text),private.authorize_upload(uuid,boolean),public.nc_authorize_upload(uuid,boolean) to authenticated;
grant execute on function public.nc_attest_upload(uuid,uuid,text,text,text,integer,text) to service_role;
drop policy nc_file_insert on storage.objects;
create or replace function private.command(action text,p jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
  delete from private.rx_tokens where expires_at<now();
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
  if k in ('complaint','claim','research') and (fid is null or not exists(select 1 from public.facilities where id=fid and status='active')) then raise exception 'Select an active receiving facility';end if;
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
  if not(private.owns_patient(pid) or (private.can_read_patient(pid) and private.has_role(array['doctor','community']))) or split_part(p->>'path','/',1)<>pid::text or not exists(select 1 from storage.objects where bucket_id='medical' and name=p->>'path' and private.upload_matches(pid,u,'medical',p->>'path',p->>'mime',(p->>'bytes')::integer,p->>'name')) then raise exception 'Not permitted or upload missing';end if;
  insert into public.documents(patient_id,uploaded_by,name,path,mime,bytes,source) values(pid,u,p->>'name',p->>'path',p->>'mime',(p->>'bytes')::int,case when private.owns_patient(pid) then 'patient_upload' else 'clinician_upload' end);
 when 'set_photo' then
  select id into pid from public.patients where owner_id=u;
  if split_part(p->>'path','/',1)<>pid::text or not exists(select 1 from storage.objects where bucket_id='photos' and name=p->>'path' and private.upload_matches(pid,u,'photos',p->>'path',null,null,null)) then raise exception 'Invalid photo';end if;
  update public.patients set photo_path=p->>'path' where id=pid;
 else raise exception 'Unknown action';
 end case;
 if action not in ('session','family_list','staff_list') then insert into public.audit_events(actor_id,action,patient_id,entity_id) values(u,action,pid,coalesce(rid,eid));end if;
 if rid is not null and jsonb_typeof(result)='object' then result:=result||jsonb_build_object('id',rid);end if; return result;
end $$;

-- Profile and directory changes must also refresh connected clients.
do $$begin if exists(select 1 from pg_publication where pubname='supabase_realtime') then alter publication supabase_realtime add table public.patients,public.profiles,public.announcements,public.facilities;end if;end$$;
commit;
