import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter((p) => p && existsSync(p));
const appFiles = files.filter((p) => /^(app|lib)\//.test(p) && /\.(tsx?|mjs)$/.test(p));
const source = appFiles.map(read).join("\n");
// SQL statements only (comments stripped), lowercased.
const sql = (week) => files.filter((p) => new RegExp(`^supabase/migrations/.*${week}.*\\.sql$`).test(p)).map(read).join("\n").replace(/--[^\n]*/g, "").toLowerCase();
const migrations = sql("week4");
const week5 = sql("week5");
const week6 = sql("week6_public");
const week6Admin = sql("week6_admin");

test("OAuth uses the exact callback and verified identity only", () => {
  assert.match(read("app/login/google-sign-in.tsx"), /signInWithOAuth\(\{\s*provider: "google",\s*options: \{\s*redirectTo: `\$\{window.location.origin\}\/auth\/callback`,\s*\},\s*\}\)/);
  assert.equal((source.match(/redirectTo:/g) || []).length, 1);
  assert.doesNotMatch(source, /getSession\(|signInWithIdToken|NEXT_PUBLIC_GOOGLE/);
  assert.match(read("lib/auth.ts"), /getClaims\(\)/);
});

test("no privileged credentials in tracked or local environment files", () => {
  const envFiles = readdirSync(".").filter((p) => /^\.env/.test(p));
  for (const path of [...new Set([...files, ...envFiles])].filter((p) => !p.startsWith("tests/") && !/\.(ico|png|jpe?g|webp|woff2?)$/.test(p))) {
    const content = read(path);
    // Report only the filename, never the matching value.
    assert.ok(!/(?:GOOGLE_CLIENT_SECRET|NEXT_PUBLIC_GEMINI)\s*[=:]|GOCSPX-[\w-]+|sb_secret_[\w-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content), `Forbidden credential in ${path}`);
    if (path !== ".env.local") assert.doesNotMatch(content, /AIza[0-9A-Za-z_-]{30,}/, `Google API key in ${path}`);
    for (const token of (path === ".env.local" ? "" : content).match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
      try { assert.notEqual(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role, "service_role", `Privileged JWT in ${path}`); }
      catch (error) { if (error.code === "ERR_ASSERTION") throw error; }
    }
  }
  assert.ok(!files.some((p) => p.startsWith(".env") && p !== ".env.example"));
});

test("Gemini key is read only in server-side generation code", () => {
  const users = appFiles.filter((p) => read(p).includes("GEMINI_API_KEY"));
  assert.deepEqual(users, ["lib/captions/gemini.ts"]);
  for (const path of appFiles.filter((p) => /^\s*["']use client["']/.test(read(p)))) {
    assert.doesNotMatch(read(path), /captions\/gemini|captions\/prompt|process\.env\.GEMINI|service_role/, path);
  }
});

test("no raw HTML injection, no image bytes in Postgres, no client-chosen ids", () => {
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML\s*=|readAsDataURL/);
  assert.doesNotMatch(migrations, /bytea|base64/);
  assert.doesNotMatch(read("app/(lab)/rate/actions.ts"), /\.(update|upsert|delete)\(/);
  assert.doesNotMatch(read("app/(lab)/create/actions.ts"), /\.(update|upsert)\(/);
  assert.match(read("app/(lab)/rate/actions.ts"), /getVerifiedUserId\(supabase\)/);
  assert.match(read("app/(lab)/rate/actions.ts"), /rpc\("caption_lab_set_vote"/);
  assert.match(read("app/(lab)/create/actions.ts"), /creator_id: userId/);
});

test("Week 4 migrations: RLS on, no anon grants, no client update/delete, private bucket", () => {
  for (const table of ["ai_captions", "caption_votes"]) {
    assert.ok(migrations.includes(`alter table public.${table} enable row level security`));
    assert.ok(migrations.includes(`revoke all on table public.${table} from public, anon, authenticated`));
  }
  assert.doesNotMatch(migrations, /grant[^;]*to anon/);
  assert.doesNotMatch(migrations, /grant (update|delete|all)/);
  assert.doesNotMatch(migrations, /for (update|delete|all) to authenticated[\s\S]{0,40}on public\./);
  assert.doesNotMatch(migrations, /drop table|truncate|disable row level security/);
  assert.match(migrations, /creator_id = \(select auth\.uid\(\)\)/);
  assert.match(migrations, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(migrations, /unique \(user_id, caption_id\)/);
  assert.match(migrations, /check \(vote in \(-1, 1\)\)/);
  assert.match(migrations, /'week4-media', 'week4-media', false, 5242880/);
});

test("Week 5 migration: allow-listed perspective, column-level INSERT only, RLS and policies untouched", () => {
  assert.match(week5, /add column if not exists perspective text not null default 'student'/);
  assert.match(week5, /add constraint ai_captions_perspective_valid\s+check \(perspective in \('student', 'professor'\)\)/);
  assert.match(week5, /grant insert \(perspective\) on table public\.ai_captions to authenticated;/);
  assert.equal((week5.match(/\bgrant\b/g) || []).length, 1);
  assert.doesNotMatch(week5, /\banon\b|\bpublic\.caption_votes\b|storage\.|policy|row level security|revoke|drop table|drop column|truncate|delete from|update public/);
});

test("perspective is parsed on the server and saved from the parsed value, never raw input", () => {
  const action = read("app/(lab)/create/actions.ts");
  assert.match(action, /parseGenerationOptions\(context, tone, perspective\)/);
  assert.match(action, /perspective: options\.perspective,/);
  assert.match(read("app/(lab)/create/create-studio.tsx"), /start\(\{[^}]*\bperspective\b[^}]*\}\)/);
  assert.match(read("app/(lab)/generation-provider.tsx"), /requestCaptions\(\{[^}]*\bperspective: input\.perspective\b[^}]*\}\)/);
  assert.match(read("lib/captions/prompt.ts"), /Perspective: \$\{PERSPECTIVE_GUIDANCE\[perspective\]\}/);
});

test("Explore is public but reads only display data; Rate and Create stay protected", () => {
  const page = read("app/(lab)/explore/page.tsx");
  assert.doesNotMatch(page, /requireUser|"use client"|service_role|generation_prompt|user_context|email/);
  assert.match(page, /select\(userId \? SIGNED_IN_EXPLORE_COLUMNS : PUBLIC_EXPLORE_COLUMNS\)/);
  // Votes: only the viewer's own, and only when signed in.
  assert.match(page, /if \(userId && cards\.length\)[\s\S]*from\("caption_votes"\)[\s\S]*\.eq\("user_id", userId\)/);
  assert.match(page, /<Image[\s\S]*?alt=\{card\.imageAlt \|\| /);
  for (const protectedPage of ["app/(lab)/rate/page.tsx", "app/(lab)/create/page.tsx"]) assert.match(read(protectedPage), /await requireUser\(\)/, protectedPage);
  assert.match(read("lib/auth.ts"), /PUBLIC_PATHS = \["\/explore", "\/login", "\/auth\/callback"\] as const/);
  assert.doesNotMatch(read("app/(lab)/layout.tsx"), /requireUser/);
  assert.match(read("app/(lab)/lab-nav.tsx"), /"\/explore"[\s\S]*"\/rate"[\s\S]*"\/create"/);
});

test("Explore votes reuse the verified Rate action; the browser never sends a user id", () => {
  const buttons = read("app/(lab)/explore/vote-buttons.tsx");
  assert.match(buttons, /import \{ setVote \} from "@\/app\/\(lab\)\/rate\/actions"/);
  assert.match(buttons, /setVote\(captionId, vote === value \? null : value\)/);
  assert.doesNotMatch(buttons, /user_?[iI]d/);
  assert.match(buttons, /if \(!signedIn\) \{\s*setAskSignIn\(true\);\s*return;/);
});

test("generation runs through a JSON Route Handler that re-verifies the session", () => {
  const routeSource = read("app/api/captions/route.ts");
  assert.match(routeSource, /createCaptions\(body\)/);
  assert.match(routeSource, /application\/json/);
  assert.match(routeSource, /export const maxDuration = 60/);
  assert.match(read("app/(lab)/create/actions.ts"), /const userId = await getVerifiedUserId\(supabase\);\s*if \(!userId\) return \{ status: "error", message: SESSION_EXPIRED \};[\s\S]*export async function createCaptions/);
  assert.match(read("app/(lab)/layout.tsx"), /<GenerationProvider>/);
});

test("Week 6 migration: narrow anon read, ten-word check, locked-down admin table", () => {
  // Anon: SELECT on display columns only; never prompts, context, model, creator; never writes.
  assert.match(week6, /grant select \(id, batch_id, caption, source_image_path, image_alt, tone, perspective, created_at\)\s+on table public\.ai_captions to anon;/);
  assert.doesNotMatch(week6, /grant[^;]*(generation_prompt|user_context|creator_id|model)[^;]*to anon/);
  assert.doesNotMatch(week6, /grant (insert|update|delete|all)[^;]*to (anon|authenticated)/);
  assert.match(week6, /create policy "week6_ai_captions_select_anon"\s+on public\.ai_captions for select to anon/);
  // Storage: anon may read only images behind a published caption; the bucket stays private.
  assert.match(week6, /on storage\.objects for select to anon\s+using \(\s*bucket_id = 'week4-media'\s+and exists \(select 1 from public\.ai_captions c where c\.source_image_path = objects\.name\)/);
  assert.doesNotMatch(week6, /public = true|update storage\.buckets/);
  // Ten words, enforced for new rows and edits without rewriting history.
  assert.match(week6, /add constraint ai_captions_caption_max_words[\s\S]*<= 10\)\s+not valid;/);
  // Admin membership: RLS on, no client grants, no policies, service role read-only.
  assert.match(week6, /alter table public\.caption_lab_admins enable row level security/);
  assert.match(week6, /revoke all on table public\.caption_lab_admins from public, anon, authenticated/);
  assert.match(week6, /grant select on table public\.caption_lab_admins to service_role/);
  assert.doesNotMatch(week6, /policy[^;]*caption_lab_admins/);
  assert.doesNotMatch(week6, /profiles|caption_votes|drop table|truncate|disable row level security|delete from|insert into/);
});

test("Week 6 admin grants: service role only, least privilege, no client roles", () => {
  assert.doesNotMatch(week6Admin, /\b(anon|authenticated)\b|policy|row level security|revoke|drop|truncate/);
  assert.match(week6Admin, /grant update \(caption, tone, perspective\) on table public\.ai_captions to service_role;/);
  assert.match(week6Admin, /grant select on table public\.caption_votes to service_role;/);
  assert.doesNotMatch(week6Admin, /grant (insert|update|delete)[^;]*caption_votes/);
  assert.doesNotMatch(week6Admin, /grant update(?! \(caption, tone, perspective\))/);
});

test("ten words is enforced server-side for every generated caption", () => {
  const gemini = read("lib/captions/gemini.ts");
  assert.match(gemini, /countWords\(caption\) > MAX_CAPTION_WORDS/);
  assert.match(gemini, /"too_many_words"\]\);/);
  assert.match(read("lib/captions/prompt.ts"), /at most 10 words/);
});

test("Week 3 profile UX and the Week 2 table are gone from the product", () => {
  assert.ok(!files.some((p) => /^app\/(profile|protected)\//.test(p)));
  assert.doesNotMatch(source, /href="\/profile|isProfileComplete|ProfileUnavailable|from\("profiles"\)|week2_games|<table/);
});

test("UI renders images with alt text and Funny / Not funny text labels", () => {
  const deck = read("app/(lab)/rate/rate-deck.tsx");
  assert.match(deck, /<Image[\s\S]*?alt=\{card\.imageAlt\}/);
  assert.match(deck, /Funny<\/button>/);
  assert.match(deck, /Not funny/);
  assert.match(read("app/login/page.tsx"), /<Image[\s\S]*?alt="[^"]{20,}"/);
  assert.match(read("app/(lab)/rate/page.tsx"), /Nothing left to rate/);
});


test("Week 7 service credential stays in a server-only runtime module; votes never use it",()=>{
 const users=appFiles.filter(path=>read(path).includes("process.env.SUPABASE_SERVICE_ROLE_KEY"));
 assert.deepEqual(users,["lib/supabase/runtime.ts"]);
 assert.match(read(users[0]),/^import "server-only";/);
 assert.doesNotMatch(read("app/(lab)/rate/actions.ts"),/RuntimeClient|privileged|SERVICE_ROLE/);
});
