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
  static json(body, init = {}) { const r = new FakeResponse(init.status ?? 200); r.body = body; return r; }
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

const target = (r) => r.headers.get("location") && (({ pathname, search }) => pathname + search)(new URL(r.headers.get("location")));

for (const path of ["/rate", "/create"]) test(`logged out ${path} -> /login, remembering where to return`, async () => {
  const r = await proxyFor(null)(path);
  assert.equal(r.status, 307);
  assert.equal(target(r), `/login?next=${path}`);
});

test("logged out unknown protected path -> /login without a return path", async () => {
  assert.equal(target(await proxyFor(null)("/anything")), "/login");
});

for (const userId of [null, USER]) test(`${userId ? "authenticated" : "logged out"} / -> /explore`, async () => {
  assert.equal(target(await proxyFor(userId)("/")), "/explore");
});

for (const path of ["/explore", "/login", "/auth/callback"]) test(`logged out ${path} stays public`, async () => {
  assert.equal((await proxyFor(null)(path)).status, 200);
});

test("logged out API calls get a 401 JSON error, not a redirect", async () => {
  const r = await proxyFor(null)("/api/captions");
  assert.equal(r.status, 401);
  assert.equal(r.body.status, "error");
});

test("authenticated /login -> the allow-listed return path, else /explore", async () => {
  assert.equal(target(await proxyFor(USER)("/login")), "/explore");
  assert.equal(target(await proxyFor(USER)("/login?next=/rate")), "/rate");
  for (const evil of ["https://evil.example", "//evil.example", "/auth/callback", "/explore/../admin"]) {
    assert.equal(target(await proxyFor(USER)(`/login?next=${encodeURIComponent(evil)}`)), "/explore");
  }
});

test("safeReturnPath only allows /explore, /rate, and /create", () => {
  const { safeReturnPath } = loadModule("lib/auth.ts");
  for (const ok of ["/explore", "/rate", "/create"]) assert.equal(safeReturnPath(ok), ok);
  for (const bad of [undefined, null, "", "https://evil.example", "//evil.example", "/login", "/rate?x=1", ["/rate"]]) assert.equal(safeReturnPath(bad), "/explore");
});

for (const path of ["/rate", "/explore", "/create"]) test(`authenticated ${path} renders`, async () => {
  assert.equal((await proxyFor(USER)(path)).status, 200);
});

function callback(options, returnCookie) {
  const { client, calls } = fakeSupabase(options);
  const { GET } = loadModule("app/auth/callback/route.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "next/headers": { cookies: async () => ({ get: (name) => (name === "caption_lab_next" && returnCookie !== undefined ? { value: returnCookie } : undefined) }) },
  });
  return { GET, calls };
}

test("callback success -> /explore by default, ignores next= query and forwarded hosts, clears the return cookie", async () => {
  const { GET, calls } = callback({ userId: USER });
  const r = await GET(new Request("https://app.example/auth/callback?code=abc&next=https://evil.example"));
  assert.equal(r.status, 303);
  assert.equal(r.headers.get("location"), "/explore");
  assert.match(r.headers.get("set-cookie"), /^caption_lab_next=; Path=\/; Max-Age=0/);
  assert.deepEqual(calls.find((c) => c[1] === "exchange"), ["auth", "exchange", "abc"]);
});

test("callback returns to an allow-listed page from the return cookie, never to a URL", async () => {
  assert.equal((await callback({ userId: USER }, "/rate").GET(new Request("https://app.example/auth/callback?code=x"))).headers.get("location"), "/rate");
  for (const evil of ["https://evil.example", "//evil.example", "/login"]) {
    assert.equal((await callback({ userId: USER }, evil).GET(new Request("https://app.example/auth/callback?code=x"))).headers.get("location"), "/explore");
  }
});

test("callback without code or verified identity -> /login", async () => {
  assert.equal((await callback({ userId: USER }).GET(new Request("https://app.example/auth/callback"))).headers.get("location"), "/login");
  assert.equal((await callback({ userId: null }).GET(new Request("https://app.example/auth/callback?code=x"))).headers.get("location"), "/login");
});

test("sign out clears the local session and returns to public Explore", async () => {
  const { client, calls } = fakeSupabase({ userId: USER });
  const { stubs } = actionStubs(client, { "next/navigation": { redirect: (p) => { throw new Error(`REDIRECT:${p}`); } } });
  await assert.rejects(loadModule("app/actions.ts", stubs).signOut(), /REDIRECT:\/explore/);
  assert.deepEqual(plain(calls.find((c) => c[1] === "signOut")[2]), { scope: "local" });
});

test("/ always goes to Explore; protected pages require a verified user", async () => {
  const page = loadModule("app/page.tsx", { "next/navigation": { redirect: (p) => { throw new Error(`REDIRECT:${p}`); } } }).default;
  assert.throws(() => page(), /REDIRECT:\/explore/);
  const { client } = fakeSupabase({ userId: null });
  const { requireUser } = loadModule("lib/supabase/require-user.ts", {
    "./server": { createClient: async () => client },
    "next/navigation": { redirect: (p) => { throw new Error(`REDIRECT:${p}`); } },
  });
  await assert.rejects(requireUser(), /REDIRECT:\/login/);
});
