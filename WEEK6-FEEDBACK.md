# Week 6 · Caption Lab: feedback iteration + admin panel

Week 6 builds on the Week 5 app (`WEEK5-FEEDBACK.md`, `WEEK4-RATING-APP.md`) with the six changes requested in the Week 5 feedback meeting. The new admin panel is a **separate app and repository**: [`lfg2131/caption-lab-admin`](https://github.com/lfg2131/caption-lab-admin). Both apps use the same Supabase project.

## Feedback → changes

| # | Feedback | What changed |
|---|---|---|
| 1 | One caption per image card | Explore shows **one card per `ai_captions` row**: image, caption, perspective badge, Funny / Not funny. The three captions from one upload are three cards that repeat the same stored photo (one file, one signed URL per photo). Still three captions per upload, newest first. |
| 2 | Explore must be public | `/` redirects everyone to `/explore`, which needs no sign-in. `/login` and `/auth/callback` stay public. `/rate`, `/create` and `/api/captions` still require a session. |
| 3 | Vote directly from Explore | Every card has **Funny / Not funny**. Signed in: it uses the existing `submitVote` action (user id from the verified session, one vote per user per caption from the DB unique key), shows "Vote saved ✓", disables double clicks, and shows "You voted Funny" again after a reload. Signed out: the buttons are visible, and clicking one asks you to sign in without inserting anything. After Google sign-in you come back to Explore. |
| 4 | Background generation notification | Generation runs in a `GenerationProvider` mounted in the shared layout. It calls a **Route Handler** (`POST /api/captions`) with `fetch()`, so moving from Create to Explore never cancels it. A bottom-right notification shows "Generating your captions…", then "Your captions are ready!" with **View your captions** (Explore, scrolled to and highlighting the new cards), or the error message. Duplicate starts are blocked. |
| 5 | Max ten words per caption | The Gemini prompt states the limit, the server rejects any caption over 10 words, and a rejected batch is regenerated **once** (bounded retry). A `NOT VALID` database check enforces the limit on every new insert and every edit (including admin edits) without rewriting historic captions. |
| 6 | Preserve everything else | Google OAuth, sign out, Gemini, uploads, perspective, tone, context, persisted prompt, Rate, RLS and the Week 5 styling are unchanged. Nothing unrelated was added. |

### Why a Route Handler for generation
Next.js 16 sends Server Actions **one at a time per client**. A 10–25 s Gemini call made as an action would have queued every Explore vote behind it. A plain `fetch()` to `app/api/captions/route.ts` runs independently and keeps going across client-side navigation. The handler only accepts JSON (so a cross-site form cannot call it) and calls the same `createCaptions()` code, which re-verifies the session, the image bytes and the rate limit.

**Limitation:** a *full browser reload* while a caption is generating resets the in-tab notification state. The page asks before unloading, and the server may still finish and save the captions, which then appear on Explore. Navigation inside the app is fully supported.

### Return to Explore after login
"Sign in to vote" links to `/login?next=/explore`. Just before the Google redirect, the browser sets a 10-minute `caption_lab_next` cookie. The callback accepts only `/explore`, `/rate` or `/create` from it, and always clears it. The OAuth `redirectTo` stays exactly `<origin>/auth/callback`, so no Supabase redirect allow-list change is needed for this.

## Database (`supabase/migrations/20261016120000_week6_public_explore_admins.sql`, `20261016121000_week6_admin_service_role_grants.sql`)

Both migrations are additive. RLS stays on for every table, no table is recreated, and no existing policy or `authenticated` privilege changed.

- **Public Explore, minimum read**
  - `anon` gets column-level SELECT on `id, batch_id, caption, source_image_path, image_alt, tone, perspective, created_at` only.
  - `generation_prompt`, `user_context`, `creator_id` and `model` stay hidden from signed-out visitors (PostgREST returns 401 for them).
  - The anon policy is SELECT-only. Anon has no INSERT, UPDATE or DELETE.
- **Images**
  - The `week4-media` bucket **stays private**.
  - A new anon Storage SELECT policy allows signing URLs only for objects referenced by an `ai_captions` row.
  - Unposted uploads and other buckets stay invisible.
- **Ten words:** `ai_captions_caption_max_words … NOT VALID`.
- **Admin membership: `public.caption_lab_admins`**
  - Columns: `user_id` (PK, FK to `auth.users`), `is_superadmin`, `granted_at`, `note`.
  - RLS is on with **no policies**, and all privileges are revoked from `anon` and `authenticated`. Only the service role can SELECT it.
  - No role except the table owner (SQL Editor) can write it. A flag on `profiles` would have been self-grantable, because users can update their own profile row.
- **Admin server grants:** this shared project does not give `service_role` default privileges on new tables. The admin app's server gets least-privilege grants:
  - `ai_captions`: SELECT, DELETE, column INSERT, and UPDATE of `caption`, `tone` and `perspective` only.
  - `caption_votes`: SELECT.

### Admin bootstrap (trusted, one-time)
Run through the Supabase MCP/SQL Editor as the database owner after checking `auth.users` and `auth.identities`. The owner account (`l.godde17@gmail.com`, with a linked Google identity, author of 15 of the 18 captions) was the only one granted:
```sql
insert into public.caption_lab_admins (user_id, is_superadmin, note)
select u.id, true, 'Week 6 bootstrap: verified owner (Google identity l.godde17@gmail.com)'
from auth.users u
where u.id = '713f6f77-19dd-4dbc-9edc-f8114b9237e4'
  and u.email = 'l.godde17@gmail.com'
  and exists (select 1 from auth.identities i where i.user_id = u.id and i.provider = 'google')
on conflict (user_id) do update set is_superadmin = true;
```
There is no "become admin" button and no client write path. To revoke access, run `update public.caption_lab_admins set is_superadmin = false where user_id = '…';` in the SQL Editor.

## Security checks
- `supabase/tests/week6_rls_check.sql` (always rolls back): **36/36 ok**.
  - Anon reads published captions, but prompt, context, creator and model are denied.
  - Anon cannot create, modify or delete captions, vote, read votes, see any profile, read the admin table, see unposted uploads or other buckets, or upload.
  - Signed-in users are unchanged and cannot read or grant admin membership.
  - Over-long captions are rejected by the DB.
  - The service role can read membership but cannot grant it, cannot reassign creators or rewrite prompts, and cannot vote. Deleting a caption cascades its votes.
- `week4_rls_check.sql` **29/29 ok** and `week5_perspective_check.sql` **12/12 ok**. In each, the one "anon cannot read captions at all" assertion was intentionally updated to the Week 6 rule (display columns yes, prompt no).
- Supabase advisors: the only Caption Lab item is the intentional INFO "RLS enabled, no policy" on `caption_lab_admins`. All other findings belong to the shared project's other apps and were left untouched.

## Tests
- `npm test`: **115** unit tests (Gemini always mocked). New ones cover:
  - Per-caption cards and repeated images.
  - Public column list.
  - Guest Explore and restored votes.
  - Highlight of new captions.
  - The vote buttons.
  - Proxy routing.
  - Allow-listed return path.
  - Callback cookie.
  - The generation provider: Route Handler call, duplicate guard, failure handling, notification states.
  - Route Handler content-type and status codes.
  - Word counting, rejection and bounded retry.
  - Week 6 migration shape.
- `npm run test:smoke` (live, signed out): **12/12** against a production build.
  - `/` → `/explore`.
  - Guest Explore renders a Funny and a Not funny button on every card and real signed images, with no private data.
  - `/rate` and `/create` → `/login?next=…`.
  - The API returns 401.
  - Anon REST and Storage behave exactly as above.
