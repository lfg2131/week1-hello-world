-- MANUAL trusted administration only, after live owner verification and RPC audit.
-- psql -v verified_owner_id='<verified actual auth UUID>' -f ...
-- Do not use e-mail alone, assume an account, or bootstrap every membership.
begin;
create temporary table caption_studio_bootstrap_target(id uuid not null);
insert into caption_studio_bootstrap_target values (:'verified_owner_id'::uuid);
do $$ declare owner_id uuid; begin
 select id into strict owner_id from caption_studio_bootstrap_target;
 if not exists(select 1 from public.caption_lab_admins a join auth.users u on u.id=a.user_id where a.user_id=owner_id and a.is_superadmin is true and u.raw_app_meta_data->>'provider'='google') then raise exception 'Verified protected Google owner membership required'; end if;
 update public.profiles set is_superadmin=true where id=owner_id;
 if not found then raise exception 'Owner profile missing; inspect rather than invent a profile'; end if;
end $$;
commit;
