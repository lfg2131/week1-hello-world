-- Rollback-only tests: no historical rows, writer memberships, or Storage files change.
begin;
create temporary table week7_fixture as
select gen_random_uuid() as caption_id, c.creator_id as owner_id, c.source_image_path,
 (select user_id from private.caption_lab_writers where user_id<>c.creator_id limit 1) as other_id
from public.ai_captions c join private.caption_lab_writers w on w.user_id=c.creator_id limit 1;
grant select on week7_fixture to authenticated,anon;
insert into public.ai_captions(id,batch_id,creator_id,source_image_path,caption,generation_prompt,model,perspective)
select caption_id,gen_random_uuid(),owner_id,source_image_path,'Week seven disposable test caption.','Permission test','gemini-3.8-flash','student' from week7_fixture;
select set_config('request.jwt.claim.sub',(select owner_id::text from week7_fixture),true);
set local role authenticated;
do $$
declare target uuid; before_id uuid; after_id uuid; saved smallint;
begin
 select caption_id into target from week7_fixture;
 perform public.caption_lab_set_vote(target,1::smallint);
 select id,vote into before_id,saved from public.caption_votes where caption_id=target;
 if before_id is null or saved<>1 then raise exception 'Initial vote did not INSERT'; end if;
 perform public.caption_lab_set_vote(target,1::smallint);
 perform public.caption_lab_set_vote(target,-1::smallint);
 select id,vote into after_id,saved from public.caption_votes where caption_id=target;
 if before_id<>after_id or saved<>-1 then raise exception 'Change did not update the same row'; end if;
 if (select count(*) from public.caption_votes where caption_id=target)<>1 then raise exception 'Duplicate vote'; end if;
 begin update public.caption_votes set caption_id=gen_random_uuid() where id=before_id; raise exception 'Identity change allowed'; exception when insufficient_privilege then null; end;
 begin update public.caption_votes set user_id=(select other_id from week7_fixture) where id=before_id; raise exception 'Ownership change allowed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select other_id::text from week7_fixture),true);
do $$
declare touched integer;
begin
 if exists(select 1 from public.caption_votes where caption_id=(select caption_id from week7_fixture))then raise exception 'Cross-user read';end if;
 update public.caption_votes set vote=1 where caption_id=(select caption_id from week7_fixture);get diagnostics touched=row_count;
 if touched<>0 then raise exception 'Cross-user update';end if;
 delete from public.caption_votes where caption_id=(select caption_id from week7_fixture);get diagnostics touched=row_count;
 if touched<>0 then raise exception 'Cross-user delete';end if;
 begin insert into public.caption_votes(user_id,caption_id,vote) select owner_id,caption_id,1 from week7_fixture;raise exception 'Spoofed insert';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',(select owner_id::text from week7_fixture),true);
do $$
declare target uuid;
begin
 select caption_id into target from week7_fixture;
 perform public.caption_lab_set_vote(target,null::smallint);
 perform public.caption_lab_set_vote(target,null::smallint);
 if exists(select 1 from public.caption_votes where caption_id=target)then raise exception 'Undo failed';end if;
 perform public.caption_lab_set_vote(target,-1::smallint);
 if not exists(select 1 from public.caption_votes where caption_id=target and vote=-1)then raise exception 'Reinsert failed';end if;
end $$;
set local role anon;
do $$
begin
 perform caption from public.ai_captions limit 1;
 begin perform public.caption_lab_set_vote((select caption_id from week7_fixture),1::smallint);raise exception 'Anonymous RPC allowed';exception when insufficient_privilege then null;end;
 begin perform generation_prompt from public.ai_captions limit 1;raise exception 'Public prompt exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$
declare t text;
begin
 for t in select unnest(array['chains','steps','mix','terms','examples','models','providers','requests','responses','images','signup_domains','whitelist']) loop
  if has_table_privilege('anon','public.caption_lab_'||t,'select') or has_table_privilege('authenticated','public.caption_lab_'||t,'select') then raise exception 'Private table exposed: %',t;end if;
 end loop;
 if has_column_privilege('authenticated','public.ai_captions','generation_prompt','select')then raise exception 'User prompts exposed';end if;
 if has_column_privilege('authenticated','public.ai_captions','generation_request_id','update')then raise exception 'User telemetry mutable';end if;
 if has_function_privilege('authenticated','public.caption_lab_activity(integer)','execute') or has_function_privilege('anon','public.caption_lab_save_mix(jsonb)','execute')then raise exception 'Private RPC exposed';end if;
end $$;
rollback;
select 'Week 7 vote/RLS checks passed; all test changes rolled back.' as result;
