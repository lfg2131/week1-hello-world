-- Week 6 · Caption Lab: public Explore, ten-word captions, admin membership.
-- Additive only. No table is recreated, RLS stays enabled everywhere, and no
-- existing policy or authenticated privilege is altered or dropped.

-- ---------------------------------------------------------------------------
-- 1. Public Explore (signed-out visitors can read published captions)
-- ---------------------------------------------------------------------------

-- Column-level SELECT for anon: display fields only. generation_prompt,
-- user_context, creator_id and model stay hidden from signed-out visitors.
-- No INSERT/UPDATE/DELETE is granted to anon.
grant select (id, batch_id, caption, source_image_path, image_alt, tone, perspective, created_at)
  on table public.ai_captions to anon;

drop policy if exists "week6_ai_captions_select_anon" on public.ai_captions;
create policy "week6_ai_captions_select_anon"
on public.ai_captions for select to anon
using (true);

-- The bucket stays private. Signed-out visitors may only sign URLs for images
-- that back a published caption; uploads that never became a post stay hidden.
drop policy if exists "week6_media_select_anon_captioned" on storage.objects;
create policy "week6_media_select_anon_captioned"
on storage.objects for select to anon
using (
  bucket_id = 'week4-media'
  and exists (select 1 from public.ai_captions c where c.source_image_path = objects.name)
);

-- ---------------------------------------------------------------------------
-- 2. Ten-word captions (professor feedback)
-- ---------------------------------------------------------------------------

-- NOT VALID: enforced for every new INSERT and every UPDATE (including admin
-- edits) without rewriting historic captions. Word = run of non-whitespace,
-- matching countWords() in lib/captions/validation.ts.
alter table public.ai_captions drop constraint if exists ai_captions_caption_max_words;
alter table public.ai_captions add constraint ai_captions_caption_max_words
  check (cardinality(regexp_split_to_array(regexp_replace(caption, '^\s+|\s+$', '', 'g'), '\s+')) <= 10)
  not valid;

-- ---------------------------------------------------------------------------
-- 3. Admin membership for the separate Caption Lab admin app
-- ---------------------------------------------------------------------------

-- Deliberately NOT a column on public.profiles: profiles is shared and users can
-- update their own row, so a flag there could be self-granted.
create table if not exists public.caption_lab_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  is_superadmin boolean not null default false,
  granted_at timestamptz not null default now(),
  note text
);

comment on table public.caption_lab_admins is
  'Week 6. Caption Lab admin membership. Read only by the admin app server (service role). Changed only through trusted SQL (SQL Editor / MCP), never by clients.';

alter table public.caption_lab_admins enable row level security;

-- No client role can read or write membership. Supabase's default privileges
-- would otherwise grant anon/authenticated access to new public tables.
revoke all on table public.caption_lab_admins from public, anon, authenticated;
revoke all on table public.caption_lab_admins from service_role;
grant select on table public.caption_lab_admins to service_role;
-- Intentionally no RLS policies: with RLS on and no policy, every client
-- request is denied. Only the table owner (SQL Editor) can grant membership.
