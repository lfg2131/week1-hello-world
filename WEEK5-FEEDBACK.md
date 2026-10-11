# Week 5 · Caption Lab: feedback and iteration

Week 5 is an iteration on the Week 4 app (Google auth, Gemini captions, voting, RLS, Vercel), driven by two pieces of professor feedback. Everything from Week 4 still works the same way. See `WEEK4-RATING-APP.md` for the base design.

## Feedback → changes
| Feedback | What changed |
|---|---|
| “I need to make a global list to see all the generated posts.” | New **Explore** page (`/explore`): every generated post from every user, newest first. |
| “The user should be able to choose whose perspective it should be making the joke from, like student perspective or professor perspective.” | New **Perspective** choice on Create (**Student** · **Professor**). It changes the Gemini prompt, is saved on every caption, and is shown wherever captions appear. |

## 1. Explore: the global list
- Protected like Rate and Create. The navigation is now **Rate · Explore · Create**, and the current page is highlighted. On phones the header is a single row: the logo mark, the three tabs filling the width, and Sign out. Nothing overflows down to 320 px.
- One card per post: the photo, its three captions, a **Student/Professor perspective** badge, the tone, and how long ago it was posted. Your own posts carry a “Your post” label.
- Images use the same private bucket and short-lived signed URLs as Rate, with one batched signing call per page.
- The page shows the newest 120 posts (360 captions) and says so if there are more. If nothing exists yet, an empty state links to Create. A skeleton shows while the page loads.
- Deliberately left out: likes, comments, follows, public vote counts, search, and rankings. Explore never reads `caption_votes`. Rate stays focused on one unrated caption at a time.

## 2. Perspective: Student or Professor
- **Create** has a two-option segmented control under the heading “Whose joke is it?”. **Student** is the default. Each option has a one-line hint, and the loading message names the voice (“Writing 3 captions as a professor…”).
- **Server-side validation** (`parseGenerationOptions`): the value must be exactly `student` or `professor`. A missing value means `student`. Anything else is rejected before Gemini is called, and the upload is cleaned up.
- **It changes the prompt.** The system instruction explains how to write from a named point of view: in that person's voice, never announcing it, and never naming a specific school unless the creator's note does. The per-request prompt then adds one of these lines:
  - `Perspective: Student: write as a college student (… lives in the dorms and explores the city on weekends). Frame of reference: classes, deadlines, roommates, dining halls, group chats, being broke, …`
  - `Perspective: Professor: write as a college professor or instructor. Frame of reference: lectures, grading, office hours, emails from students, … Wry and affectionate, never mean about students.`
- **It's persisted.** All three rows of a generation store `perspective`. `generation_prompt` is still the verbatim transcript sent to Gemini, so it includes the perspective line.
- **It's shown where it helps.** Badges appear on the generated-result cards, on Explore cards, on the Rate card (a small badge above the caption, so voters know who is supposed to be joking), and on “Your recent drops”.
- After generating, **“Try a professor take”** (or “student take”) brings the same photo back with the other voice selected, so the two can be compared quickly.

## Schema change (`supabase/migrations/20261011204434_week5_caption_perspective.sql`)
```sql
alter table public.ai_captions add column if not exists perspective text not null default 'student';
alter table public.ai_captions add constraint ai_captions_perspective_valid check (perspective in ('student', 'professor'));
grant insert (perspective) on table public.ai_captions to authenticated;
```
- Existing Week 4 rows were written by a student-voiced prompt, so they backfill to `student`.
- The Week 4 INSERT grant is column-specific, so the new column needs its own column grant. SELECT was already table-wide.
- **No policy, RLS, or other table changed.** There are no anon privileges and no UPDATE/DELETE for clients, so perspective, like everything else in a row, is immutable after insert.

## Security (unchanged guarantees)
User identity comes only from the verified session. There is still no service role, `GEMINI_API_KEY` stays server-only, and anonymous users can't mutate anything. Explore and Rate render only display fields.
- `supabase/tests/week5_perspective_check.sql` (always rolls back): **11/11 ok**. It covers: anon insert/read denied, professor/student stored, omitted value defaults to student, unknown/wrong-case/null rejected, update denied, creator impersonation denied, and other users can read the perspective.
- `supabase/tests/week4_rls_check.sql` re-run: **29/29 ok**.
- Supabase security and performance advisors: no findings for `ai_captions`, `caption_votes`, or `week4-media` (all reported items belong to the shared project's other objects).

## Small polish
- **Mobile Rate:** the vote buttons were about 250 px below the fold on a 667 px-tall phone. A shorter phone-only photo cap (42vh), a one-row header, and tighter spacing bring the caption and the Funny / Not funny buttons onto the first screen for typical captions. Desktop is unchanged.
- Loading states for Rate, Create, and Explore. Consistent tab, segment, and badge styling. Disabled styling for the tone and perspective controls while generating.
- On Rate, the tone chip moved off the photo and next to the perspective badge.
- Honest errors: when Gemini is overloaded (5xx such as 503 “high demand”), Create now says “The AI is busy right now” instead of blaming the photo. The retry policy is unchanged.
- Replaced the `next/image` `priority` prop, deprecated in Next.js 16, with `preload`.

## Testing
- `npm test`: 92 unit tests, with Gemini always mocked. New coverage includes:
  - Perspective: default student; only `student`/`professor` accepted; invalid values rejected server-side before Gemini; the student and professor prompts differ and the actual Gemini request contains the chosen one; all 3 rows store it; `generation_prompt` includes it.
  - Explore: signed-out visitors redirected; signed-in access; the query is global, newest first, with no vote or creator filter; cards render image + captions + perspective; the empty state; escaped captions.
  - Rate still filters to unrated captions and shows the badge. Create defaults the control to Student.
- `npm run test:smoke`: live server checks, now including `/explore` → `/login` when signed out and anonymous REST denial with the new column.
