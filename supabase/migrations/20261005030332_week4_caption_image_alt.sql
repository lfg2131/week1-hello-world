-- Week 4 · Caption Lab: AI-written literal alt text for the source image, so
-- screen-reader users get a real description of each photo in the feed.
alter table public.ai_captions add column if not exists image_alt text;

alter table public.ai_captions drop constraint if exists ai_captions_image_alt_length;
alter table public.ai_captions add constraint ai_captions_image_alt_length
  check (image_alt is null or char_length(btrim(image_alt)) between 1 and 300);

grant insert (image_alt) on table public.ai_captions to authenticated;
