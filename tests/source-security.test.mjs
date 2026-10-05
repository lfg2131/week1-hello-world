import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter((p) => p && existsSync(p));
const appFiles = files.filter((p) => /^(app|lib)\//.test(p) && /\.(tsx?|mjs)$/.test(p));
const source = appFiles.map(read).join("\n");
// SQL statements only (comments stripped), lowercased.
const migrations = files.filter((p) => /^supabase\/migrations\/.*week4.*\.sql$/.test(p)).map(read).join("\n").replace(/--[^\n]*/g, "").toLowerCase();

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
    assert.ok(!/(?:GOOGLE_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_GEMINI)\s*[=:]|GOCSPX-[\w-]+|sb_secret_[\w-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content), `Forbidden credential in ${path}`);
    if (path !== ".env.local") assert.doesNotMatch(content, /AIza[0-9A-Za-z_-]{30,}/, `Google API key in ${path}`);
    for (const token of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
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
  assert.match(read("app/(lab)/rate/actions.ts"), /user_id: userId/);
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

test("Week 3 profile UX and the Week 2 table are gone from the product", () => {
  assert.ok(!files.some((p) => /^app\/(profile|protected)\//.test(p)));
  assert.doesNotMatch(source, /href="\/profile|isProfileComplete|ProfileUnavailable|from\("profiles"\)|week2_games|<table/);
});

test("UI renders images with alt text and Funny / Not funny text labels", () => {
  const deck = read("app/(lab)/rate/rate-deck.tsx");
  assert.match(deck, /<Image[\s\S]*?alt=\{card\.imageAlt\}/);
  assert.match(deck, /Funny<\/button>|> Funny\s*<\/button>/);
  assert.match(deck, /Not funny/);
  assert.match(read("app/login/page.tsx"), /<Image[\s\S]*?alt="[^"]{20,}"/);
  assert.match(read("app/(lab)/rate/page.tsx"), /Nothing left to rate/);
});
