# Week 3: Google authentication and profiles

Implementation branch: `week3-auth-final`, based on provisional commit
`1233d03000b093e8bbe1a64d5e7ab2556550a81a`. Assignment 2 `main` remains at
`2b8117ccd4b2e84a6247c0c1d71f25cc53f7afa0`. No merge, push, or deployment is
included in this implementation. A push may trigger Vercel automatically, so
wait until external OAuth configuration is ready.

## Routes and authentication

| Route | Behavior |
| --- | --- |
| `/` | Public, anonymous read of the existing four `public.week2_games` rows |
| `/login` | Continue with Google; signed-in users proceed according to profile completeness |
| `/auth/callback` | GET code exchange, verified identity, then profile lookup |
| `/profile/complete` | Authenticated onboarding; both names required |
| `/profile` | Authenticated name editing, read-only email, photo upload, sign out |
| `/protected` | Authenticated, complete-profile-only content |

The browser uses `createBrowserClient` from `@supabase/ssr` and
`signInWithOAuth({ provider: "google", options: { redirectTo:
`${window.location.origin}/auth/callback` } })`. The application redirect is
**exactly `/auth/callback`**, without a trailing slash or custom query parameters.
The OAuth-generated `?code=...` on the inbound callback is expected.

The GET callback exchanges that code with `exchangeCodeForSession`, writes
session cookies using the SSR server client, verifies `getClaims()`, and reads
`first_name,last_name` from the authenticated user's profile. Incomplete names
(null, empty, or whitespace) lead to `/profile/complete`; otherwise `/protected`.
Missing/failed profile reads go to `/profile`, which offers a recoverable error
and sign out. The app never inserts a substitute profile. Missing/invalid OAuth
codes return safely to `/login`; sensitive errors never enter URLs or logs.

Fixed relative Location headers retain the browser's external origin behind
Vercel's forwarded host, including commit-specific deployment hosts. The app
never reflects Host, X-Forwarded-Host, or a user-supplied destination into an
absolute redirect. No custom callback routing parameter is supported.

Server clients use asynchronous `cookies()` with `getAll`/`setAll`. Proxy calls
`getClaims()`, forwards refreshed request and response cookies/cache headers,
and excludes static assets. Pages and mutation actions independently verify
claims; cookie session contents alone are never authorization. Private responses
are marked `private, no-store`. Sign out uses a POST Server Action, clears the
local session, invalidates the navigation cache, and redirects to `/login`.

## Existing shared Supabase database

Project: `msxlfmgpvyyrpvzrnqhu`
URL: `https://msxlfmgpvyyrpvzrnqhu.supabase.co`

Read-only Supabase MCP inspection on September 27, 2026 confirmed:

- `public.profiles` already exists in the shared staging database, with `id`,
  `name`, `initials`, `avatar_url`, `updated_at`, and other application columns.
- Week 3's `first_name text` and `last_name text` already exist and are nullable.
- `on_auth_user_created` runs AFTER INSERT on `auth.users`, executing the existing
  `public.handle_new_user()`. It inserts a profile and intentionally does not
  populate the new name fields. First-time users therefore need onboarding.
- RLS is enabled; existing authenticated own-row SELECT/UPDATE behavior remains.
- The existing `media` bucket is public, with authenticated own-folder storage
  policies. Its wider shared upload settings are unchanged; this UI applies the
  assignment's stricter 5 MB and JPEG/PNG/WebP limits.

`supabase/migrations/20260927_week3_profiles_names.sql` documents only the
already-applied, idempotent addition of nullable first/last names. It was **not
executed** during implementation. Do not recreate profiles, its trigger/function,
the bucket, policies, or unrelated Every Sport schema. No remote writes were
needed. `week2_games` and its policy remain unchanged.

## Profile and avatar updates

Both forms validate and trim names, require 1–80 characters per field, and invoke
server-side validation. Mutations derive the row ID exclusively from verified
claims, ignoring submitted IDs. They update `first_name`, `last_name`, full
`name`, uppercase two-character `initials`, and `updated_at`. A missing row or
failed update is an error, never an implicit insert. Completion redirects only
after a successful save.

Photo selection and upload validate MIME type and size in the browser. Accepted:
`image/jpeg`, `image/png`, `image/webp`; maximum 5 MiB (5 × 1024 × 1024 bytes).
The browser verifies its identity and uploads directly using
`storage.from("media").upload()` to:

```text
<verified-user-id>/profile/avatar-<random-UUID>.<jpg|png|webp>
```

Existing Storage RLS enforces the user's folder. Unique names avoid overwrites.
The server action rechecks identity and validates the submitted object path is
in that same user's profile folder, obtains `getPublicUrl()`, and saves **only
the URL string** to `profiles.avatar_url`. Image bytes never enter Postgres or
the profile action. A successful save immediately updates the displayed avatar.
Old objects, including an upload followed by a failed profile save, are retained;
this app never deletes arbitrary existing photos. The bucket is public, so the
UI explains that saved photos are publicly visible.

## External setup (required before deployment)

### Google Cloud / Google Auth Platform

1. Use your existing Google Cloud project and a **Web application** OAuth client.
   Configure Branding, support contact, Audience, and basic OpenID/email/profile
   scopes. If in Testing, add every test/grade account; otherwise use the
   appropriate published audience so the grader can sign in.
2. Set the Google client's authorized redirect URI to the **Supabase Auth** URL:
   `https://msxlfmgpvyyrpvzrnqhu.supabase.co/auth/v1/callback`.
   This is Google's upstream callback, distinct from our application's callback.
   The Google client no longer redirects directly to this Next.js app.
3. Enter the Google Client ID and Client Secret **only in the Supabase Google
   provider dashboard**. Never put the secret in app source, local environment,
   Vercel environment, browser variables, or Git. No Google application env
   variable is required. Remove obsolete app-side Google client configuration
   from existing Vercel environments if present. Do not alter unrelated clients.

### Supabase Auth (same project)

1. Authentication → Sign In / Providers → Google: enable Google and configure the
   Web Client ID and Client Secret there. Keep nonce and email security defaults.
2. Authentication → URL Configuration: preserve redirects needed by the other
   application sharing this project. Add the exact local URL
   `http://localhost:3000/auth/callback` to Redirect URLs. If using another local
   port, add that exact origin plus `/auth/callback` too.
3. After the final commit deployment URL exists, add
   `https://<commit-specific-deployment-host>/auth/callback` to Redirect URLs.
   No query parameters or trailing slash. Retain the shared Site URL if another
   application depends on it; our explicit allowed redirect takes precedence.
   The Site URL is a fallback, so an unlisted callback can return to the wrong app.
4. Do not change database RLS, shared policies, table/trigger definitions, or
   bucket settings. First login must rely on the existing auth.users trigger.

### Local environment

Use the existing public Supabase URL and anon key in the ignored `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://msxlfmgpvyyrpvzrnqhu.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing public anon key>
```

Server utilities also accept existing `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
Browser aliases are required for sign-in/uploads and take precedence server-side
when both are present; point both pairs at the same existing project. No elevated
key is needed. `.env.example` contains placeholders only. Restart/rebuild after
changing public variables because Next.js embeds them at build time.

### Vercel and submission (same project, later)

1. Once Google/Supabase provider configuration is ready, add the two public
   Supabase aliases to the **existing Vercel project's Preview environment**,
   optionally scoped to `week3-auth-final`. Preserve existing server variables.
   Do not create a second project or add Google credentials.
2. Then push/deploy `week3-auth-final` to the same Vercel project, preserving
   Assignment 2 production/main. No force push or main merge is needed.
3. Record the immutable, commit-specific deployment URL and confirm the deployment
   Git SHA matches the final assignment commit. Add its exact callback to the
   Supabase redirect allowlist as above before testing OAuth on it.
4. Turn Vercel **Deployment Protection off** for the graded deployment. Confirm
   any inherited team protection also permits public access. The final URL must
   open in Incognito without Vercel login or a bypass parameter.
5. Complete the checklist below and submit the **commit-specific deployment URL**,
   not localhost, the project dashboard, a moving branch alias, or a production
   alias. No submission URL exists for this implementation until deployment.

## Color and visual hierarchy

The TA's Week 3 color requirement is implemented with a shared dark slate base
and restrained semantic accents: indigo authentication/public navigation, violet
profile cards/buttons/avatar rings, amber setup-required badge, emerald
authenticated/saved states, and red error panels. Primary actions use colored
fills, secondary actions use indigo borders/tints, and focus outlines are visible
indigo. Text labels accompany every status; color is never the only indicator.
The custom Google sign-in button uses text only, without an imitation logo.

Automated checks confirm the semantic palette and emitted colored button CSS.
Browser visual inspection could not run in this session because the Browser
connection reported no available browsers. Before submission, explicitly check
all five pages at desktop and mobile widths: the interface must visibly no longer
look monochrome, focus rings and text must contrast clearly, and each page must
show its intended accent. Authenticated pages require the manual login below.

## Automated verification

Node.js 22.18+ is needed for the TypeScript helper unit tests (validated with
Node.js 24). Dependencies are pinned and `package-lock.json` is committed.

```sh
npm ci
npm run lint
npm run build
npm test
npm run start
# In another terminal:
npm run test:smoke
git diff --check
```

Set `TEST_ORIGIN=http://localhost:3001` for smoke tests on another port. Unit
and source tests verify profile completeness, name constraints, callback routing,
verified-identity updates, avatar ownership, sign out, exact OAuth callback,
absence of the old flow, secret patterns, and the additive-only SQL artifact.
Smoke tests use the real public games query and unauthenticated routes. Tests
create no accounts, upload no objects, and modify no remote database rows.
Mocked unit tests validate application branches; they do not certify real OAuth
cookies or remote authenticated RLS. Those require the manual flow below.

## Manual E2E checklist

Use a fresh Incognito window and a Google account **new to this Supabase project**
to exercise automatic profile creation. An existing account with complete names
correctly skips onboarding; do not delete shared users to simulate first login.

- [ ] `/` displays Zelda: Breath of the Wild, Minecraft, Portal 2, Rocket League.
- [ ] `/protected` redirects to `/login`; `/profile` and `/profile/complete` do too.
- [ ] Click **Continue with Google**; Google authenticates through Supabase OAuth.
- [ ] Return to this deployment's `/auth/callback?code=...`, with no app-added
      callback query parameters. Do not copy/log the code or session tokens.
- [ ] New `auth.users` row has an automatically created `public.profiles` row.
      Nullable first/last names produce `/profile/complete` immediately.
- [ ] Blank/whitespace names are rejected; enter first + last name and save.
- [ ] `/protected` shows the email, welcome name, and authenticated-only content.
- [ ] Open `/profile`, edit both names, upload a JPEG/PNG/WebP under 5 MB, save.
- [ ] New avatar appears immediately; refresh and verify names/avatar persisted.
- [ ] Verify full `name`, `initials`, `updated_at` stay coherent, avatar_url is a
      URL, and the Storage object is in `media/<user-id>/profile/...`.
- [ ] Unsupported/oversized photos show useful errors. Retrying a failed save
      works; no accidental upload occurs when names are invalid.
- [ ] Visiting `/login` and `/profile/complete` when complete goes to `/protected`.
- [ ] Sign Out → `/login`; revisit/refresh `/protected` → `/login` immediately.
      Check browser Back then refresh, and confirm `/` remains public.
- [ ] Test cookie refresh after token expiry and returning with an existing user.
- [ ] Open the commit-specific URL in Incognito without Vercel authentication.

Real Google login, trigger behavior for a newly created account, authenticated
Storage writes, cookie refresh, and deployed sign-out remain manual until the
external configuration and deployment are ready.

## References checked

- [Supabase SSR / Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Storage uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads)
- [Supabase redirect allowlist](https://supabase.com/docs/guides/auth/redirect-urls)

Also checked the installed Next.js 16.3.5 Route Handlers, Proxy, cookies, and forms
guides, and the current Supabase changelog.
