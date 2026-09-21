import assert from "node:assert/strict";
import { test } from "node:test";

// Run against a local production server; no accounts or database rows are created.
const origin = process.env.TEST_ORIGIN || "http://localhost:3000";
const request = (path, options = {}) => fetch(new URL(path, origin), { redirect: "manual", ...options });

test("public Assignment 2 page still displays all four games", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const name of ["The Legend of Zelda: Breath of the Wild", "Minecraft", "Portal 2", "Rocket League"]) {
    assert.ok(html.includes(name), `Missing game: ${name}`);
  }
  assert.equal((html.match(/<td class="px-5 py-4 font-medium">/g) || []).length, 4);
});

test("unauthenticated protected page redirects without exposing gated content", async () => {
  const response = await request("/protected");
  assert.equal(response.status, 307);
  assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
  assert.ok(!(await response.text()).includes("This content is only visible to authenticated users."));
});

test("login renders without a configured Google Client ID", async () => {
  const response = await request("/login");
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes("Sign in with Google"));
});

test("manual callback GET redirects safely", async () => {
  const response = await request("/auth/callback");
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login");
});

for (const [name, fields, cookie] of [
  ["missing CSRF cookie", { g_csrf_token: "test-csrf", credential: "invalid-token" }, ""],
  ["missing CSRF body field", { credential: "invalid-token" }, "g_csrf_token=test-csrf"],
  ["mismatched CSRF tokens", { g_csrf_token: "different", credential: "invalid-token" }, "g_csrf_token=test-csrf"],
  ["empty CSRF tokens", { g_csrf_token: "", credential: "invalid-token" }, "g_csrf_token="],
  ["missing credential", { g_csrf_token: "test-csrf" }, "g_csrf_token=test-csrf"],
  ["invalid credential", { g_csrf_token: "test-csrf", credential: "invalid-token" }, "g_csrf_token=test-csrf"],
]) {
  test(`callback rejects ${name}`, async () => {
    const response = await request("/auth/callback", {
      method: "POST",
      headers: { Cookie: cookie },
      body: new URLSearchParams(fields),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/login");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(await response.text(), "");
  });
}

test("callback rejects malformed form input", async () => {
  const response = await request("/auth/callback", { method: "POST", body: "not-form-data" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login");
});
