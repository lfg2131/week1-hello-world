import assert from "node:assert/strict";
import { test } from "node:test";

// Values created inside the vm sandbox have foreign prototypes; compare as plain data.
const plain = (value) => JSON.parse(JSON.stringify(value));
import { loadModule } from "./helpers/load-ts.mjs";
import { fakeSupabase, actionStubs } from "./helpers/fake-supabase.mjs";
import { CAPTION_ID, CAPTIONS, OTHER, USER, geminiPayload } from "./helpers/fixtures.mjs";

const PATH = `${USER}/55555555-5555-4555-8555-555555555555.jpg`;
const env = { GEMINI_API_KEY: "test-key-not-real", GEMINI_MODEL: "gemini-3.8-flash" };
const okFetch = async () => new Response(JSON.stringify(geminiPayload()), { status: 200 });

function createActions(options = {}, fetchImpl = okFetch) {
  const { client, calls } = fakeSupabase({ userId: USER, ...options });
  const { stubs, revalidated } = actionStubs(client);
  const requests = [];
  const fetch = async (...args) => { requests.push(args); return fetchImpl(...args); };
  const actions = loadModule("app/(lab)/create/actions.ts", stubs, { fetch, env });
  // What actually went over the wire to (mocked) Gemini.
  const sent = (index = 0) => JSON.parse(requests[index][1].body);
  return { actions, calls, revalidated, geminiCalls: () => requests.length, sent };
}
const inserts = (calls, table) => calls.filter((c) => c[0] === table && c[1] === "insert");
const removed = (calls) => calls.some((c) => c[0] === "storage" && c[1] === "remove");

// ---- Generation --------------------------------------------------------
test("generation rejects unauthenticated requests before touching storage or Gemini", async () => {
  const t = createActions({ userId: null });
  assert.equal((await t.actions.createCaptions({ path: PATH })).status, "error");
  assert.equal((await t.actions.prepareUpload({ type: "image/jpeg", size: 10, name: "a.jpg" })).status, "error");
  assert.equal(t.geminiCalls(), 0);
  assert.ok(!t.calls.some((c) => c[0] === "storage"));
});

test("prepareUpload builds the path from the verified user, never from input", async () => {
  const t = createActions();
  const result = await t.actions.prepareUpload({ type: "image/png", size: 100, name: "a.png", userId: OTHER, path: `${OTHER}/x.png` });
  assert.equal(result.status, "ok");
  assert.match(result.path, new RegExp(`^${USER}/[0-9a-f-]{36}\\.png$`));
});

for (const [label, file, pattern] of [
  ["missing image", null, /Choose a photo/],
  ["unsupported MIME", { type: "image/gif", size: 10, name: "a.gif" }, /JPEG, PNG, or WebP/],
  ["oversized image", { type: "image/jpeg", size: 5 * 1024 * 1024 + 1, name: "a.jpg" }, /over 5 MB/],
]) test(`prepareUpload rejects ${label}`, async () => {
  const result = await createActions().actions.prepareUpload(file);
  assert.equal(result.status, "error");
  assert.match(result.message, pattern);
});

test("generation rejects a missing image and paths outside the user's folder", async () => {
  const t = createActions();
  assert.match((await t.actions.createCaptions({})).message, /Choose a photo/);
  for (const path of [PATH.replace(USER, OTHER), `${USER}/../x.jpg`, "https://evil.example/a.jpg"]) {
    assert.equal((await t.actions.createCaptions({ path })).status, "error");
  }
  assert.equal(t.geminiCalls(), 0);
});

test("generation re-checks real bytes server-side and cleans up disguised or oversized uploads", async () => {
  for (const blob of [new Blob(["<svg/>"]), new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]), new Blob([new Uint8Array(5 * 1024 * 1024 + 1).fill(0xff)])]) {
    const t = createActions({ download: { data: blob, error: null } });
    assert.equal((await t.actions.createCaptions({ path: PATH })).status, "error");
    assert.ok(removed(t.calls));
    assert.equal(t.geminiCalls(), 0);
  }
});

test("generation validates context and tone", async () => {
  for (const input of [{ path: PATH, tone: "mean" }, { path: PATH, context: "x".repeat(201) }]) {
    const t = createActions();
    assert.equal((await t.actions.createCaptions(input)).status, "error");
    assert.equal(t.geminiCalls(), 0);
    assert.ok(removed(t.calls));
  }
});

test("successful generation inserts 3 rows with auth-derived creator, shared batch, prompt, model, context, tone", async () => {
  const t = createActions();
  const result = await t.actions.createCaptions({ path: PATH, context: "2am pizza", tone: "dry", creator_id: OTHER });
  assert.equal(result.status, "ok");
  assert.equal(result.captions.length, 3);
  const [insert] = inserts(t.calls, "ai_captions");
  const rows = insert[2];
  assert.equal(rows.length, 3);
  assert.deepEqual(plain(rows.map((r) => r.caption)), CAPTIONS);
  assert.equal(new Set(rows.map((r) => r.batch_id)).size, 1);
  for (const row of rows) {
    assert.equal(row.creator_id, USER);
    assert.equal(row.source_image_path, PATH);
    assert.equal(row.model, "gemini-3.8-flash");
    assert.equal(row.user_context, "2am pizza");
    assert.equal(row.tone, "dry");
    assert.match(row.generation_prompt, /\[system instruction\][\s\S]*\[user\][\s\S]*2am pizza/);
    assert.ok(row.image_alt);
    assert.equal(row.id, undefined);
  }
  assert.ok(!removed(t.calls));
  assert.ok(t.revalidated.includes("/rate"));
});

for (const [perspective, label] of [["student", "Student"], ["professor", "Professor"]]) {
  test(`${perspective} generation sends the ${perspective} perspective to Gemini and saves it on all 3 rows`, async () => {
    const t = createActions();
    const result = await t.actions.createCaptions({ path: PATH, context: "2am pizza", tone: "dry", perspective });
    assert.equal(result.status, "ok");
    assert.equal(result.perspective, perspective);
    assert.equal(result.captions.length, 3);
    assert.equal(t.geminiCalls(), 1);

    const body = t.sent();
    const userText = body.contents[0].parts[1].text;
    assert.match(userText, new RegExp(`^Perspective: ${label}: write as a college ${perspective === "student" ? "student" : "professor or instructor"}`, "m"));

    const [insert] = inserts(t.calls, "ai_captions");
    const rows = insert[2];
    assert.equal(rows.length, 3);
    for (const row of rows) {
      assert.equal(row.perspective, perspective);
      assert.match(row.generation_prompt, new RegExp(`\\nPerspective: ${label}: `));
      // The stored prompt is exactly what Gemini received.
      assert.ok(row.generation_prompt.includes(body.systemInstruction.parts[0].text));
      assert.ok(row.generation_prompt.includes(userText));
      assert.equal(row.creator_id, USER);
      assert.equal(row.tone, "dry");
    }
    assert.ok(t.revalidated.includes("/explore"));
  });
}

test("perspective changes the prompt Gemini receives (same photo, context, and tone)", async () => {
  const texts = {};
  for (const perspective of ["student", "professor"]) {
    const t = createActions();
    await t.actions.createCaptions({ path: PATH, context: "2am pizza", tone: "dry", perspective });
    texts[perspective] = t.sent().contents[0].parts[1].text;
  }
  assert.notEqual(texts.student, texts.professor);
  assert.equal(texts.student.replace(/^Perspective: .*$/m, ""), texts.professor.replace(/^Perspective: .*$/m, ""));
});

test("perspective defaults to student when the request omits it", async () => {
  const t = createActions();
  const result = await t.actions.createCaptions({ path: PATH });
  assert.equal(result.perspective, "student");
  const rows = inserts(t.calls, "ai_captions")[0][2];
  assert.deepEqual(plain(rows.map((row) => row.perspective)), ["student", "student", "student"]);
  assert.match(t.sent().contents[0].parts[1].text, /^Perspective: Student: /m);
});

test("invalid perspective is rejected server-side before Gemini, nothing is saved, and the upload is removed", async () => {
  for (const perspective of ["teacher", "Professor", "", "admin'; drop table ai_captions;--", 1, {}, ["professor"]]) {
    const t = createActions();
    const result = await t.actions.createCaptions({ path: PATH, perspective });
    assert.equal(result.status, "error", JSON.stringify(perspective));
    assert.match(result.message, /Student or Professor/);
    assert.equal(t.geminiCalls(), 0);
    assert.equal(inserts(t.calls, "ai_captions").length, 0);
    assert.ok(removed(t.calls));
  }
});

test("failed generation does not pretend success, inserts nothing, and retains the logged source", async () => {
  const t = createActions({}, async () => new Response("{}", { status: 400 }));
  const result = await t.actions.createCaptions({ path: PATH });
  assert.equal(result.status, "error");
  assert.equal(inserts(t.calls, "ai_captions").length, 0);
  assert.ok(!removed(t.calls));
});

test("database insert failure is reported honestly and retains the logged source", async () => {
  const t = createActions({ insertError: { code: "42501", message: "rls" } });
  const result = await t.actions.createCaptions({ path: PATH });
  assert.equal(result.status, "error");
  assert.match(result.message, /couldn’t be saved/);
  assert.ok(!removed(t.calls));
});

test("hourly generation limit fails closed", async () => {
  for (const options of [{ hourlyCount: 30 }, { countError: { message: "x" } }]) {
    const t = createActions(options);
    assert.equal((await t.actions.createCaptions({ path: PATH })).status, "error");
    assert.equal(t.geminiCalls(), 0);
  }
});

// ---- Desired-state voting: database RLS/atomic behavior also tested live. ----
function voteActions(options={}) {
 const {client,calls}=fakeSupabase({userId:USER,...options});
 return {setVote:loadModule("app/(lab)/rate/actions.ts",actionStubs(client).stubs).setVote,calls};
}
test("anonymous votes are rejected before the invoker RPC",async()=>{
 const t=voteActions({userId:null});assert.equal((await t.setVote(CAPTION_ID,1)).status,"error");assert.ok(!t.calls.some(c=>c[0]==="rpc"));
});
test("only UUID captions and exactly 1, -1, or null are accepted",async()=>{
 const t=voteActions();for(const [id,vote] of [[CAPTION_ID,0],[CAPTION_ID,2],[CAPTION_ID,"1"],[CAPTION_ID,undefined],["bad",1]])assert.equal((await t.setVote(id,vote)).status,"error");
 assert.ok(!t.calls.some(c=>c[0]==="rpc"));
});
for(const vote of [1,-1,null])test(`desired vote ${vote} is explicit and retry-safe`,async()=>{
 const t=voteActions();for(let i=0;i<2;i++)assert.deepEqual(plain(await t.setVote(CAPTION_ID,vote)),{status:"saved",captionId:CAPTION_ID,vote});
 const calls=t.calls.filter(c=>c[0]==="rpc");assert.equal(calls.length,2);assert.deepEqual(plain(calls[0]),["rpc","caption_lab_set_vote",{p_caption_id:CAPTION_ID,p_vote:vote}]);assert.deepEqual(plain(calls[0]),plain(calls[1]));assert.ok(!JSON.stringify(calls).includes(USER),"database derives user identity");
});
test("database errors are honest and never claim a saved selection",async()=>{
 for(const code of ["23503","42501","23505"]){const t=voteActions({voteError:{code}});assert.equal((await t.setVote(CAPTION_ID,1)).status,"error");}
});
