-- Week 5 · Caption Lab: joke perspective (professor feedback).
-- Each caption is written from a student's or a professor's point of view, and
-- the row records which one. Additive: Week 4 rows were written in a student
-- voice, so they backfill to 'student'. No policies change; RLS is as in Week 4.
alter table public.ai_captions
  add column if not exists perspective text not null default 'student';

alter table public.ai_captions drop constraint if exists ai_captions_perspective_valid;
alter table public.ai_captions add constraint ai_captions_perspective_valid
  check (perspective in ('student', 'professor'));

comment on column public.ai_captions.perspective is
  'Week 5. Point of view the caption was written from (student or professor); also part of generation_prompt.';

-- INSERT stays column-specific, as in Week 4; SELECT is already table-wide.
grant insert (perspective) on table public.ai_captions to authenticated;
