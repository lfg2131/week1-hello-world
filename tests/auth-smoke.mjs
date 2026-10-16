import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";

// Requires a running server (TEST_ORIGIN, default local production server).
// Creates no accounts and no rows: every write below is expected to be denied.
const origin = process.env.TEST_ORIGIN || "http://localhost:3000";
const request = (path, options = {}) => fetch(new URL(path, origin), { redirect: "manual", ...options });
const target = (r) => { const u = new URL(r.headers.get("location"), origin); return u.pathname + u.search; };

test("logged out / goes to public Explore", async () => {
  const response = await request("/");
  assert.ok([303, 307, 308].includes(response.status));
  assert.equal(target(response), "/explore");
});

test("logged out Explore is public: one card per caption, images, votes ask for sign-in, no private data", async () => {
  const response = await request("/explore");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const html = await response.text();
  assert.match(html, /See what everyone made/);
  assert.match(html, /browsing as a guest/);
  const cards = (html.match(/<article/g) || []).length;
  assert.ok(cards > 0, "captions render for guests");
  assert.equal((html.match(/ Funny<\/button>/g) || []).length, cards, "a Funny button on every card");
  assert.equal((html.match(/ Not funny<\/button>/g) || []).length, cards, "a Not funny button on every card");
  assert.match(html, /<img[^>]+src="https:\/\/[^"]+\/storage\/v1\/object\/sign\/week4-media\//);
  assert.doesNotMatch(html, /generation_prompt|user_context|\[system instruction\]|@gmail\.com|@columbia\.edu|Your post|Sign out/);
});

for (const path of ["/rate", "/create"]) test(`logged out ${path} -> /login?next=${path}`, async () => {
  const response = await request(path);
  assert.ok([303, 307, 308].includes(response.status));
  assert.equal(target(response), `/login?next=${path}`);
});

test("logged out generation API is a 401", async () => {
  const response = await request("/api/captions", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal(response.status, 401);
});

test("login is public, branded, has imagery and Google sign-in", async () => {
  const response = await request("/login?next=/explore");
  assert.equal(response.status, 200);
  const html = await response.text();
  for (const text of ["Caption Lab", "Continue with Google", "login-hero"]) assert.ok(html.includes(text), text);
  assert.match(html, /<img[^>]+alt="A hand holds up a phone[^"]+"/);
  assert.doesNotMatch(html, /href="\/profile|<table/);
});

for (const query of ["", "?code=invalid-code", "?error=access_denied", "?next=https://evil.example"]) test(`callback fails safely: ${query || "no code"}`, async () => {
  const response = await request(`/auth/callback${query}`, { headers: { "X-Forwarded-Host": "evil.example", cookie: "caption_lab_next=https://evil.example" } });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login");
  assert.match(response.headers.get("cache-control"), /no-store/);
});

function supabaseEnv() {
  const env = existsSync(".env.local") ? Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.startsWith("NEXT_PUBLIC_SUPABASE")).map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).replace(/["'\r]/g, "").trim()])) : {};
  return { url: process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

test("anonymous Supabase clients: display columns readable; prompts, votes, profiles, admins and all writes denied", async (t) => {
  const { url, key } = supabaseEnv();
  if (!url || !key) return t.skip("Supabase env not available");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
  const id = "11111111-1111-4111-8111-111111111111";

  const display = await fetch(`${url}/rest/v1/ai_captions?select=id,caption,source_image_path,perspective&limit=1`, { headers });
  assert.equal(display.status, 200);
  for (const column of ["*", "generation_prompt", "user_context", "creator_id", "model"]) {
    const hidden = await fetch(`${url}/rest/v1/ai_captions?select=${column}&limit=1`, { headers });
    assert.ok([401, 403].includes(hidden.status), `ai_captions.${column} anon read ${hidden.status}`);
  }
  const caption = { batch_id: id, creator_id: id, source_image_path: `${id}/${id}.jpg`, caption: "x", generation_prompt: "x", model: "x" };
  assert.ok([401, 403].includes((await fetch(`${url}/rest/v1/ai_captions`, { method: "POST", headers, body: JSON.stringify(caption) })).status), "anon insert caption");
  for (const method of ["PATCH", "DELETE"]) {
    const response = await fetch(`${url}/rest/v1/ai_captions?id=not.is.null`, { method, headers: { ...headers, Prefer: "return=representation" }, body: method === "PATCH" ? JSON.stringify({ caption: "pwned" }) : undefined });
    assert.ok([401, 403].includes(response.status), `anon ${method} caption ${response.status}`);
  }
  for (const table of ["caption_votes", "caption_lab_admins"]) {
    assert.ok([401, 403].includes((await fetch(`${url}/rest/v1/${table}?select=*&limit=1`, { headers })).status), `${table} anon read`);
  }
  assert.ok([401, 403].includes((await fetch(`${url}/rest/v1/caption_votes`, { method: "POST", headers, body: JSON.stringify({ caption_id: id, user_id: id, vote: 1 }) })).status), "anon vote");
  // Shared profiles table: RLS returns nothing to anon.
  const profiles = await fetch(`${url}/rest/v1/profiles?select=id&limit=5`, { headers });
  assert.ok(profiles.status === 200 ? (await profiles.json()).length === 0 : [401, 403].includes(profiles.status), "anon profiles");
});

test("anonymous Storage: published images can be signed; anything else cannot; uploads are denied", async (t) => {
  const { url, key } = supabaseEnv();
  if (!url || !key) return t.skip("Supabase env not available");
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" };
  const [published] = await (await fetch(`${url}/rest/v1/ai_captions?select=source_image_path&limit=1`, { headers })).json();
  if (!published) return t.skip("no published captions");
  const sign = (path) => fetch(`${url}/storage/v1/object/sign/week4-media/${path}`, { method: "POST", headers, body: JSON.stringify({ expiresIn: 60 }) });
  assert.equal((await sign(published.source_image_path)).status, 200);
  const unpublished = `${published.source_image_path.split("/")[0]}/00000000-0000-4000-8000-000000000000.jpg`;
  assert.notEqual((await sign(unpublished)).status, 200);
  const upload = await fetch(`${url}/storage/v1/object/week4-media/${unpublished}`, { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "image/jpeg" }, body: new Uint8Array([0xff, 0xd8, 0xff]) });
  assert.ok(upload.status >= 400, `anon upload ${upload.status}`);
});
