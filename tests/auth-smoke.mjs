import assert from "node:assert/strict";
import { test } from "node:test";

// Requires a running local production server. No accounts or rows are created.
const origin = process.env.TEST_ORIGIN || "http://localhost:3000";
const request = (path, options = {}) => fetch(new URL(path, origin), { redirect: "manual", ...options });

test("public Assignment 2 page displays all four database games", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const name of ["The Legend of Zelda: Breath of the Wild", "Minecraft", "Portal 2", "Rocket League"]) assert.ok(html.includes(name), `Missing game: ${name}`);
  assert.equal((html.match(/<td class="px-5 py-4 font-medium">/g) || []).length, 4);
});

for (const path of ["/protected", "/profile", "/profile/complete"]) {
  test(`unauthenticated ${path} redirects to login`, async () => {
    const response = await request(path);
    assert.equal(response.status, 307);
    assert.equal(new URL(response.headers.get("location"), origin).pathname, "/login");
    assert.ok(!(await response.text()).includes("This content is only visible to authenticated users."));
  });
}

test("login renders Google OAuth button", async () => {
  const response = await request("/login");
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes("Continue with Google"));
});

for (const query of ["", "?code=invalid-code", "?error=access_denied", "?next=https://evil.example"]) {
  test(`callback fails safely: ${query || "no code"}`, async () => {
    const response = await request(`/auth/callback${query}`, { headers: { "X-Forwarded-Host": "evil.example" } });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/login");
    assert.match(response.headers.get("cache-control"), /no-store/);
    assert.equal(await response.text(), "");
  });
}

test("callback no longer accepts POST", async () => {
  const response = await request("/auth/callback", { method: "POST", body: "invalid" });
  assert.equal(response.status, 405);
});

test("login emits the indigo palette and colored primary button styles", async () => {
  const html = await (await request("/login")).text();
  assert.match(html, /status-auth/);
  assert.match(html, /primary-button/);
  const stylesheets = [...html.matchAll(/href="([^"]+\.css(?:\?[^\"]*)?)"/g)].map((match) => match[1].replaceAll("&amp;", "&"));
  assert.ok(stylesheets.length > 0);
  const css = (await Promise.all(stylesheets.map(async (path) => (await fetch(new URL(path, origin))).text()))).join("\n");
  assert.match(css, /\.primary-button\{[^}]*background-color:var\(--color-indigo-600\)/);
  assert.match(css, /\.profile-button\{[^}]*background-color:var\(--color-violet-600\)/);
});
