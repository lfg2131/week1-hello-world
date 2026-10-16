-- Week 4 live RLS/grant check. Run in the SQL editor; it ALWAYS rolls back by
-- raising a final exception whose message lists every result ("ok ..." / "FAIL ...").
-- Storage blocks direct SQL deletes, so the delete policy predicate is evaluated directly.
do $$
declare a uuid; b uuid; r text := ''; img text; img_b text; img2 text; cap uuid; n int; delq text;
begin
  select id into a from auth.users order by created_at limit 1;
  select id into b from auth.users where id <> a order by created_at limit 1;
  img := a::text || '/' || gen_random_uuid()::text || '.jpg';
  img2 := a::text || '/' || gen_random_uuid()::text || '.webp';
  img_b := b::text || '/' || gen_random_uuid()::text || '.png';
  select qual into delq from pg_policies where policyname='week4_media_delete_own_unreferenced';

  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model) values (gen_random_uuid(),a,img,'x','p','m'); r:=r||'FAIL anon insert captions;'; exception when insufficient_privilege then r:=r||'ok anon insert captions denied;'; end;
  -- Week 6: public Explore lets anon read display columns, never the prompt.
  begin perform generation_prompt from public.ai_captions limit 1; r:=r||'FAIL anon select prompt;'; exception when insufficient_privilege then r:=r||'ok anon select prompt denied;'; end;
  begin insert into public.caption_votes(caption_id,user_id,vote) values (gen_random_uuid(),a,1); r:=r||'FAIL anon vote;'; exception when insufficient_privilege then r:=r||'ok anon vote denied;'; end;
  begin perform 1 from public.caption_votes limit 1; r:=r||'FAIL anon select votes;'; exception when insufficient_privilege then r:=r||'ok anon select votes denied;'; end;
  begin insert into storage.objects(bucket_id,name,owner_id) values ('week4-media', img, a::text); r:=r||'FAIL anon upload;'; exception when insufficient_privilege or check_violation then r:=r||'ok anon upload denied;'; end;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  begin insert into storage.objects(bucket_id,name,owner_id) values ('week4-media', img_b, a::text); r:=r||'FAIL upload into other folder;'; exception when insufficient_privilege then r:=r||'ok upload other folder denied;'; end;
  begin insert into storage.objects(bucket_id,name,owner_id) values ('week4-media', a::text||'/../x.jpg', a::text); r:=r||'FAIL traversal path;'; exception when insufficient_privilege then r:=r||'ok bad path denied;'; end;
  insert into storage.objects(bucket_id,name,owner_id) values ('week4-media', img, a::text); r:=r||'ok own upload;';
  insert into storage.objects(bucket_id,name,owner_id) values ('week4-media', img2, a::text);
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model) values (gen_random_uuid(),b,img_b,'x','p','m'); r:=r||'FAIL impersonate creator;'; exception when insufficient_privilege or check_violation then r:=r||'ok impersonate creator denied;'; end;
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model) values (gen_random_uuid(),a,a::text||'/'||gen_random_uuid()||'.jpg','x','p','m'); r:=r||'FAIL caption for nonexistent object;'; exception when insufficient_privilege then r:=r||'ok nonexistent image denied;'; end;
  begin insert into public.ai_captions(id,batch_id,creator_id,source_image_path,caption,generation_prompt,model) values (gen_random_uuid(),gen_random_uuid(),a,img,'x','p','m'); r:=r||'FAIL client-chosen id;'; exception when insufficient_privilege then r:=r||'ok client id column denied;'; end;
  insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model,tone) values (gen_random_uuid(),a,img,'cap','prompt','m','dry') returning id into cap; r:=r||'ok own caption insert;';
  begin update public.ai_captions set caption='hacked' where id=cap; r:=r||'FAIL update caption;'; exception when insufficient_privilege then r:=r||'ok update caption denied;'; end;
  begin delete from public.ai_captions where id=cap; r:=r||'FAIL delete caption;'; exception when insufficient_privilege then r:=r||'ok delete caption denied;'; end;
  execute format('select count(*) from storage.objects where name=%L and (%s)', img, delq) into n; r:=r||case when n=0 then 'ok referenced image not deletable;' else 'FAIL referenced deletable;' end;
  execute format('select count(*) from storage.objects where name=%L and (%s)', img2, delq) into n; r:=r||case when n=1 then 'ok own orphan deletable;' else 'FAIL orphan cleanup blocked;' end;
  begin insert into public.caption_votes(caption_id,user_id,vote) values (cap,b,1); r:=r||'FAIL vote as other user;'; exception when insufficient_privilege then r:=r||'ok vote impersonation denied;'; end;
  begin insert into public.caption_votes(caption_id,user_id,vote) values (cap,a,5); r:=r||'FAIL vote=5;'; exception when check_violation then r:=r||'ok invalid vote rejected;'; end;
  insert into public.caption_votes(caption_id,user_id,vote) values (cap,a,1); r:=r||'ok vote +1 inserted;';
  begin insert into public.caption_votes(caption_id,user_id,vote) values (cap,a,-1); r:=r||'FAIL duplicate vote;'; exception when unique_violation then r:=r||'ok duplicate vote rejected;'; end;
  begin update public.caption_votes set vote=-1 where caption_id=cap; r:=r||'FAIL vote update;'; exception when insufficient_privilege then r:=r||'ok vote update denied;'; end;
  begin delete from public.caption_votes where caption_id=cap; r:=r||'FAIL vote delete;'; exception when insufficient_privilege then r:=r||'ok vote delete denied;'; end;
  begin insert into public.caption_votes(caption_id,user_id,vote) values (gen_random_uuid(),a,1); r:=r||'FAIL vote nonexistent caption;'; exception when foreign_key_violation then r:=r||'ok nonexistent caption FK;'; end;

  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  select count(*) into n from public.ai_captions where id=cap; r:=r||case when n=1 then 'ok B sees feed caption;' else 'FAIL B cannot see caption;' end;
  select count(*) into n from public.caption_votes where caption_id=cap; r:=r||case when n=0 then 'ok B cannot see A vote;' else 'FAIL B sees A vote;' end;
  select count(*) into n from storage.objects where bucket_id='week4-media' and name=img; r:=r||case when n=1 then 'ok B reads captioned image;' else 'FAIL B cannot read captioned image;' end;
  select count(*) into n from storage.objects where bucket_id='week4-media' and name=img2; r:=r||case when n=0 then 'ok B cannot read A private upload;' else 'FAIL B reads A private upload;' end;
  execute format('select count(*) from storage.objects where name=%L and (%s)', img2, delq) into n; r:=r||case when n=0 then 'ok B cannot delete A file;' else 'FAIL B can delete A file;' end;
  insert into public.caption_votes(caption_id,user_id,vote) values (cap,b,-1); r:=r||'ok B vote -1 inserted;';

  raise exception 'RESULTS(rolled back): %', r;
end $$;
