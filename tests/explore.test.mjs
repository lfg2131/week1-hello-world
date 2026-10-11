import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { loadModule } from "./helpers/load-ts.mjs";
import { fakeSupabase } from "./helpers/fake-supabase.mjs";
import { CAPTION_ID, OTHER, USER } from "./helpers/fixtures.mjs";

// Server and client components are rendered to static HTML with the real
// React renderer; Supabase is the recording fake, so nothing touches the network.
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const ui = {
  react: React,
  "react/jsx-runtime": require("react/jsx-runtime"),
  "next/image": { __esModule: true, default: ({ src, alt, loading }) => React.createElement("img", { src, alt, loading }) },
  "next/link": { __esModule: true, default: ({ href, className, children }) => React.createElement("a", { href, className }, children) },
};
const signedIn = (client) => ({ "@/lib/supabase/require-user": { requireUser: async () => ({ supabase: client, userId: USER }) } });

const IMG_NEW = `${OTHER}/66666666-6666-4666-8666-666666666666.jpg`;
const IMG_OLD = `${USER}/77777777-7777-4777-8777-777777777777.png`;
const row = (id, batch, path, creator, perspective, tone, at, caption) => ({
  id, batch_id: batch, caption, source_image_path: path, image_alt: `Alt for ${batch}`, tone, perspective, creator_id: creator, created_at: at,
});
// Newest first, as the database returns them: another user's professor post, then the viewer's student post.
const ROWS = [
  row("p1", "batch-new", IMG_NEW, OTHER, "professor", "dry", "2026-10-11T15:00:00.000+00:00", "Attendance today: me and the projector."),
  row("p2", "batch-new", IMG_NEW, OTHER, "professor", "dry", "2026-10-11T15:00:00.000+00:00", "Office hours, now with a waitlist of zero."),
  row("p3", "batch-new", IMG_NEW, OTHER, "professor", "dry", "2026-10-11T15:00:00.000+00:00", "<script>alert(1)</script> is not a citation."),
  row("s1", "batch-old", IMG_OLD, USER, "student", null, "2026-10-05T19:00:00.000+00:00", "Dinner, breakfast, and my emotional support slice."),
  row("s2", "batch-old", IMG_OLD, USER, "student", null, "2026-10-05T19:00:00.000+00:00", "My meal plan could never."),
  row("s3", "batch-old", IMG_OLD, USER, "student", null, "2026-10-05T19:00:00.000+00:00", "Group project fuel, budget edition."),
];

async function renderExplore(options = {}) {
  const { client, calls } = fakeSupabase({ userId: USER, rows: ROWS, ...options });
  const page = loadModule("app/(lab)/explore/page.tsx", { ...ui, ...signedIn(client) }).default;
  return { html: renderToStaticMarkup(await page()), calls };
}

test("Explore reads every generated caption from every creator, newest first, with no vote or creator filter", async () => {
  const { calls } = await renderExplore();
  const query = calls.filter((call) => call[0] === "ai_captions");
  const select = query.find((call) => call[1] === "select")[2];
  for (const column of ["caption", "source_image_path", "image_alt", "perspective", "tone", "batch_id", "created_at"]) assert.match(select, new RegExp(`\\b${column}\\b`));
  assert.doesNotMatch(select, /caption_votes/);
  assert.deepEqual(plain(query.find((call) => call[1] === "order")), ["ai_captions", "order", "created_at", { ascending: false }]);
  assert.ok(!query.some((call) => ["eq", "is", "gte", "insert", "update", "delete", "upsert"].includes(call[1])));
  // Images come from the private bucket as signed URLs, once per post.
  const sign = calls.find((call) => call[1] === "signMany");
  assert.equal(sign[2], "week4-media");
  assert.deepEqual(plain(sign[3]), [IMG_NEW, IMG_OLD]);
});

test("Explore cards show each post's image, its captions, and the perspective, newest post first", async () => {
  const { html } = await renderExplore();
  assert.match(html, /See what everyone made/);
  assert.match(html, /2 posts · 6 captions/);
  assert.match(html, new RegExp(`<img src="https://signed.example/${IMG_NEW}" alt="Alt for batch-new"`));
  assert.match(html, new RegExp(`<img src="https://signed.example/${IMG_OLD}" alt="Alt for batch-old"`));
  for (const caption of ["Attendance today: me and the projector.", "Office hours, now with a waitlist of zero.", "My meal plan could never."]) assert.ok(html.includes(caption), caption);
  assert.ok(html.indexOf("Attendance today") < html.indexOf("Dinner, breakfast"), "newest post first");
  assert.ok(html.indexOf("Professor perspective") < html.indexOf("Student perspective"));
  assert.equal(html.match(/Professor perspective/g).length, 1);
  assert.equal(html.match(/Student perspective/g).length, 1);
  assert.match(html, /<time dateTime="2026-10-11T15:00:00.000\+00:00"/);
  // Only the viewer's own (older, student) post is marked.
  assert.equal(html.match(/Your post/g).length, 1);
  const mine = html.indexOf("Your post");
  assert.ok(html.indexOf("Attendance today") < mine && mine < html.indexOf("Student perspective"));
  // Captions are escaped text, never HTML; no vote data is shown.
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.doesNotMatch(html, /vote|Funny ✓/i);
});

test("Explore shows a helpful empty state that links to Create", async () => {
  const { html } = await renderExplore({ rows: [] });
  assert.match(html, /No posts yet/);
  assert.match(html, /<a href="\/create"[^>]*>Create the first post<\/a>/);
  assert.doesNotMatch(html, /<img/);
});

test("Explore fails loudly (error boundary) instead of showing an empty feed when the read fails", async () => {
  await assert.rejects(renderExplore({ selectError: { message: "boom" } }), /Failed to load Explore/);
});

test("Explore redirects signed-out visitors to /login before reading any captions", async () => {
  const { client, calls } = fakeSupabase({ userId: null, rows: ROWS });
  const page = loadModule("app/(lab)/explore/page.tsx", {
    ...ui,
    "./server": { createClient: async () => client },
    "next/navigation": { redirect: (path) => { throw new Error(`REDIRECT:${path}`); } },
  }).default;
  await assert.rejects(page(), /REDIRECT:\/login/);
  assert.ok(!calls.some((call) => call[0] === "ai_captions"));
});

test("Rate shows a subtle perspective badge on the card and still serves only unrated captions", async () => {
  const { client, calls } = fakeSupabase({
    userId: USER,
    rows: [{ ...row(CAPTION_ID, "batch-new", IMG_NEW, OTHER, "professor", "dry", "2026-10-11T15:00:00.000+00:00", "Grading this like it is a dissertation."), caption_votes: [] }],
  });
  const page = loadModule("app/(lab)/rate/page.tsx", { ...ui, ...signedIn(client), "./actions": { submitVote: async () => ({}) } }).default;
  const html = renderToStaticMarkup(await page());
  assert.match(calls.find((call) => call[0] === "ai_captions" && call[1] === "select")[2], /\bperspective\b/);
  assert.deepEqual(plain(calls.find((call) => call[1] === "is")), ["ai_captions", "is", "caption_votes", null]);
  assert.match(html, /Professor perspective/);
  assert.ok(html.indexOf("Professor perspective") < html.indexOf("Grading this like it is a dissertation."));
  assert.match(html, /😂<\/span> Funny/);
});

test("Create offers a two-option Perspective control that defaults to Student", () => {
  const { CreateStudio } = loadModule("app/(lab)/create/create-studio.tsx", {
    ...ui,
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/lib/supabase/client": { createClient: () => ({}) },
    "./actions": { createCaptions: async () => ({}), prepareUpload: async () => ({}) },
  });
  const html = renderToStaticMarkup(React.createElement(CreateStudio, { vibe: { title: "2am dollar slice", hint: "First time trying dollar pizza at 2am" } }));
  assert.match(html, /<legend[^>]*>Perspective<\/legend>/);
  const radios = html.match(/<input[^>]*name="perspective"[^>]*>/g);
  assert.equal(radios.length, 2);
  assert.match(radios[0], /value="student"/);
  assert.match(radios[0], /checked=""/);
  assert.match(radios[1], /value="professor"/);
  assert.doesNotMatch(radios[1], /checked/);
  assert.ok(html.indexOf("Student") < html.indexOf("Professor"));
  // The existing inputs are all still there.
  for (const text of ["Add a photo", "What should the AI know?", "Tone", "Surprise me", "Generate 3 captions"]) assert.ok(html.includes(text), text);
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
