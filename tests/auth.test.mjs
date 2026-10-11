import assert from "node:assert/strict";
import { test } from "node:test";

// Values created inside the vm sandbox have foreign prototypes; compare as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));
import { loadModule } from "./helpers/load-ts.mjs";
import { fakeSupabase, actionStubs } from "./helpers/fake-supabase.mjs";
import { USER } from "./helpers/fixtures.mjs";

const env = { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };

class FakeResponse {
  constructor(status = 200, location = null) {
    this.status = status;
    this.headers = new Headers(location ? { location } : {});
    const jar = [];
    this.cookies = { set: (c, v) => jar.push(typeof c === "string" ? { name: c, value: v } : c), getAll: () => jar };
  }
  static next() { return new FakeResponse(); }
  static redirect(url) { return new FakeResponse(307, url.toString()); }
}

function proxyFor(userId) {
  const { client } = fakeSupabase({ userId });
  const { updateSession } = loadModule("lib/supabase/proxy.ts", {
    "@supabase/ssr": { createServerClient: () => client },
    "next/server": { NextResponse: FakeResponse },
  }, { env });
  return (path) => {
    const url = `https://app.example${path}`;
    return updateSession({ url, nextUrl: new URL(url), cookies: { getAll: () => [], set() {} } });
  };
}
const location = (r) => r.headers.get("location") && new URL(r.headers.get("location")).pathname;

for (const path of ["/", "/rate", "/explore", "/create", "/anything"]) test(`logged out ${path} -> /login`, async () => {
  const r = await proxyFor(null)(path);
  assert.equal(r.status, 307);
  assert.equal(location(r), "/login");
});

for (const path of ["/login", "/auth/callback"]) test(`logged out ${path} stays public`, async () => {
  assert.equal((await proxyFor(null)(path)).status, 200);
});

for (const path of ["/", "/login"]) test(`authenticated ${path} -> /rate`, async () => {
  assert.equal(location(await proxyFor(USER)(path)), "/rate");
});

for (const path of ["/rate", "/explore", "/create"]) test(`authenticated ${path} renders`, async () => {
  assert.equal((await proxyFor(USER)(path)).status, 200);
});

function callback(options) {
  const { client, calls } = fakeSupabase(options);
  const { GET } = loadModule("app/auth/callback/route.ts", { "@/lib/supabase/server": { createClient: async () => client } });
  return { GET, calls };
}

test("callback success -> /rate, ignores next= and forwarded hosts", async () => {
  const { GET, calls } = callback({ userId: USER });
  const r = await GET(new Request("https://app.example/auth/callback?code=abc&next=https://evil.example"));
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/rate");
  assert.deepEqual(calls.find((c) => c[1] === "exchange"), ["auth", "exchange", "abc"]);
});

test("callback without code or verified identity -> /login", async () => {
  assert.equal((await callback({ userId: USER }).GET(new Request("https://app.example/auth/callback"))).headers.get("location"), "/login");
  assert.equal((await callback({ userId: null }).GET(new Request("https://app.example/auth/callback?code=x"))).headers.get("location"), "/login");
});

test("sign out clears the local session and redirects to /login", async () => {
  const { client, calls } = fakeSupabase({ userId: USER });
  const { stubs } = actionStubs(client, { "next/navigation": { redirect: (p) => { throw new Error(`REDIRECT:${p}`); } } });
  await assert.rejects(loadModule("app/actions.ts", stubs).signOut(), /REDIRECT:\/login/);
  assert.deepEqual(plain(calls.find((c) => c[1] === "signOut")[2]), { scope: "local" });
});

test("pages require a verified user", async () => {
  for (const [userId, target] of [[null, "/login"], [USER, "/rate"]]) {
    const { client } = fakeSupabase({ userId });
    const page = loadModule("app/page.tsx", {
      "@/lib/supabase/server": { createClient: async () => client },
      "next/navigation": { redirect: (p) => { throw new Error(`REDIRECT:${p}`); } },
    }).default;
    await assert.rejects(page(), new RegExp(`REDIRECT:${target}`));
  }
  const { client } = fakeSupabase({ userId: null });
  const { requireUser } = loadModule("lib/supabase/require-user.ts", {
    "./server": { createClient: async () => client },
    "next/navigation": { redirect: (p) => { throw new Error(`REDIRECT:${p}`); } },
  });
  await assert.rejects(requireUser(), /REDIRECT:\/login/);
});
