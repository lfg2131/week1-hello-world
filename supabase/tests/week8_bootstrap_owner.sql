-- MANUAL trusted administration only, after explicit owner UUID/email confirmation.
-- psql -v verified_owner_id='<confirmed auth UUID>' -v verified_owner_email='<confirmed Google email>' -f ...
-- This promotes one Studio profile only; legacy caption_lab_admins stays unchanged.
-- A verified linked Google identity is an account prerequisite. The application
-- independently verifies the current Google session; primary provider is not proof.
begin;
select set_config('caption_studio.verified_owner_id', :'verified_owner_id', true),
       set_config('caption_studio.verified_owner_email', :'verified_owner_email', true);
do $$
declare
 owner_id uuid;
 owner_email text;
 jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
begin
 if current_user not in ('postgres','supabase_admin','service_role')
    or jwt_role in ('anon','authenticated') or auth.uid() is not null then
  raise exception 'Trusted administration without a client JWT is required' using errcode='42501';
 end if;
 owner_id:=current_setting('caption_studio.verified_owner_id')::uuid;
 owner_email:=lower(btrim(current_setting('caption_studio.verified_owner_email')));
 if owner_email='' or not exists(
  select 1 from auth.users u
  where u.id=owner_id and lower(btrim(u.email))=owner_email
   and u.email_confirmed_at is not null
   and exists(
    select 1 from auth.identities i
    where i.user_id=u.id and i.provider='google'
     and lower(i.identity_data->>'email_verified')='true'
     and lower(btrim(i.identity_data->>'email'))=owner_email
   )
 ) then raise exception 'Explicitly confirmed UUID and verified Google email must match'; end if;
 update public.profiles set is_superadmin=true where id=owner_id and deletion_requested_at is null;
 if not found then raise exception 'Active owner profile missing; inspect rather than invent a profile'; end if;
end $$;
commit;
