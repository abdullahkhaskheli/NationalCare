-- Run as database owner after creating and verifying your own Auth account.
-- Supply the administrator UUID through psql: psql -v admin_id=YOUR_UUID -f scripts/bootstrap-admin.sql
-- Never expose service credentials in the browser.
begin;
insert into private.memberships(user_id,role)
select id,'ministry' from auth.users where id=:'admin_id'::uuid and email_confirmed_at is not null
on conflict do nothing;
commit;
