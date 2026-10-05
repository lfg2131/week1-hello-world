import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";

// Requires a running server (TEST_ORIGIN, default local production server).
// Creates no accounts and no rows.
const origin = process.env.TEST_ORIGIN || "http://localhost:3000";
const request = (path, options = {}) => fetch(new URL(path, origin), { redirect: "manual", ...options });
const location = (r) => new URL(r.headers.get("location"), origin).pathname;

for (const path of ["/", "/rate", "/create", "/profile"]) test(`logged out ${path} ends at /login`, async () => {
  let response = await request(path);
  for (let hops = 0; hops < 3 && response.status >= 300 && response.status < 400 && location(response) !== "/login"; hops++) response = await request(location(response));
  assert.ok([303, 307, 308].includes(response.status));
  assert.equal(location(response), "/login");
});

test("login is public, branded, has imagery and Google sign-in", async () => {
  const response = await request("/login");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["Caption Lab", "Continue with Google", "login-hero"]) assert.ok(html.includes(text), text);
  assert.match(html, /<img[^>]+alt="A hand holds up a phone[^"]+"/);
  assert.doesNotMatch(html, /href="\/profile|<table/);
});

for (const query of ["", "?code=invalid-code", "?error=access_denied", "?next=https://evil.example"]) test(`callback fails safely: ${query || "no code"}`, async () => {
  const response = await request(`/auth/callback${query}`, { headers: { "X-Forwarded-Host": "evil.example" } });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login");
  assert.match(response.headers.get("cache-control"), /no-store/);
});

test("anonymous Supabase clients cannot read or write Week 4 tables", async (t) => {
  const env = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.startsWith("NEXT_PUBLIC_SUPABASE")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/["'\r]/g, "").trim()])) : {};
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return t.skip("Supabase env not available");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
  const id = "11111111-1111-4111-8111-111111111111";
  const rows = {
    ai_captions: { batch_id: id, creator_id: id, source_image_path: `${id}/${id}.jpg`, caption: "x", generation_prompt: "x", model: "x" },
    caption_votes: { caption_id: id, user_id: id, vote: 1 },
  };
  for (const table of ["ai_captions", "caption_votes"]) {
    const read = await fetch(`${url}/rest/v1/${table}?select=id&limit=1`, { headers });
    assert.ok([401, 403].includes(read.status), `${table} anon read ${read.status}`);
    const write = await fetch(`${url}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(rows[table]) });
    assert.ok([401, 403].includes(write.status), `${table} anon write ${write.status}`);
  }
});
