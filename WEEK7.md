# Week 7 — Caption Lab

Canonical shared migration: `supabase/migrations/20261025225319_week7_feedback_observability.sql` in this repository only. The admin repository consumes the same database; never apply this migration twice. Both branches start from the latest clean Week 6 submission commits.

## Requirement mapping

| Capability | Table(s) | Admin page | Operations |
| --- | --- | --- | --- |
| Users / profiles | existing Auth users, `profiles` display columns | `/admin/users` | READ |
| Prompt chains | `caption_lab_chains` | `/admin/chains` | READ |
| Ordered steps / templates | `caption_lab_steps` | `/admin/steps` | READ |
| Prompt chain mix | `caption_lab_mix` | `/admin/mix` | READ / atomic UPDATE |
| Terms | `caption_lab_terms` | `/admin/terms` | CREATE / READ / UPDATE / DELETE |
| AI media | existing `ai_captions` | `/admin/media` | READ / VIEW; Week 6 CREATE / UPDATE / DELETE preserved |
| Generation requests | `caption_lab_requests` | `/admin/requests` | READ / execution detail |
| Generation examples | `caption_lab_examples` | `/admin/examples` | CREATE / READ / UPDATE / DELETE |
| LLM models | `caption_lab_models` | `/admin/models` | CREATE / READ / UPDATE / DELETE |
| LLM providers | `caption_lab_providers` | `/admin/providers` | CREATE / READ / UPDATE / DELETE |
| LLM responses | `caption_lab_responses` | `/admin/responses` | READ |
| Allowed signup domains | `caption_lab_signup_domains` | `/admin/signup-domains` | CREATE / READ / UPDATE / DELETE |
| Whitelisted e-mails | `caption_lab_whitelist` | `/admin/whitelist` | CREATE / READ / UPDATE / DELETE |
| Images | `caption_lab_images`, private `week4-media` bucket | `/admin/images` | upload / READ / VIEW / metadata UPDATE / unused DELETE |
| Ratings | existing `caption_votes` | `/admin/votes` | READ |

Lists paginate; details expose related record links. Every page and action independently checks the existing verified Supabase session and strict `caption_lab_admins.is_superadmin = true` membership. Layout/navigation checks are additional. Catalog operations use a fixed entity, column and operation allowlist. Read-only entities cannot be mutated by the catalog action.

## Voting and Rate

`setVote(captionId, nextVote)` accepts exactly `1`, `-1`, or `null`. The verified server session is required; the SECURITY INVOKER `caption_lab_set_vote` function derives the voter from `auth.uid()`. A non-null state INSERTs a real row, then updates only `vote` on unique `(user_id, caption_id)` conflict. Null DELETEs the owner's row. Repeating the same desired-state request is idempotent. The buttons compute null when the selected choice is clicked; the opposite choice changes it. Both views retain buttons and selected labels, block overlapping submissions and report failures honestly.

RLS adds only own-row UPDATE/DELETE, with ownership USING and WITH CHECK on UPDATE. Only the `vote` column is update-granted, and a trigger also prevents changing either identity. The existing live `private.caption_lab_writers` restriction (added after the Week 6 submission) is preserved for writes; no new writers or admins are added.

Rate keeps its current card until Next and freezes deck order for the session while server counts/feed caches refresh. Reload gets saved votes from the database. It shows the complete image with `object-contain`; image height responds to `svh`, with a usable minimum and normal scrolling at high zoom/short heights. Generation notifications are in document flow and cannot cover controls.

Only Rate installs ↑ Funny / ↓ Not funny shortcuts. Repeated, modified, already-handled, composing, editable-target, open dialog/menu, and pending events are ignored. Default scrolling is prevented only for a handled vote. Listeners are removed on cleanup. Buttons have pressed state, selected labels and focus styles.

## Day-range charts

Overview uses one labelled 7–90-day slider (default 14). Changes debounce 300ms; one authenticated server action validates the integer range and refreshes both existing bar charts with actual database aggregates. Loading and errors retain the last successful charts.

`caption_lab_activity` produces calendar DATEs in America/New_York and converts each midnight separately. This supports 23- and 25-hour DST days, includes zero days, and returns at most 90 aggregate rows without silently truncating raw activity.

Captions count saved `ai_captions` rows by creation day. Votes count CURRENT `caption_votes` rows by their ORIGINAL insertion day. Changing choice keeps the insertion day; undo removes the row from counts; voting again creates a new insertion. These charts are not a history of vote events.

## Config interpretation

No authoritative local course definition of “prompt chain mix” was found in the available weekly repositories or local course-document search. This implementation's minimal, application-owned interpretation is weighted random choice among enabled chains for the requesting application. Weights 1–100 are relative and normalize within an application; saving all weights/enabled states is atomic. At least one active chain is required per app, referencing active models/providers. Each app currently has exactly its real Week 6 single-call chain (main: 3 captions, admin: 1 caption), so each has 100% share. This is separate from explicitly selected Student/Professor perspective and tone.

Chains, ordered templates and the Gemini catalog are initialized from actual Week 6 configuration. Runtime reads the mix and stored templates, preserves perspective/tone, requires the configured existing Gemini model/provider, and makes one model call with at most one retry. Catalog CRUD does not install arbitrary integrations or execute admin-entered URLs. Keys remain environment variables. In-use identity/deactivation and FK-protected deletes are rejected; unused test records can actually be deleted.

Terms and manually entered reference examples are private editorial catalogs. They do not automatically alter model prompts. Reference examples are labelled `manual_reference`, never historical AI outputs.

Signup domain/e-mail CRUD normalizes, validates and checks duplicates. No existing Caption Lab signup enforcement consumes these new tables; the UI states that they manage configuration only. Shared Auth hooks, OAuth behavior, Site URL and admin membership are not changed by these lists.

## Telemetry and images

Both generators use the same `lib/captions/runtime.ts` convention: verified requester → image registry → chosen chain/step and model/provider → request with exact executed system/user prompt snapshot → one response row per actual provider attempt → saved captions linked by `generation_request_id`. Provider/model keys and prompt strings are snapshots, not reconstructed after configuration changes. Usage is saved only when returned; durations are measured. HTTP/network and rejected-output failures/retries are recorded. Response storage explicitly allows only visible text, finish/block reasons and numeric usage; it excludes thought parts, binary image data, headers, keys and raw provider error bodies. Text/JSON renders through escaped React elements.

Legacy captions retain null request linkage and are explicitly labelled as lacking telemetry. No historical request/response rows are fabricated. Failed tracked requests keep their private source image so the record does not lose its source. If tracking fails, the action reports an error; it never claims full success.

Existing caption image paths are registered in place; no files are copied. Image upload uses Storage APIs, then verifies actual downloaded bytes/type/size on the server before saving metadata. Admins can update title/alt metadata; file replacement is intentionally not offered. Reference checks and a deletion reservation prevent breaking captions/requests, including concurrent creation. Only unused files can be removed. Storage failures keep the registry; a registry failure after file removal is reported honestly and can be retried. A signed URL may remain cached until its short expiry; Storage listing verifies actual file removal.

All new tables enable RLS and revoke anonymous/authenticated access. Privileged reads/writes occur only in authenticated server modules. The main generation action has a narrow server-only service client for configuration/telemetry; user voting always uses the session client and invoker RLS. Ordinary authenticated caption reads are narrowed to feed fields, removing prompt/context/model/telemetry access. Anonymous Explore keeps its existing safe column list and publication-based Storage policy. Other applications' policies/tables and the semester project are untouched.

## Verification record

See the final verification notes appended after local/live/deployed checks. Automated provider tests use mocks. Live CRUD uses clearly labelled disposable records/files, cleans them up, and restores original mix values. A live action integration test supplies a known existing superadmin context to test real validation/database writes; independent gate tests cover anonymous and normal-user rejection. This is distinguished from browser authentication checks.

### Automated and database checks (October 25, 2026)

- Both repositories: clean `npm ci`, lint, standalone `tsc --noEmit`, production build, and `git diff --check` executed. Next.js / eslint-config-next pinned to 16.4.3; compatible transitive audit fixes applied. Both dependency audits report zero vulnerabilities. No new UI/CRUD/chart library added; main adds only the existing admin pattern's `server-only` guard package.
- Main: 128 unit tests pass, including desired-state voting, anonymous rejection, reload rendering, background generation, ten-word parsing, guarded keyboard shortcuts and runtime snapshots/failures/retries. Historical immutable-vote tests were deliberately replaced; security coverage remains.
- Admin: 67 unit tests pass, including all new mutation gates for anonymous/nonadmin callers, entity/operation allowlists, CRUD validation, normalization/duplicates, relationship protections, range validation, DST buckets and both runtime conventions.
- `week7_rls_check.sql` passes live and rolls back: initial INSERT, same-state retries, same-row opposite vote, undo/retry/reinsert, forbidden voter/caption reassignment, cross-user read/update/delete denial, impersonation denial, anonymous RPC/prompt denial, and private table/function grants.
- Real Supabase action integration (with an independently tested existing-superadmin context): Terms, Examples, Models, Providers, Domains and E-mails CREATE/READ/UPDATE/DELETE persist; duplicate values rejected; referenced provider/model deletion rejected. Mix UPDATE persists, invalid all-off change is atomic/rejected, original values restored. Images upload/private signed preview/read/update/delete succeeds and Storage listing confirms file cleanup; existing captioned image deletion rejected. All disposable records/files removed. This is not a claim of an authenticated deployed browser E2E test.
- All four live chart ranges return exactly 7/14/30/90 buckets and match independent counts. At test time caption/vote totals were 0/4 (7), 9/5 (14), 24/21 (30 and 90). DST midnight calculations produce 23 hours on March 8 and 25 on November 1, 2026.
- Supabase security and performance advisors ran before and after migration. No new Caption Lab WARN/ERROR findings. Intentional RLS/no-client-policy INFO findings reflect server-only tables with revoked client grants; unused new FK indexes are INFO. Existing unrelated warnings (executable shared definer functions, leaked-password protection, permissive Storage policies) were left untouched. See https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy for the server-only table notice.
- Initial caption/file counts were 24 / 8 and remain intact after disposable CRUD checks. No semester-project files/databases or unrelated Every Sport tables/policies were modified.
- Deployed Google/superadmin browser checks, viewport screenshots, real deployed Gemini telemetry and final immutable deployment URLs remain pending until account/browser access is available. No real provider success or READY TO SUBMIT status is claimed at this stage.
