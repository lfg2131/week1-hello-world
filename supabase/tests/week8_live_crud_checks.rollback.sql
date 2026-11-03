-- Live service-role correctness checks. Every labelled fixture rolls back.
-- psql -v test_actor_id='<verified existing auth UUID>' -f ...
begin;
select set_config('caption_studio.test_actor_id', :'test_actor_id', true);
set local lock_timeout='3s';
set local statement_timeout='30s';
set local role service_role;
do $$
declare
 actor uuid := current_setting('caption_studio.test_actor_id')::uuid;
 c jsonb; unused jsonb; outcome jsonb; started jsonb; again jsonb;
 model uuid; foreign_step uuid; ids uuid[]; expected_ids uuid[]; expected_snapshot jsonb;
 run_id uuid := gen_random_uuid(); fixture_image_id uuid; initial_state text;
 suffix text := gen_random_uuid()::text;
begin
 if exists(select 1 from public.caption_studio_runs where requester_id=actor and status='running') then
  raise exception 'Existing active owner run; postpone rollback checks';
 end if;
 select m.id into strict model
 from public.caption_lab_chains ch join public.caption_lab_steps s on s.chain_id=ch.id
 join public.caption_lab_models m on m.id=s.model_id
 join public.caption_lab_providers p on p.id=m.provider_id
 where ch.application='main' and ch.enabled and m.active and p.active and p.slug='google-gemini'
 order by ch.created_at,s.position limit 1;
 c:=public.caption_studio_edit('create_chain',null,null,jsonb_build_object('name','ROLLBACK Week8 '||suffix,'description','Disposable transaction-only verification'));
 c:=public.caption_studio_edit('add_step',(c->>'id')::uuid,(c->>'revision')::int,
  jsonb_build_object('name','First','model_id',model,'system_template','Describe','user_template','Image','input_binding','image','output_type','text','caption_count',5));
 c:=public.caption_studio_edit('add_step',(c->>'id')::uuid,(c->>'revision')::int,
  jsonb_build_object('name','Second','model_id',model,'system_template','Captions','user_template','{{previous_output}}','input_binding','previous','output_type','captions','caption_count',5));
 select array_agg(id order by position) into ids from public.caption_lab_steps where chain_id=(c->>'id')::uuid;
 if cardinality(ids)<>2 then raise exception 'Step creation failed'; end if;
 c:=public.caption_studio_edit('save_chain',(c->>'id')::uuid,(c->>'revision')::int,jsonb_build_object('name','ROLLBACK Edited '||suffix,'description','Saved description'));
 if c->>'description'<>'Saved description' then raise exception 'Chain update failed'; end if;
 c:=public.caption_studio_edit('reorder',(c->>'id')::uuid,(c->>'revision')::int,jsonb_build_object('ids',array[ids[2],ids[1]]));
 expected_ids:=array[ids[2],ids[1]];
 select array_agg(id order by position) into ids from public.caption_lab_steps where chain_id=(c->>'id')::uuid;
 if ids<>expected_ids then raise exception 'Atomic reorder failed'; end if;
 select id into strict foreign_step from public.caption_lab_steps where chain_id<>(c->>'id')::uuid limit 1;
 begin
  perform public.caption_studio_edit('reorder',(c->>'id')::uuid,(c->>'revision')::int,jsonb_build_object('ids',array[ids[1],ids[1]]));
  raise exception 'Duplicate IDs unexpectedly accepted';
 exception when others then
  if position('Duplicate, missing, or foreign step IDs' in sqlerrm)=0 then raise; end if;
 end;
 begin
  perform public.caption_studio_edit('reorder',(c->>'id')::uuid,(c->>'revision')::int,jsonb_build_object('ids',array[ids[1]]));
  raise exception 'Missing ID unexpectedly accepted';
 exception when others then
  if position('Duplicate, missing, or foreign step IDs' in sqlerrm)=0 then raise; end if;
 end;
 begin
  perform public.caption_studio_edit('reorder',(c->>'id')::uuid,(c->>'revision')::int,jsonb_build_object('ids',array[ids[1],foreign_step]));
  raise exception 'Foreign ID unexpectedly accepted';
 exception when others then
  if position('Duplicate, missing, or foreign step IDs' in sqlerrm)=0 then raise; end if;
 end;
 begin
  perform public.caption_studio_edit('reorder',(c->>'id')::uuid,(c->>'revision')::int-1,jsonb_build_object('ids',ids));
  raise exception 'Stale revision unexpectedly accepted';
 exception when serialization_failure then null;
 end;
 if (select array_agg(id order by position) from public.caption_lab_steps where chain_id=(c->>'id')::uuid)<>expected_ids then raise exception 'Rejected reorder partially changed steps'; end if;
 started:=public.caption_studio_begin(run_id,actor,(c->>'id')::uuid,(c->>'revision')::int,'rollback context',repeat('a',64));
 if started->>'created'<>'true' then raise exception 'First run not created'; end if;
 expected_snapshot:=started->'run'->'snapshot';
 if (select array_agg((value->>'id')::uuid order by ordinality) from jsonb_array_elements(expected_snapshot->'steps') with ordinality)<>ids then raise exception 'Snapshot order mismatch'; end if;
 again:=public.caption_studio_begin(run_id,actor,(c->>'id')::uuid,(c->>'revision')::int,'rollback context',repeat('a',64));
 if again->>'created'<>'false' then raise exception 'Retry generated duplicate run'; end if;
 begin
  perform public.caption_studio_begin(run_id,actor,(c->>'id')::uuid,(c->>'revision')::int,'rollback context',repeat('b',64));
  raise exception 'Mismatched run reuse unexpectedly accepted';
 exception when others then
  if position('different inputs' in sqlerrm)=0 then raise; end if;
 end;
 begin
  perform public.caption_studio_begin(gen_random_uuid(),actor,(c->>'id')::uuid,(c->>'revision')::int,'rollback context',repeat('a',64));
  raise exception 'Concurrent active run unexpectedly accepted';
 exception when unique_violation then
  if position('caption_studio_one_running' in sqlerrm)=0 then raise; end if;
 end;
 insert into public.caption_lab_images(storage_path,owner_id,title)
 values(actor::text||'/'||gen_random_uuid()::text||'.png',actor,'ROLLBACK Week8 fixture') returning id into fixture_image_id;
 update public.caption_studio_runs set image_id=fixture_image_id where id=run_id;
 begin
  perform public.caption_lab_reserve_image_delete(fixture_image_id);
  raise exception 'Referenced image deletion unexpectedly reserved';
 exception when others then
  if position('Image is referenced' in sqlerrm)=0 then raise; end if;
 end;
 if (select state from public.caption_lab_images where id=fixture_image_id)<>'available' then raise exception 'Rejected reservation changed image state'; end if;
 c:=public.caption_studio_edit('delete_step',(c->>'id')::uuid,(c->>'revision')::int,jsonb_build_object('id',ids[1]));
 if (select snapshot from public.caption_studio_runs where id=run_id)<>expected_snapshot then raise exception 'Historical snapshot changed'; end if;
 if (select array_agg(position order by position) from public.caption_lab_steps where chain_id=(c->>'id')::uuid)<>array[1] then raise exception 'Step delete did not compact order'; end if;
 outcome:=public.caption_studio_edit('delete_chain',(c->>'id')::uuid,(c->>'revision')::int,'{}'::jsonb);
 if outcome->>'archived'<>'true' or (select archived_at is null from public.caption_lab_chains where id=(c->>'id')::uuid) then raise exception 'Referenced chain not archived'; end if;
 unused:=public.caption_studio_edit('create_chain',null,null,jsonb_build_object('name','ROLLBACK Unused '||suffix));
 outcome:=public.caption_studio_edit('delete_chain',(unused->>'id')::uuid,(unused->>'revision')::int,'{}'::jsonb);
 if outcome->>'deleted'<>'true' or exists(select 1 from public.caption_lab_chains where id=(unused->>'id')::uuid) then raise exception 'Unused chain not deleted'; end if;
end $$;
reset role;
select 'PASS: service-role chain/step CRUD, atomic reorder/rejection, snapshots, stable run IDs, one-active guard, archive/deletion, and image-reference protection; all fixtures rolled back' as result;
rollback;
