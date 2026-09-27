import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const appFiles = files.filter((p) => /^(app|lib)\//.test(p) && /\.(tsx?|mjs)$/.test(p));
const source = appFiles.map(read).join("\n");

test("OAuth uses the exact callback without custom query parameters", () => {
  const login = read("app/login/google-sign-in.tsx");
  assert.match(login, /signInWithOAuth\(\{\s*provider: "google",\s*options: \{\s*redirectTo: `\$\{window.location.origin\}\/auth\/callback`,\s*\},\s*\}\)/);
  assert.equal((source.match(/redirectTo:/g) || []).length, 1);
  assert.doesNotMatch(source, /signInWithIdToken|g_csrf_token|accounts\.google\.com\/gsi|NEXT_PUBLIC_GOOGLE_CLIENT_ID|getSession\(/);
});

test("no privileged credentials in tracked or local environment files", () => {
  const envFiles = readdirSync(".").filter((p) => /^\.env/.test(p));
  const candidates = [...new Set([...files, ...envFiles])].filter((p) => !p.startsWith("tests/") && !/\.(ico|png|jpg|woff2?)$/.test(p));
  for (const path of candidates) {
    const content = read(path);
    // Print only the filename if a secret is found, never the matching value.
    assert.ok(!/(?:GOOGLE_CLIENT_SECRET|NEXT_PUBLIC_GOOGLE_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY)\s*[=:]|GOCSPX-[\w-]+|sb_secret_[\w-]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(content), `Forbidden credential in ${path}`);
    for (const token of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || []) {
      try { assert.notEqual(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).role, "service_role", `Privileged JWT in ${path}`); }
      catch (error) { if (error.code === "ERR_ASSERTION") throw error; }
    }
  }
  assert.ok(!files.includes(".env.local"));
});

test("SQL is additive only and does not weaken policies or store images", () => {
  const sql = read("supabase/migrations/20260927_week3_profiles_names.sql").replace(/--[^\n]*/g, "").trim();
  assert.equal(sql, "alter table public.profiles\n  add column if not exists first_name text,\n  add column if not exists last_name text;");
  assert.doesNotMatch(source, /readAsDataURL|\.arrayBuffer\(|base64|\.from\("profiles"\)\.(insert|upsert)/);
});

test("upload is scoped to authenticated media folder and bytes never reach profile action", () => {
  const form = read("app/profile/profile-form.tsx");
  assert.match(form, /const userId = data.claims.sub/);
  assert.ok(form.includes('`${userId}/profile/avatar-${crypto.randomUUID()}.${extension}`'));
  assert.match(form, /storage.from\("media"\).upload\(path, photo/);
  assert.match(form, /form.delete\("photo"\)/);
  assert.match(read("app/profile/actions.ts"), /getPublicUrl\(avatarPath\)/);
});

test("Week 3 has consistent semantic color accents and colored primary actions", () => {
  const css = read("app/globals.css");
  for (const color of ["indigo", "violet", "amber", "emerald", "red"]) assert.ok(css.includes(color));
  assert.match(css, /\.primary-button\s*\{[^}]*bg-indigo-600/);
  assert.match(css, /\.profile-button\s*\{[^}]*bg-violet-600/);
  assert.match(read("app/login/page.tsx"), /tone="auth"/);
  assert.match(read("app/profile/page.tsx"), /tone="profile"/);
  assert.match(read("app/profile/complete/page.tsx"), /status-warning/);
  assert.match(read("app/protected/page.tsx"), /status-success/);
});
