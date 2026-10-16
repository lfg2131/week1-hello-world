-- Week 5 live check for ai_captions.perspective. Run in the SQL editor; like the
-- Week 4 check it ALWAYS rolls back by raising a final exception whose message
-- lists every result ("ok ..." / "FAIL ..."). Run week4_rls_check.sql too.
do $$
declare a uuid; b uuid; r text := ''; img text; img_b text; cap uuid; p text;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  img := a::text || '/' || gen_random_uuid()::text || '.jpg';
  img_b := b::text || '/' || gen_random_uuid()::text || '.png';

  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model,perspective) values (gen_random_uuid(),a,img,'x','p','m','professor'); r:=r||'FAIL anon insert;'; exception when insufficient_privilege then r:=r||'ok anon insert denied;'; end;
  -- Week 6: perspective is a public Explore display column; the prompt is not.
  begin perform perspective from public.ai_captions limit 1; r:=r||'ok anon reads perspective (public Explore);'; exception when insufficient_privilege then r:=r||'FAIL anon cannot read perspective;'; end;
  begin perform generation_prompt from public.ai_captions limit 1; r:=r||'FAIL anon read prompt;'; exception when insufficient_privilege then r:=r||'ok anon prompt denied;'; end;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  insert into storage.objects(bucket_id,name,owner_id) values ('week4-media', img, a::text);
  insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model,perspective) values (gen_random_uuid(),a,img,'prof take','prompt','m','professor') returning id, perspective into cap, p;
  r:=r||case when p='professor' then 'ok professor insert stored;' else 'FAIL professor not stored;' end;
  insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model,perspective) values (gen_random_uuid(),a,img,'student take','prompt','m','student') returning perspective into p;
  r:=r||case when p='student' then 'ok student insert stored;' else 'FAIL student not stored;' end;
  insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model) values (gen_random_uuid(),a,img,'older client','prompt','m') returning perspective into p;
  r:=r||case when p='student' then 'ok omitted perspective defaults to student;' else 'FAIL default is not student;' end;
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model,perspective) values (gen_random_uuid(),a,img,'x','p','m','teacher'); r:=r||'FAIL teacher accepted;'; exception when check_violation then r:=r||'ok unknown perspective rejected;'; end;
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model,perspective) values (gen_random_uuid(),a,img,'x','p','m','Professor'); r:=r||'FAIL wrong case accepted;'; exception when check_violation then r:=r||'ok wrong-case perspective rejected;'; end;
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model,perspective) values (gen_random_uuid(),a,img,'x','p','m',null); r:=r||'FAIL null accepted;'; exception when not_null_violation then r:=r||'ok null perspective rejected;'; end;
  begin update public.ai_captions set perspective='student' where id=cap; r:=r||'FAIL perspective update;'; exception when insufficient_privilege then r:=r||'ok perspective update denied;'; end;
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model,perspective) values (gen_random_uuid(),b,img_b,'x','p','m','professor'); r:=r||'FAIL impersonated creator;'; exception when insufficient_privilege or check_violation then r:=r||'ok creator impersonation still denied;'; end;

  -- Explore is global: another signed-in user reads the caption and its perspective.
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  select perspective into p from public.ai_captions where id=cap;
  r:=r||case when p='professor' then 'ok other user reads perspective;' else 'FAIL other user cannot read perspective;' end;

  raise exception 'RESULTS(rolled back): %', r;
end $$;
