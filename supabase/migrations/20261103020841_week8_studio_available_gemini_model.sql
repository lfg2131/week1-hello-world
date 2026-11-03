-- Gemini 3.8 currently rejects real generation with 503 UNAVAILABLE while
-- Gemini 3.6 Flash succeeds with the same authorized key. Limit this change to
-- the active Studio demonstration; old main/admin catalog rows and steps stay intact.
begin;
do $$
declare
 google_provider_id uuid;
 replacement_id uuid;
 replacement_active boolean;
 demo record;
 changed integer;
 demo_count integer := 0;
begin
 select id into strict google_provider_id from public.caption_lab_providers
  where slug='google-gemini' and active for share;
 -- Never reactivate a model an administrator intentionally disabled.
 insert into public.caption_lab_models(provider_id,name,model_key,active)
  values(google_provider_id,'Gemini 3.6 Flash','gemini-3.6-flash',true)
  on conflict(provider_id,model_key) do nothing;
 select id,active into strict replacement_id,replacement_active
  from public.caption_lab_models
  where caption_lab_models.provider_id=google_provider_id and model_key='gemini-3.6-flash'
  for share;
 if not replacement_active then
  raise exception 'Existing Gemini 3.6 Flash model is inactive; review before switching Studio';
 end if;
 -- Match the explicit seed demonstration and serialize with Studio edit/start RPCs.
 for demo in select id from public.caption_lab_chains
  where application='studio' and name='Image → angle → five captions'
    and enabled and archived_at is null
  for update
 loop
  demo_count:=demo_count+1;
  update public.caption_lab_steps s set model_id=replacement_id
   where s.chain_id=demo.id
    and exists(select 1 from public.caption_lab_models old_model
      where old_model.id=s.model_id and old_model.provider_id=google_provider_id
        and old_model.model_key='gemini-3.8-flash');
  get diagnostics changed=row_count;
  if changed>0 then
   update public.caption_lab_chains set revision=revision+1 where id=demo.id;
  end if;
 end loop;
 if demo_count=0 then raise exception 'Active Studio demonstration missing; inspect before changing another chain'; end if;
 -- Historical runs/attempts contain immutable snapshots and are never updated.
end $$;
commit;
