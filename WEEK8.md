# Week 8 integration — Prompt Studio

This branch preserves the Week 7 public app at `69878a77d07de6ec0cd5aec9822ed8f2f139a1b7`. Only canonical draft SQL and this documentation are added; the public generator, voting, Explore and UI source are unchanged.

The new standalone application is prepared locally at `/workspace/caption-lab-chains`; its intended GitHub repository is `lfg2131/caption-lab-chains`. Repository creation failed with `Resource not accessible by integration`; the owner must create the empty repository if absent, or grant the GitHub connection access if it already exists, before it can be pushed. See that application's `WEEK8.md` for full architecture and verification notes.

## Canonical SQL — not applied

- `supabase/migrations/20261103000000_week8_prompt_studio.sql`: transactional draft; protected `profiles.is_superadmin`; Studio-only chain/step management RPC and revision checks; private snapshot runs/step attempts; image-reference compatibility; separate three-step demo. Does not modify defaults, mix rows, old requests/responses, captions, votes, or memberships.
- `supabase/tests/week8_preflight.sql`: inspect actual shared-project applied history, schema/grants/policies/constraints and profile RPCs before applying anything.
- `supabase/tests/week8_bootstrap_owner.sql`: requires an independently verified owner UUID, existing protected Google superadmin membership, trusted database access, and an existing profile. Never promotes all memberships or guesses an owner.

Live Supabase/Vercel/Gemini access is missing. No migration, bootstrap, advisor run, or live permission test is claimed. Review live schema and existing profile RPCs first; adapt the draft if needed and apply once. Never replay Week 7, repair history merely to match filenames, reset/restore the DB, or touch semester/course/Every Sport data.

## Local evidence

- Public app: lint and typecheck pass (run `npx next typegen` before standalone TypeScript); 128 tests pass.
- Older admin at `c3f5ebca22fe0d4c7a1811bcd0896c17a0a79b38`: lint/typecheck and 75 tests pass; no code changes.
- Both old builds were attempted and blocked by denied Google Fonts egress, not a code diagnostic. Additional `fonts.googleapis.com` / `fonts.gstatic.com` domains are saved in the environment draft; no bypass was attempted.
- New app: lint/typecheck/production build, 19 mocked unit tests, and ten local PostgreSQL subtests pass. Database tests use the exact canonical draft with relevant Week 7 definitions in PGlite, not the live database.
- Local production Chromium login/anonymous gating and Light/Dark/System persistence/OS change checks pass at desktop/mobile sizes. Authenticated editor/result layouts and Google E2E remain pending.

No READY TO SUBMIT claim. Need live schema/grant/RPC review and owner bootstrap, three-call real Gemini E2E, CRUD/permissions/advisors, Vercel identity/runtime/env/redirect/protection checks, and three verified commit-specific deployment URLs. Existing apps need no manual redeployment for source changes because none were made.
