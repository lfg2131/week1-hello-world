-- MANUAL trusted administration only, after live owner verification and RPC audit.
-- psql -v verified_owner_id='<verified actual auth UUID>' -f ...
-- Do not use e-mail alone, assume an account, or bootstrap every membership.
-- The user's primary provider can be Apple even after verified Google linking.
-- A linked Google identity is an account prerequisite, not proof of the current
-- session's OAuth provider. The application verifies Google sign-in separately.
begin;
create temporary table caption_studio_bootstrap_target(id uuid not null);
insert into caption_studio_bootstrap_target values (:'verified_owner_id'::uuid);
do $$ declare owner_id uuid; begin
 select id into strict owner_id from caption_studio_bootstrap_target;
 if not exists(
  select 1 from public.caption_lab_admins a
  join auth.users u on u.id=a.user_id
  where a.user_id=owner_id and a.is_superadmin is true
   and u.email_confirmed_at is not null
   and exists(
    select 1 from auth.identities i
    where i.user_id=u.id and i.provider='google'
     and lower(i.identity_data->>'email_verified')='true'
     and nullif(btrim(i.identity_data->>'email'),'') is not null
   )
 ) then raise exception 'Verified protected owner with confirmed Google identity required'; end if;
 update public.profiles set is_superadmin=true where id=owner_id and deletion_requested_at is null;
 if not found then raise exception 'Active owner profile missing; inspect rather than invent a profile'; end if;
end $$;
commit;
