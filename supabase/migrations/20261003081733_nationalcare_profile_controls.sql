begin;
alter table public.patients add constraint patient_phone_format check(phone ~ '^\+[1-9][0-9]{7,14}$');
create function private.remove_photo() returns text language plpgsql security definer set search_path='' as $$
declare object_path text; pid uuid;
begin
 if private.uid() is null then raise exception 'Sign in required';end if;
 select id,photo_path into pid,object_path from public.patients where owner_id=private.uid() for update;
 if pid is null then raise exception 'Patient profile required';end if;
 update public.patients set photo_path=null where id=pid;
 insert into public.audit_events(actor_id,action,patient_id) values(private.uid(),'remove_photo',pid);
 return object_path;
end$$;
create function public.nc_remove_photo() returns text language sql security invoker set search_path='' as $$ select private.remove_photo() $$;
revoke all on function private.remove_photo(),public.nc_remove_photo() from public,anon;
grant execute on function private.remove_photo(),public.nc_remove_photo() to authenticated;
commit;
