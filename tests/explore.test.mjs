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

const voteStub = { "@/app/(lab)/rate/actions": { setVote: async () => ({ status: "saved", captionId: CAPTION_ID, vote: 1 }) } };

async function renderExplore(options = {}, { searchParams = {} } = {}) {
  const { client, calls } = fakeSupabase({ userId: USER, rows: ROWS, ...options });
  const page = loadModule("app/(lab)/explore/page.tsx", { ...ui, ...voteStub, "@/lib/supabase/server": { createClient: async () => client } }).default;
  return { html: renderToStaticMarkup(await page({ searchParams: Promise.resolve(searchParams) })), calls };
}

test("Explore reads every caption from every creator, newest first; images signed once per photo", async () => {
  const { calls } = await renderExplore();
  const query = calls.filter((call) => call[0] === "ai_captions");
  const select = query.find((call) => call[1] === "select")[2];
  for (const column of ["caption", "source_image_path", "image_alt", "perspective", "tone", "batch_id", "created_at", "creator_id"]) assert.match(select, new RegExp(`\\b${column}\\b`));
  assert.doesNotMatch(select, /caption_votes|generation_prompt|user_context|model/);
  assert.deepEqual(plain(query.find((call) => call[1] === "order")), ["ai_captions", "order", "created_at", { ascending: false }]);
  assert.ok(!query.some((call) => ["eq", "is", "gte", "insert", "update", "delete", "upsert"].includes(call[1])));
  const sign = calls.find((call) => call[1] === "signMany");
  assert.equal(sign[2], "week4-media");
  assert.deepEqual(plain(sign[3]), [IMG_NEW, IMG_OLD]);
});

test("Explore shows one card per caption: image, caption, perspective badge, and Funny / Not funny", async () => {
  const { html } = await renderExplore();
  assert.match(html, /See what everyone made/);
  assert.match(html, /6 captions · 2 photos/);
  const cards = html.match(/<article/g);
  assert.equal(cards.length, 6);
  // The same stored image repeats on each of its three caption cards (no duplicate files).
  assert.equal(html.match(new RegExp(`<img src="https://signed.example/${IMG_NEW}" alt="Alt for batch-new"`, "g")).length, 3);
  assert.equal(html.match(new RegExp(`<img src="https://signed.example/${IMG_OLD}" alt="Alt for batch-old"`, "g")).length, 3);
  assert.equal(html.match(/Professor perspective/g).length, 3);
  assert.equal(html.match(/Student perspective/g).length, 3);
  assert.equal(html.match(/😂 Funny/g).length, 6);
  assert.equal(html.match(/😐 Not funny/g).length, 6);
  for (const id of ["p1", "p2", "p3", "s1", "s2", "s3"]) assert.match(html, new RegExp(`id="caption-${id}"`));
  assert.ok(html.indexOf("Attendance today") < html.indexOf("Dinner, breakfast"), "newest first");
  // Only the viewer's own captions are marked.
  assert.equal(html.match(/Your post/g).length, 3);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.doesNotMatch(html, /browsing as a guest/);
});

test("Explore is public: a signed-out visitor reads only display columns and sees sign-in prompts", async () => {
  const { html, calls } = await renderExplore({ userId: null });
  const select = calls.find((call) => call[0] === "ai_captions" && call[1] === "select")[2];
  assert.equal(select, "id, batch_id, caption, source_image_path, image_alt, tone, perspective, created_at");
  assert.ok(!calls.some((call) => call[0] === "caption_votes"), "no vote reads for guests");
  assert.equal(html.match(/<article/g).length, 6);
  assert.match(html, /browsing as a guest/);
  assert.match(html, /href="\/login\?next=\/explore"/);
  assert.doesNotMatch(html, /Your post/);
  // Voting buttons are visible to guests; clicking asks them to sign in (see VoteButtons test).
  assert.equal(html.match(/😂 Funny/g).length, 6);
});

test("Explore restores the viewer's existing votes after a reload", async () => {
  const { html, calls } = await renderExplore({ votes: [{ caption_id: "p1", vote: 1 }, { caption_id: "s2", vote: -1 }] });
  const voteCalls = calls.filter((call) => call[0] === "caption_votes");
  assert.deepEqual(plain(voteCalls.find((call) => call[1] === "eq")), ["caption_votes", "eq", "user_id", USER]);
  assert.deepEqual(plain(voteCalls.find((call) => call[1] === "in")[3]), ["p1", "p2", "p3", "s1", "s2", "s3"]);
  assert.ok(!voteCalls.some((call) => call[1] === "insert"));
  assert.match(html, /You voted Funny/);
  assert.match(html, /You voted Not funny/);
  assert.equal(html.match(/😂 Funny/g).length, 6);
});

test("Explore highlights a just-generated batch linked from the notification", async () => {
  const batch = "88888888-8888-4888-8888-888888888888";
  const rows = ROWS.map((r) => (r.batch_id === "batch-new" ? { ...r, batch_id: batch } : r));
  const { html } = await renderExplore({ rows }, { searchParams: { batch } });
  assert.equal(html.match(/card-new/g).length, 3);
  assert.equal(html.match(/>New</g).length, 3);
  assert.doesNotMatch((await renderExplore({}, { searchParams: { batch: "javascript:alert(1)" } })).html, /card-new/);
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

test("VoteButtons: guests are asked to sign in and nothing is submitted", () => {
  let submitted = 0;
  const { VoteButtons } = loadModule("app/(lab)/explore/vote-buttons.tsx", { ...ui, "@/app/(lab)/rate/actions": { setVote: async () => { submitted++; return {}; } } });
  const guest = renderToStaticMarkup(React.createElement(VoteButtons, { captionId: CAPTION_ID, initialVote: null, signedIn: false }));
  assert.match(guest, /Funny/);
  assert.match(guest, /Not funny/);
  const voted = renderToStaticMarkup(React.createElement(VoteButtons, { captionId: CAPTION_ID, initialVote: -1, signedIn: true }));
  assert.match(voted, /You voted Not funny/);
  assert.equal(voted.match(/<button/g).length, 2);
  assert.match(voted, /aria-pressed="true"/);
  assert.equal(submitted, 0);
});

test("Rate shows a subtle perspective badge on the card and serves saved selections for changing/undo", async () => {
  const { client, calls } = fakeSupabase({
    userId: USER,
    rows: [{ ...row(CAPTION_ID, "batch-new", IMG_NEW, OTHER, "professor", "dry", "2026-10-11T15:00:00.000+00:00", "Grading this like it is a dissertation."), caption_votes: [] }],
  });
  const page = loadModule("app/(lab)/rate/page.tsx", { ...ui, ...signedIn(client), "./actions": { setVote: async () => ({}) } }).default;
  const html = renderToStaticMarkup(await page());
  assert.match(calls.find((call) => call[0] === "ai_captions" && call[1] === "select")[2], /\bperspective\b/);
  assert.ok(!calls.some((call) => call[1] === "is"));
  assert.match(html, /Professor perspective/);
  assert.ok(html.indexOf("Professor perspective") < html.indexOf("Grading this like it is a dissertation."));
  assert.match(html, /😂 Funny/);
});

test("Create offers a two-option Perspective control that defaults to Student", () => {
  const { CreateStudio } = loadModule("app/(lab)/create/create-studio.tsx", {
    ...ui,
    "../generation-provider": { useGeneration: () => ({ job: null, busy: false, start: () => true, dismiss() {} }) },
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
  for (const text of ["Add a photo", "What should the AI know?", "Tone", "Surprise me", "Generate 3 captions", "up to 10 words"]) assert.ok(html.includes(text), text);
});

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
