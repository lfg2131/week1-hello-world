-- POST-MIGRATION ONLY. Reviewed proposal; not executed against the live project.
-- Target: msxlfmgpvyyrpvzrnqhu. Run as trusted postgres/supabase_admin.
-- No bootstrap: the selected protected member is only a rollback-only test actor.
-- Every row change and temporary object is rolled back.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$
declare
  role_name text;
  table_name text;
  function_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    if has_column_privilege(role_name,'public.profiles','is_superadmin','INSERT')
       or has_column_privilege(role_name,'public.profiles','is_superadmin','UPDATE') then
      raise exception '% can write profiles.is_superadmin', role_name;
    end if;
    foreach table_name in array array['caption_studio_runs','caption_studio_attempts'] loop
      if has_table_privilege(role_name,'public.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception '% has direct access to %', role_name, table_name;
      end if;
      if not (select relrowsecurity from pg_class where oid=('public.'||table_name)::regclass) then
        raise exception 'RLS disabled on %', table_name;
      end if;
    end loop;
    foreach function_name in array array[
      'public.caption_studio_edit(text,uuid,integer,jsonb)',
      'public.caption_studio_begin(uuid,uuid,uuid,integer,text,text)'
    ] loop
      if has_function_privilege(role_name,function_name,'EXECUTE') then
        raise exception '% can call %', role_name, function_name;
      end if;
    end loop;
  end loop;
  if not has_function_privilege('service_role','public.caption_studio_edit(text,uuid,integer,jsonb)','EXECUTE')
     or not has_function_privilege('service_role','public.caption_studio_begin(uuid,uuid,uuid,integer,text,text)','EXECUTE') then
    raise exception 'Missing service-role RPC grants';
  end if;
end $$;

do $$
declare
  actor uuid;
  previous_flag boolean;
  changed integer;
begin
  -- Exactly one existing protected membership is required; never promote it here.
  select user_id into strict actor from public.caption_lab_admins where is_superadmin is true;
  select is_superadmin into strict previous_flag from public.profiles where id=actor;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub',actor::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',actor)::text,true);

  -- A definer-style call still runs as the trusted database owner, while its
  -- caller's authenticated JWT must prevent the protected flag changing.
  begin
    update public.profiles set is_superadmin=not previous_flag where id=actor;
    raise exception 'Authenticated JWT bypassed the profile trigger';
  exception when insufficient_privilege then
    null;
  end;
  if (select is_superadmin from public.profiles where id=actor) is distinct from previous_flag then
    raise exception 'Profile guard failed to preserve flag';
  end if;

  execute 'set local role authenticated';
  begin
    update public.profiles set is_superadmin=true where id=actor;
    raise exception 'Authenticated role bypassed flag UPDATE grant';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.profiles(id,username,is_superadmin)
      values(actor,'week8_rollback_actor',true);
    raise exception 'Authenticated role bypassed flag INSERT grant';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.profiles(id,username,is_superadmin)
      values(actor,'week8_rollback_actor',true)
      on conflict(id) do update set is_superadmin=excluded.is_superadmin;
    raise exception 'Authenticated role bypassed flag UPSERT grant';
  exception when insufficient_privilege then null;
  end;

  -- Ordinary self-profile editing must continue to work with the real RLS.
  update public.profiles set first_name=first_name where id=actor;
  get diagnostics changed=row_count;
  if changed<>1 then raise exception 'Legitimate self-profile edit was blocked'; end if;
  execute 'reset role';
  perform set_config('request.jwt.claim.role','',true);
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
end $$;

select 'PASS: private table/RPC grants, RLS, profile direct/definer escalation denial, and ordinary self edit (all rolled back)' as result;
rollback;
