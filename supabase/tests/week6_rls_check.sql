-- Week 6 live check: public Explore, ten-word captions, admin membership.
-- ALWAYS rolls back by raising a final exception listing every result
-- ("ok ..." / "FAIL ..."). Uses two existing users; writes nothing permanent.
do $$
declare a uuid; b uuid; r text := ''; img text; unposted text; cap uuid; n int; t text;
begin
  -- a: a non-admin user; b: another non-admin user.
  select id into a from auth.users u where not exists (select 1 from public.caption_lab_admins m where m.user_id = u.id) order by created_at limit 1;
  select id into b from auth.users u where id <> a and not exists (select 1 from public.caption_lab_admins m where m.user_id = u.id) order by created_at limit 1;
  img := a::text || '/' || gen_random_uuid()::text || '.jpg';
  unposted := a::text || '/' || gen_random_uuid()::text || '.jpg';

  -- Setup as user a: one published image (with a caption) and one unposted upload.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  insert into storage.objects(bucket_id,name,owner_id) values ('week4-media', img, a::text), ('week4-media', unposted, a::text);
  insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model)
    values (gen_random_uuid(),a,img,'Exactly ten words in this caption, so it should pass.','secret prompt','m') returning id into cap;
  r:=r||'ok ten-word caption accepted;';
  begin
    insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model)
      values (gen_random_uuid(),a,img,'one two three four five six seven eight nine ten eleven','p','m');
    r:=r||'FAIL eleven-word caption accepted;';
  exception when check_violation then r:=r||'ok eleven-word caption rejected by DB;'; end;

  -- Anonymous visitor.
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','{"role":"anon"}',true);
  select count(*) into n from public.ai_captions where id = cap;
  r:=r||case when n=1 then 'ok anon reads published caption;' else 'FAIL anon cannot read caption;' end;
  select caption into t from public.ai_captions where id = cap;
  r:=r||case when t like 'Exactly%' then 'ok anon reads display columns;' else 'FAIL anon display columns;' end;
  begin perform generation_prompt from public.ai_captions limit 1; r:=r||'FAIL anon read prompt;'; exception when insufficient_privilege then r:=r||'ok anon prompt denied;'; end;
  begin perform user_context from public.ai_captions limit 1; r:=r||'FAIL anon read context;'; exception when insufficient_privilege then r:=r||'ok anon context denied;'; end;
  begin perform creator_id from public.ai_captions limit 1; r:=r||'FAIL anon read creator;'; exception when insufficient_privilege then r:=r||'ok anon creator denied;'; end;
  begin perform model from public.ai_captions limit 1; r:=r||'FAIL anon read model;'; exception when insufficient_privilege then r:=r||'ok anon model denied;'; end;
  begin insert into public.ai_captions(batch_id,creator_id,source_image_path,caption,generation_prompt,model) values (gen_random_uuid(),a,img,'x','p','m'); r:=r||'FAIL anon insert;'; exception when insufficient_privilege then r:=r||'ok anon create caption denied;'; end;
  begin update public.ai_captions set caption='pwned' where id=cap; r:=r||'FAIL anon update;'; exception when insufficient_privilege then r:=r||'ok anon modify caption denied;'; end;
  begin delete from public.ai_captions where id=cap; r:=r||'FAIL anon delete;'; exception when insufficient_privilege then r:=r||'ok anon delete caption denied;'; end;
  begin insert into public.caption_votes(caption_id,user_id,vote) values (cap,a,1); r:=r||'FAIL anon vote;'; exception when insufficient_privilege then r:=r||'ok anon vote denied;'; end;
  begin perform 1 from public.caption_votes limit 1; r:=r||'FAIL anon read votes;'; exception when insufficient_privilege then r:=r||'ok anon read votes denied;'; end;
  select count(*) into n from public.profiles;
  r:=r||case when n=0 then 'ok anon sees no profiles;' else 'FAIL anon sees profiles;' end;
  begin perform 1 from public.caption_lab_admins; r:=r||'FAIL anon read admins;'; exception when insufficient_privilege then r:=r||'ok anon read admins denied;'; end;
  select count(*) into n from storage.objects where bucket_id='week4-media' and name=img;
  r:=r||case when n=1 then 'ok anon sees published image object;' else 'FAIL anon cannot see published image;' end;
  select count(*) into n from storage.objects where bucket_id='week4-media' and name=unposted;
  r:=r||case when n=0 then 'ok anon cannot see unposted upload;' else 'FAIL anon sees unposted upload;' end;
  select count(*) into n from storage.objects where bucket_id<>'week4-media';
  r:=r||case when n=0 then 'ok anon sees no other buckets;' else 'FAIL anon sees other buckets;' end;
  begin insert into storage.objects(bucket_id,name,owner_id) values ('week4-media', a::text||'/'||gen_random_uuid()::text||'.jpg', null); r:=r||'FAIL anon upload;'; exception when insufficient_privilege then r:=r||'ok anon upload denied;'; end;

  -- Authenticated non-admin (user b): normal app access unchanged, no admin powers.
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
  select generation_prompt into t from public.ai_captions where id=cap;
  r:=r||case when t='secret prompt' then 'ok signed-in read unchanged;' else 'FAIL signed-in read changed;' end;
  begin perform 1 from public.caption_lab_admins; r:=r||'FAIL user read admins;'; exception when insufficient_privilege then r:=r||'ok user read admins denied;'; end;
  begin insert into public.caption_lab_admins(user_id,is_superadmin) values (b,true); r:=r||'FAIL self-grant admin;'; exception when insufficient_privilege then r:=r||'ok self-grant admin denied;'; end;
  begin update public.caption_lab_admins set is_superadmin=true where user_id=b; r:=r||'FAIL admin update;'; exception when insufficient_privilege then r:=r||'ok admin update denied;'; end;
  begin update public.ai_captions set caption='edit' where id=cap; r:=r||'FAIL user caption update;'; exception when insufficient_privilege then r:=r||'ok user caption update denied;'; end;
  begin delete from public.ai_captions where id=cap; r:=r||'FAIL user caption delete;'; exception when insufficient_privilege then r:=r||'ok user caption delete denied;'; end;
  insert into public.caption_votes(caption_id,user_id,vote) values (cap,b,1);
  r:=r||'ok user vote inserted;';
  begin insert into public.caption_votes(caption_id,user_id,vote) values (cap,b,-1); r:=r||'FAIL duplicate vote;'; exception when unique_violation then r:=r||'ok duplicate vote rejected;'; end;
  begin insert into public.caption_votes(caption_id,user_id,vote) values (cap,a,1); r:=r||'FAIL vote as other user;'; exception when insufficient_privilege then r:=r||'ok vote impersonation denied;'; end;

  -- Service role (admin app server only): reads membership, cannot change it.
  perform set_config('role','service_role',true);
  perform set_config('request.jwt.claims','{"role":"service_role"}',true);
  select count(*) into n from public.caption_lab_admins where is_superadmin;
  r:=r||case when n>=1 then 'ok service role reads admins;' else 'FAIL service role cannot read admins;' end;
  begin insert into public.caption_lab_admins(user_id,is_superadmin) values (b,true); r:=r||'FAIL service role granted admin;'; exception when insufficient_privilege then r:=r||'ok service role cannot grant admin;'; end;
  begin update public.ai_captions set caption='one two three four five six seven eight nine ten eleven' where id=cap; r:=r||'FAIL long edit accepted;'; exception when check_violation then r:=r||'ok long admin edit rejected by DB;'; end;
  begin update public.ai_captions set creator_id=b where id=cap; r:=r||'FAIL service role changed creator;'; exception when insufficient_privilege then r:=r||'ok service role cannot reassign creator;'; end;
  begin update public.ai_captions set generation_prompt='x' where id=cap; r:=r||'FAIL service role changed prompt;'; exception when insufficient_privilege then r:=r||'ok service role cannot rewrite prompt;'; end;
  update public.ai_captions set caption='Admin edit, still under ten words.', perspective='professor' where id=cap;
  r:=r||'ok admin edit within limit saved;';
  begin insert into public.caption_votes(caption_id,user_id,vote) values (cap,a,1); r:=r||'FAIL service role vote;'; exception when insufficient_privilege then r:=r||'ok service role cannot vote;'; end;
  delete from public.ai_captions where id=cap;
  select count(*) into n from public.caption_votes where caption_id=cap;
  r:=r||case when n=0 then 'ok delete cascades votes;' else 'FAIL votes left behind;' end;

  raise exception 'RESULTS(rolled back): %', r;
end $$;
