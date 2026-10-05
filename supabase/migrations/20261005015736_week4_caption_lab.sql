-- Week 4 · Caption Lab: AI caption generations, immutable votes, private media.
-- Additive and limited to Week 4-owned objects in the shared project.
-- Nothing here alters or drops pre-existing tables, policies, or buckets.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per AI caption. A generation inserts three rows sharing batch_id and
-- source_image_path. Image bytes live in Storage; only the object path is here.
create table if not exists public.ai_captions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  creator_id uuid not null references auth.users (id) on delete cascade,
  source_image_path text not null,
  caption text not null,
  generation_prompt text not null,
  user_context text,
  tone text,
  model text not null,
  created_at timestamptz not null default now(),
  constraint ai_captions_source_image_path_format check (
    source_image_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  ),
  -- The image must live in the creator's own top-level folder.
  constraint ai_captions_source_image_owned check (split_part(source_image_path, '/', 1) = creator_id::text),
  constraint ai_captions_caption_length check (char_length(btrim(caption)) between 1 and 200),
  constraint ai_captions_generation_prompt_length check (char_length(generation_prompt) between 1 and 20000),
  constraint ai_captions_user_context_length check (user_context is null or char_length(user_context) between 1 and 200),
  constraint ai_captions_tone_valid check (tone is null or tone in ('clever', 'dry', 'chaotic')),
  constraint ai_captions_model_length check (char_length(model) between 1 and 100)
);

comment on table public.ai_captions is
  'Week 4 Caption Lab. AI-generated captions (3 per batch) for a private week4-media image. generation_prompt is the exact text sent to the model.';

create index if not exists ai_captions_created_at_idx on public.ai_captions (created_at desc);
create index if not exists ai_captions_creator_created_idx on public.ai_captions (creator_id, created_at desc);
create index if not exists ai_captions_source_image_path_idx on public.ai_captions (source_image_path);
create index if not exists ai_captions_batch_id_idx on public.ai_captions (batch_id);

-- One immutable vote per (user, caption). The first rating is an INSERT; there
-- is no update or delete path for clients.
create table if not exists public.caption_votes (
  id uuid primary key default gen_random_uuid(),
  caption_id uuid not null references public.ai_captions (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vote smallint not null,
  created_at timestamptz not null default now(),
  constraint caption_votes_vote_valid check (vote in (-1, 1)),
  -- Leading user_id also serves user_id lookups; no separate index needed.
  constraint caption_votes_user_caption_key unique (user_id, caption_id)
);

comment on table public.caption_votes is
  'Week 4 Caption Lab. One immutable Funny (+1) / Not Funny (-1) vote per user per caption.';

create index if not exists caption_votes_caption_id_idx on public.caption_votes (caption_id);

-- ---------------------------------------------------------------------------
-- Privileges: GRANT decides which operations a role may attempt.
-- Least privilege: no anon access, no UPDATE/DELETE/TRUNCATE for clients,
-- INSERT limited to the columns the app writes (id/created_at stay server-set).
-- ---------------------------------------------------------------------------

revoke all on table public.ai_captions from public, anon, authenticated;
revoke all on table public.caption_votes from public, anon, authenticated;

grant select on table public.ai_captions to authenticated;
grant insert (batch_id, creator_id, source_image_path, caption, generation_prompt, user_context, tone, model)
  on table public.ai_captions to authenticated;

grant select on table public.caption_votes to authenticated;
grant insert (caption_id, user_id, vote) on table public.caption_votes to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: dedicated private bucket (must exist before policies reference it)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('week4-media', 'week4-media', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Row Level Security: RLS decides which rows an allowed operation may touch.
-- ---------------------------------------------------------------------------

alter table public.ai_captions enable row level security;
alter table public.caption_votes enable row level security;

drop policy if exists "week4_ai_captions_select_authenticated" on public.ai_captions;
create policy "week4_ai_captions_select_authenticated"
on public.ai_captions for select to authenticated
using (true);

-- Creators may only insert as themselves, for an image they already uploaded
-- to their own folder of the Week 4 bucket.
drop policy if exists "week4_ai_captions_insert_own" on public.ai_captions;
create policy "week4_ai_captions_insert_own"
on public.ai_captions for insert to authenticated
with check (
  creator_id = (select auth.uid())
  and split_part(source_image_path, '/', 1) = (select auth.uid())::text
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'week4-media'
      and o.name = source_image_path
      and o.owner_id = (select auth.uid())::text
  )
);

-- Voters see only their own votes; other users' voting is never exposed.
drop policy if exists "week4_caption_votes_select_own" on public.caption_votes;
create policy "week4_caption_votes_select_own"
on public.caption_votes for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "week4_caption_votes_insert_own" on public.caption_votes;
create policy "week4_caption_votes_insert_own"
on public.caption_votes for insert to authenticated
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage policies: write only <auth.uid()>/<uuid>.<ext>; no UPDATE (no upsert).
-- ---------------------------------------------------------------------------

drop policy if exists "week4_media_insert_own_folder" on storage.objects;
create policy "week4_media_insert_own_folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'week4-media'
  and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

-- Owners can read their own uploads (needed before captions exist); any
-- signed-in user can read images that back a caption in the feed.
drop policy if exists "week4_media_select_own_or_captioned" on storage.objects;
create policy "week4_media_select_own_or_captioned"
on storage.objects for select to authenticated
using (
  bucket_id = 'week4-media'
  and (
    split_part(name, '/', 1) = (select auth.uid())::text
    or exists (select 1 from public.ai_captions c where c.source_image_path = name)
  )
);

-- Owners may delete only their own uploads that no caption references, which
-- covers cleanup after failed generation without breaking the feed.
drop policy if exists "week4_media_delete_own_unreferenced" on storage.objects;
create policy "week4_media_delete_own_unreferenced"
on storage.objects for delete to authenticated
using (
  bucket_id = 'week4-media'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and not exists (select 1 from public.ai_captions c where c.source_image_path = name)
);
