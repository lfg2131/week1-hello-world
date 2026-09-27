import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as profileHelpers from "../lib/profile.ts";

// Execute real route/action source with only framework/network dependencies stubbed.
function load(file, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: (name) => {
    assert.ok(name in dependencies, `Unexpected import: ${name}`);
    return dependencies[name];
  }, Response, URL, Date, FormData });
  return exports;
}

function fixture({ authenticated = true, complete = false, missing = false, exchangeError = false } = {}) {
  const calls = [];
  const query = {
    select: (columns) => { calls.push(["select", columns]); return query; },
    eq: (column, value) => { calls.push(["eq", column, value]); return query; },
    update: (data) => { calls.push(["update", data]); return query; },
    single: async () => ({ data: missing ? null : { id: "verified-user", first_name: complete ? "Alex" : null, last_name: complete ? "Smith" : null }, error: missing ? { message: "private db detail" } : null }),
  };
  const client = {
    auth: {
      exchangeCodeForSession: async (code) => { calls.push(["exchange", code]); return { error: exchangeError ? {} : null }; },
      getClaims: async () => ({ data: authenticated ? { claims: { sub: "verified-user" } } : null }),
      signOut: async (options) => { calls.push(["signOut", options]); return { error: null }; },
    },
    from: (table) => { calls.push(["from", table]); return query; },
    storage: { from: (bucket) => { calls.push(["bucket", bucket]); return { getPublicUrl: (path) => ({ data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` } }) }; } },
  };
  const dependencies = {
    "@/lib/supabase/server": { createClient: async (options) => { calls.push(["client", options]); return client; } },
    "@/lib/profile": profileHelpers,
    "next/cache": { revalidatePath: (path) => calls.push(["revalidate", path]) },
    "next/navigation": { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
  };
  return { calls, dependencies };
}

for (const [label, options, target] of [
  ["new user", {}, "/profile/complete"],
  ["complete profile", { complete: true }, "/protected"],
  ["missing trigger row", { missing: true }, "/profile"],
  ["unverified identity", { authenticated: false }, "/login"],
  ["exchange failure", { exchangeError: true }, "/login"],
]) test(`OAuth callback: ${label}`, async () => {
  const { calls, dependencies } = fixture(options);
  const { GET } = load("../app/auth/callback/route.ts", dependencies);
  const response = await GET(new Request("https://app.example/auth/callback?code=test&next=https://evil.example"));
  assert.equal(response.headers.get("location"), target);
  assert.equal(calls[0][1].writable, true);
  assert.deepEqual(calls[1], ["exchange", "test"]);
  if (target !== "/login") assert.ok(calls.some((call) => call[0] === "eq" && call[2] === "verified-user"));
});

function form() {
  const data = new FormData();
  data.set("first_name", " Alex "); data.set("last_name", " Smith ");
  data.set("id", "attacker-supplied-id");
  return data;
}

test("profile action scopes update to verified identity, normalizes names, and ignores extra fields", async () => {
  const { calls, dependencies } = fixture();
  const result = await load("../app/profile/actions.ts", dependencies).saveProfile(form());
  assert.equal(result.success, "Profile saved.");
  assert.ok(calls.some((c) => c[0] === "eq" && c[1] === "id" && c[2] === "verified-user"));
  const update = calls.find((c) => c[0] === "update")[1];
  assert.equal(update.name, "Alex Smith"); assert.equal(update.initials, "AS");
  assert.equal(update.id, undefined); assert.ok(Date.parse(update.updated_at));
});

for (const [label, options, mutate] of [
  ["unauthenticated", { authenticated: false }, () => {}],
  ["blank names", {}, (f) => f.set("first_name", "  ")],
  ["oversize names", {}, (f) => f.set("last_name", "x".repeat(81))],
  ["foreign avatar", {}, (f) => f.set("avatar_path", "someone-else/profile/avatar-12345678-1234-1234-1234-123456789abc.png")],
  ["binary avatar", {}, (f) => f.set("avatar_path", new File(["bytes"], "photo.png"))],
]) test(`profile action rejects ${label} before update`, async () => {
  const { calls, dependencies } = fixture(options);
  const input = form(); mutate(input);
  assert.ok((await load("../app/profile/actions.ts", dependencies).saveProfile(input)).error);
  assert.ok(!calls.some((c) => c[0] === "update"));
});

test("avatar action persists only the public media URL", async () => {
  const { calls, dependencies } = fixture();
  const input = form(); input.set("avatar_path", "verified-user/profile/avatar-12345678-1234-1234-1234-123456789abc.webp");
  const result = await load("../app/profile/actions.ts", dependencies).saveProfile(input);
  assert.match(result.avatarUrl, /\/public\/media\/verified-user\/profile\/avatar-/);
  const update = calls.find((c) => c[0] === "update")[1];
  assert.equal(update.avatar_url, result.avatarUrl);
  assert.equal(Object.values(update).every((value) => typeof value === "string"), true);
});

test("completion redirects only after a successful update", async () => {
  const { dependencies } = fixture();
  await assert.rejects(load("../app/profile/actions.ts", dependencies).completeProfile(form()), /REDIRECT:\/protected/);
  const missing = fixture({ missing: true });
  assert.ok((await load("../app/profile/actions.ts", missing.dependencies).completeProfile(form())).error);
});

test("sign out clears current session and invalidates navigation cache", async () => {
  const { calls, dependencies } = fixture();
  await assert.rejects(load("../app/protected/actions.ts", dependencies).signOut(), /REDIRECT:\/login/);
  assert.equal(calls.find((c) => c[0] === "signOut")[1].scope, "local");
  assert.ok(calls.some((c) => c[0] === "revalidate"));
});
