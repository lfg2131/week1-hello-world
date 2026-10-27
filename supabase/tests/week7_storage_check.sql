-- Rollback-only: tests policy predicates without deleting Storage metadata/files.
begin;
do $$
declare
  owner uuid;
  registered_path text;
  fresh_path text;
  policy_expression text;
  permitted boolean;
begin
  select i.owner_id, i.storage_path into owner, registered_path
    from public.caption_lab_images i
    join public.caption_lab_requests r on r.image_id = i.id
    where not exists (select 1 from public.ai_captions c where c.source_image_path = i.storage_path)
    limit 1;
  if owner is null then raise exception 'Requires an existing request-only image fixture'; end if;
  fresh_path := owner::text || '/' || gen_random_uuid()::text || '.jpg';
  select qual into policy_expression from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='week7_media_delete_unregistered_only' and permissive='RESTRICTIVE' and cmd='DELETE';
  if policy_expression is null then raise exception 'Restrictive delete policy missing'; end if;
  if has_function_privilege('anon','private.caption_lab_is_unregistered_upload(text)','execute') then
    raise exception 'Anonymous registry lookup exposed';
  end if;

  perform set_config('request.jwt.claim.sub', owner::text, true);
  perform set_config('role', 'authenticated', true);
  if private.caption_lab_is_unregistered_upload(registered_path) then
    raise exception 'Request-referenced image can be removed';
  end if;
  if not private.caption_lab_is_unregistered_upload(fresh_path) then
    raise exception 'Fresh own upload cleanup blocked';
  end if;
  execute format('select (%s) from (values (%L,%L)) objects(bucket_id,name)',
    policy_expression, 'week4-media', registered_path) into permitted;
  if permitted then raise exception 'Policy allows registered image deletion'; end if;
  execute format('select (%s) from (values (%L,%L)) objects(bucket_id,name)',
    policy_expression, 'week4-media', fresh_path) into permitted;
  if not permitted then raise exception 'Policy blocks fresh upload cleanup'; end if;
  execute format('select (%s) from (values (%L,%L)) objects(bucket_id,name)',
    policy_expression, 'unrelated-bucket-fixture', registered_path) into permitted;
  if not permitted then raise exception 'Policy changes another bucket'; end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  if private.caption_lab_is_unregistered_upload(fresh_path) then
    raise exception 'Another user can clean up an upload';
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  if private.caption_lab_is_unregistered_upload(fresh_path) then
    raise exception 'Missing identity accepted';
  end if;
end $$;
rollback;
select 'Registered/request-only files protected; own fresh cleanup allowed; other users denied; other buckets unchanged. Rolled back; no Storage files deleted.' as result;
