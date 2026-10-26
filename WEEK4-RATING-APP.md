> Historical submission notes. Week 7 replaces immutable voting with change/undo, keeps the Rate card until Next, and adds private runtime telemetry. See [WEEK7.md](WEEK7.md) for current behavior.

# Week 4 · Caption Lab (AI generation + rating + RLS)

## Assignment interpretation
> Allow logged-in users to rate something AI generated. Allow logged-in users to create AI generations. Add RLS. Be intentional about the features you add.

**Caption Lab** turns the Week 3 auth app into an image + AI-caption rating product, moving in the direction of Humor Study / Crackd:

- **Create:** upload a photo, optionally add context and a tone. Gemini looks at the image and writes **3 distinct captions**, saved as 3 independently rateable rows.
- **Rate:** a focused card feed (photo + caption) with **Funny (+1) / Not funny (−1)**. Each vote **INSERTs** a new `caption_votes` row.
- **Return:** unrated, newest content always comes first. When the feed is empty, the page points you to Create and to checking back later. A small rotating **Today’s vibe** prompt helps you start a post.

## Product rationale (Sam)
Sam is a Columbia junior who is chronically online, from the Midwest, new to NYC, lives in the dorms, and explores the city on weekends.
- **Mobile-first and fast:** one card at a time, one tap to vote, then it advances automatically.
- **Caption-native tone:** the prompt targets internet and group-chat humor. Campus, dorm, and NYC references are welcome *only when the photo fits*.
- **Better than a one-shot caption generator (Crackd-style):** you get three alternatives instead of one throwaway line, and other people rate them. Over time, community votes show what is actually funny, and that signal can feed back into generation later. Generating and rating form one loop, and other users’ posts give Sam a reason to come back.
- **Intentionally not built:** streaks, leaderboards, follows, comments, DMs, notifications, public vote counts.

## Routes
| Route | Access | Behavior |
|---|---|---|
| `/` | — | signed in → `/rate`, signed out → `/login` |
| `/login` | public | hero photo, value prop, Google sign-in; signed in → `/rate` |
| `/auth/callback` | public | Supabase PKCE `exchangeCodeForSession` → `/rate` (fixed relative redirects only) |
| `/rate` | protected | unrated-first card feed, vote, polished empty state |
| `/create` | protected | upload, preview, context, tone, generate, 3 result cards, recent drops |
| `/profile`, `/protected` | — | retired Week 3 URLs redirect to `/rate` (and then to `/login` when signed out) |

Protection is **default-deny** in `proxy.ts` / `lib/supabase/proxy.ts`. Every path except `/login` and `/auth/callback` (and static assets) redirects to `/login` without a verified session. Pages (`requireUser`) and every server action re-verify identity on their own. Identity comes only from `supabase.auth.getClaims()` (`lib/auth.ts`). Profile completeness plays no part.

## Schema (`supabase/migrations/20261005015736_week4_caption_lab.sql`, `…030332_week4_caption_image_alt.sql`)
`public.ai_captions`: `id`, `batch_id`, `creator_id → auth.users`, `source_image_path`, `caption`, **`generation_prompt`** (exact text sent to Gemini), `user_context`, `tone` (`clever|dry|chaotic|null`), `model`, `image_alt` (AI-written literal alt text), `created_at`.
Check constraints enforce the path format `<creator_id>/<uuid>.<jpg|png|webp>`, that the image sits in the creator's own folder, length limits, and the tone allow-list. Indexes: `created_at desc`, `(creator_id, created_at desc)`, `source_image_path`, `batch_id`.

`public.caption_votes`: `id`, `caption_id → ai_captions (cascade)`, `user_id → auth.users`, `vote smallint check (vote in (-1,1))`, `created_at`, **`unique (user_id, caption_id)`**. Index on `caption_id`; the unique index covers `user_id`.

Image bytes are never stored in Postgres, only the Storage object path.

## RLS and grants (GRANT = which operations, RLS = which rows)
| Table | anon | authenticated GRANT | RLS policy |
|---|---|---|---|
| `ai_captions` | none | `SELECT`; `INSERT` on app columns only (no `id`/`created_at`) | SELECT `true` (signed-in feed). INSERT only if `creator_id = auth.uid()`, the path is in the user's folder, **and** the user owns that object in `week4-media` |
| `caption_votes` | none | `SELECT`; `INSERT (caption_id, user_id, vote)` | SELECT own rows only. INSERT only if `user_id = auth.uid()` |

There are no UPDATE, DELETE, or TRUNCATE grants or policies for clients, so votes are immutable. `service_role` is not used by the app.
Audit: all 100+ `public` tables in the shared project already had RLS enabled; the unrelated tables were left untouched. Security advisors reported no findings for any Week 4 object. The pre-existing warnings belong to the shared app's functions and tables.
A live check (`supabase/tests/week4_rls_check.sql`, which always rolls back) passed all 29 cases. These include: anon read/write denied, creator and voter impersonation denied, client-chosen `id` denied, caption for a nonexistent image denied, update/delete denied, duplicate vote rejected, other users' votes invisible, and other users' uncaptioned uploads unreadable.

## Storage (`week4-media`)
Private bucket; JPEG/PNG/WebP; 5 MiB limit, enforced by Storage.
- INSERT: authenticated, path must match `<auth.uid()>/<uuid>.<ext>` (no traversal, no other folders, no upsert because there is no UPDATE policy).
- SELECT: your own folder, or any object referenced by an `ai_captions` row (the feed).
- DELETE: your own folder, only while no caption references the object (used to clean up after a failed generation).
The feed uses 1-hour **signed URLs** rendered on the server. Private images bypass the Next image optimizer (`unoptimized`).

## Generation flow and failure behavior
Vercel Functions cap request bodies at about 4.5 MB, so photos don't pass through a server action:
1. `prepareUpload` (server): verifies the user, validates type/extension/size, applies a rate limit, and **builds the path from the verified uid**.
2. The browser uploads straight to Storage at that path (Storage RLS and bucket limits enforce it).
3. `createCaptions` (server): re-verifies the user and path ownership, downloads the object, **sniffs magic bytes** (must match the extension, max 5 MiB), and validates context (≤200 chars) and tone. It then calls Gemini and validates exactly 3 captions plus alt text. Finally it inserts **all 3 rows in one INSERT** (atomic) with a shared `batch_id`.
4. Any failure removes the upload, shows an honest error, and never displays a fake success. Partially parsed output is never inserted.
Abuse guard: 10 generations per user per hour, failing closed.

## Gemini
- Model: **`gemini-3.8-flash`**, the current recommended stable Flash model. It accepts images and is free-tier eligible; this was verified against the live models list. It can be overridden with `GEMINI_MODEL`.
- API: REST `v1beta/models/{model}:generateContent`. The key goes in the `x-goog-api-key` header, never the URL. Uses `responseMimeType: application/json` + `responseJsonSchema` (`{alt_text, captions[3]}`), `thinkingLevel: low`, and a 25 s timeout. One retry covers 5xx, network errors, or rejected output.
- The system prompt covers safety: no hate or protected-class jokes, no harassment, no identifying or inventing details about real people, no sexual content, no threats, and no self-harm jokes, *including ironic hyperbole* (added after live testing caught one). Creator context is treated as untrusted data in quotes. A server-side screen rejects self-harm phrases even if the model produces them.
- **The exact prompt is persisted.** `generation_prompt` stores the verbatim system instruction and user text sent to Gemini, plus a note describing the inline image (type, size, path). `user_context` and `tone` are stored separately, along with `model`.

## Voting semantics
`submitVote(captionId, vote)`: the server verifies the user, validates a UUID and `vote ∈ {+1, −1}`, and **INSERTs** `{caption_id, user_id: <from session>, vote}`. Duplicates are rejected by the database unique constraint (`23505` shows "already rated"), and a missing caption (`23503`) is handled gracefully. There is no update or delete path. After a vote the card shows a confirmation stamp and moves to the next unrated caption. Rated captions don't come back after a refresh, because the feed left-joins your own votes.

## Security summary
Server-derived ids only. Auth checks happen in the proxy, in pages, and in every action. Callback redirects are fixed relative paths (no open redirect). No `dangerouslySetInnerHTML`; captions render as escaped React text. `GEMINI_API_KEY` is read only in `lib/captions/gemini.ts` (server), and no `NEXT_PUBLIC_` secret exists. No service role anywhere. Headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. Tokens and keys are never logged.

## Environment variables
| Name | Where | Type |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser + server | public (RLS-protected); Vercel Preview scoped to `week4-mutations` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | server fallback | existing |
| `GEMINI_API_KEY` | server only | Vercel **Sensitive/Secret**, Preview `week4-mutations`; `.env.local` locally |
| `GEMINI_MODEL` | server only | optional, `gemini-3.8-flash` |

## Testing
- `npm test` runs 70 unit tests. Gemini is always mocked (no quota). Coverage: proxy routing, callback, sign-out, and page auth; the generation actions (unauthenticated, missing, unsupported, oversized, or disguised files; context and tone; creator from auth; prompt, model, and batch persisted; honest failure plus cleanup; rate limit); Gemini parsing (exactly 3, malformed, unsafe, blocked, truncated; retries; key in header); voting (unauthenticated, invalid, nonexistent, ±1 INSERT with server user_id, duplicate, no update/delete path); source and migration security checks (RLS, grants, no secrets, no profile UI or table); alt text and labels.
- `npm run test:smoke` runs against a live server (`TEST_ORIGIN`). It covers logged-out redirects, the login page imagery, callback hardening, and anon REST read/write denial on both tables.
- `supabase/tests/week4_rls_check.sql`: the live RLS matrix above.

## Deployment
Existing Vercel project `week1-hello-world`, branch `week4-mutations` (Preview). Deployment protection: `ssoProtection: null`. The commit-specific deployment URL's `/auth/callback` is added to the Supabase Auth redirect allow-list. Google's OAuth redirect URI stays the Supabase callback.

## Manual E2E checklist
Root → `/login` · login image · `/rate` and `/create` typed while logged out → `/login` · Google sign-in → `/rate` · empty state · `/create` upload + context + tone → 3 captions · refresh shows "Your recent drops" · DB rows have creator_id, path, caption, prompt, context, tone, model, timestamp · `/rate` shows the caption with its image · vote → new `caption_votes` row (correct caption_id, user_id, ±1) · duplicate prevented · refresh keeps rated items out · sign out → protected pages redirect · incognito shows no Vercel wall.

## Known intentional choices
- You can rate your own captions; they carry a “Your caption” badge, which keeps a solo E2E test possible.
- No public vote counts this week; aggregating would expose voting data beyond each user's own.
- Image credit: the login hero photo is by Yosuke Ota (Unsplash License), stored at `public/login-hero.jpg`.
