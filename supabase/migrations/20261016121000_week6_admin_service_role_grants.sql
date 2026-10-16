-- Week 6 · Caption Lab admin app: least-privilege grants for its server-only
-- service-role client. This shared project does not give service_role default
-- privileges on new tables, so the Week 4 tables need explicit grants.
-- The service-role key lives only in the admin app's server environment, and
-- every admin request verifies Google sign-in + caption_lab_admins first.
-- No anon/authenticated privilege, policy, or RLS setting changes here.

-- Media CRUD: read everything, create AI captions, edit the caption text and
-- its labels only (not creator, image, prompt, or model), delete captions
-- (votes on a deleted caption cascade through the existing foreign key).
grant select, delete on table public.ai_captions to service_role;
grant insert (batch_id, creator_id, source_image_path, caption, generation_prompt, user_context, tone, model, image_alt, perspective)
  on table public.ai_captions to service_role;
grant update (caption, tone, perspective) on table public.ai_captions to service_role;

-- Votes and ratings: read only.
grant select on table public.caption_votes to service_role;
