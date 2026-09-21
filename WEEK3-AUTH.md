# Provisional Week 3 authentication

Assignment 2 remains on `main` at `2b8117ccd4b2e84a6247c0c1d71f25cc53f7afa0`.
This work belongs only on `week3-auth-provisional`. It does not change database
schema, grants, or RLS. No deployment or push is part of this provisional work.

## Routes and flow

- `/`: public, anonymous read of the existing four `week2_games` rows.
- `/login`: Google's official GIS button in redirect mode.
- `/auth/callback`: Google POSTs `credential` and `g_csrf_token` here. The handler
  requires matching, nonempty cookie and form CSRF tokens before exchanging the
  credential with Supabase `signInWithIdToken`. SSR cookies persist the session;
  a 303 sends the browser to `/protected`. Invalid requests return to `/login`.
  GET also returns to `/login`.
- `/protected`: checks `getClaims()` server-side, renders authenticated identity
  and gated content, or redirects to `/login`. The sign-out Server Action clears
  the current session, invalidates the client route cache, and returns to `/login`.

The Google login URI is always `${window.location.origin}/auth/callback`, with
no query string. The page never uses a popup credential callback. The app has
no Google client secret. Supabase validates the Google token; the app does not
authorize from an unverified JWT or user metadata. Proxy refreshes sessions,
forwards cookies, and prevents shared caching of authenticated responses.

## External setup still required

### Google Cloud / Google Auth Platform

1. Use your own Cloud project. Configure Branding (app name, support email,
   developer contact), Audience, and basic `openid`, email, and profile scopes.
   While the app is in Testing, add the Google accounts that will test/grade it.
   Use an audience that permits the grader's account.
2. Create an OAuth client of type **Web application** and copy its Client ID.
   Google may issue a secret as well; do not copy that secret into this app.
3. For local testing on port 3000, add authorized JavaScript origins
   `http://localhost` and `http://localhost:3000`, and authorized redirect URI
   `http://localhost:3000/auth/callback`.
4. Once the final preview deployment exists, add its exact HTTPS origin to
   Authorized JavaScript origins and that origin plus `/auth/callback` to
   Authorized redirect URIs. Use the immutable deployment URL, not a moving
   branch alias. No trailing slash, query parameters, or wildcard hostname.
   Register another origin/callback pair if you test on a different port or URL.

### Supabase Auth

1. Open Authentication → Sign In / Providers → Google. Enable the Google Auth
   provider and include the same Web Client ID in its allowed Client IDs.
   Enabling an Auth provider is separate from enabling RLS; leave every database
   policy, grant, and table setting untouched.
2. For this ID-token flow, leave the provider secret empty if the hosted settings
   permit saving that configuration. Keep nonce checking enabled (the app sends
   no nonce, so both token and request omit it); keep unverified-email sign-in off.
3. The upstream Supabase ID-token handler uses the enabled flag and Client IDs,
   without reading a provider secret. However, the general hosted Google setup
   guide still asks for a secret. If your dashboard requires one to save, stop
   and resolve that hosted configuration restriction with Supabase/the professor;
   do not invent a secret or switch the application to an OAuth code flow.
4. Supabase's OAuth callback and redirect allowlist are not used in this flow:
   Google posts directly to this application's `/auth/callback`. No Supabase
   site URL change is needed for the implemented ID-token exchange.

### Local environment

In the ignored `.env.local`, add:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=<existing Supabase project URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<existing public anon key>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<your Web OAuth Client ID>
```

Use the existing project's public anon key. Existing `SUPABASE_URL` and
`SUPABASE_ANON_KEY` remain supported by server utilities and the public games
query. The browser utility requires the public names. Restart the dev server
after editing environment variables. Missing Google Client ID produces a clean
configuration message and does not prevent a build.

### Vercel (when deployment is authorized later)

1. Add the same three variables to the existing project's **Preview** environment
   (optionally scope them to `week3-auth-provisional`). Public variables are baked
   into the build, so set them before building or create a new deployment afterward.
2. Push/deploy only the provisional branch when ready and authorized. Preserve
   the Assignment 2 production branch and deployment.
3. In project Settings → Deployment Protection, turn protection off for the
   preview that will be graded. Confirm its URL opens without a Vercel login or
   bypass parameter. Account for any team-level protection requirements.
4. Register the final immutable deployment origin and exact callback with Google
   as above. Google settings changes alone do not require rebuilding the app.
5. Verify the deployment's Git SHA matches the intended submission commit.

## Verification

```sh
npm ci
npm run lint
npm run build
npm run start
# In another terminal:
node --test tests/auth-smoke.mjs
git diff --check
```

For another local port, set `TEST_ORIGIN` when running the smoke tests. They check
the four public games, the unauthenticated gate, callback GET, missing/mismatched
CSRF, malformed input, missing credential, and rejected invalid credential.
They do not create accounts or write database rows.

After completing external setup, use a fresh Incognito window on the exact
deployment URL. Confirm `/` shows four games, `/protected` goes to `/login`,
Google returns with a POST to precisely `/auth/callback`, and the resulting 303
loads gated content. Reload `/protected` to confirm persistence; sign out and
revisit/reload it to confirm the gate closes. Check `/` still works signed in
and signed out. Verify refresh after token expiry as well.

Real Google login, authenticated cookies, refresh, sign-out, and deployed
Incognito behavior cannot be certified until the real Client ID and hosted
provider/deployment settings are in place.

## References checked

- [Supabase Next.js SSR](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Supabase Google integration](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase ID-token API](https://supabase.com/docs/reference/javascript/auth-signinwithidtoken)
- [Supabase ID-token implementation](https://github.com/supabase/auth/blob/master/internal/api/token_oidc.go)
- [Google GIS JavaScript reference](https://developers.google.com/identity/gsi/web/reference/js-reference)
- [Google CSRF and token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token)
- [Google Web client setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel deployment protection](https://vercel.com/docs/deployment-protection)

Also checked the installed Next.js 16.3.5 guides for cookies, Proxy, Route
Handlers, Script, and Server Actions, and the current Supabase changelog.
