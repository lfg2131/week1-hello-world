import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import { loadModule } from "./helpers/load-ts.mjs";

// Week 6: background generation. The provider lives in the (lab) layout and
// calls a Route Handler with fetch(), so leaving Create never cancels it.
const require = createRequire(import.meta.url);
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const BATCH = "88888888-8888-4888-8888-888888888888";
const PATH = "11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555.jpg";
const OK = { status: "ok", batchId: BATCH, imageUrl: "https://signed.example/x", imageAlt: "alt", perspective: "student", tone: null, captions: [{ id: "c1", caption: "a" }, { id: "c2", caption: "b" }, { id: "c3", caption: "c" }] };
const ui = {
  react: React,
  "react/jsx-runtime": require("react/jsx-runtime"),
  "next/link": { __esModule: true, default: ({ href, className, children }) => React.createElement("a", { href, className }, children) },
};

function loadProvider({ fetchImpl, prepare = async () => ({ status: "ok", path: PATH }), upload = async () => ({ error: null }) } = {}) {
  const log = { prepare: 0, upload: 0, fetch: [], refresh: 0 };
  const mod = loadModule("app/(lab)/generation-provider.tsx", {
    ...ui,
    "next/navigation": { useRouter: () => ({ refresh: () => { log.refresh++; } }) },
    "@/lib/supabase/client": { createClient: () => ({ storage: { from: () => ({ upload: async (...args) => { log.upload++; return upload(...args); } }) } }) },
    "./create/actions": { prepareUpload: async (...args) => { log.prepare++; return prepare(...args); } },
  }, {
    fetch: async (url, init) => { log.fetch.push([url, init]); return fetchImpl(url, init); },
    window: { addEventListener() {}, removeEventListener() {} },
  });
  return { mod, log };
}

const toast = (mod, job) => renderToStaticMarkup(React.createElement(mod.GenerationToast, { job, onDismiss() {} }));

test("notification: in progress, ready (with a link to the captions), and failed", () => {
  const { mod } = loadProvider();
  assert.match(toast(mod, null), /^<div aria-live="polite" role="status" class="[^"]*fixed[^"]*bottom-4[^"]*"><\/div>$/);
  for (const status of ["uploading", "generating"]) assert.match(toast(mod, { status, perspective: "professor" }), /Generating your captions…/);
  assert.match(toast(mod, { status: "generating", perspective: "professor" }), /Writing 3 professor takes/);
  const ready = toast(mod, { status: "success", result: OK });
  assert.match(ready, /Your captions are ready!/);
  assert.match(ready, new RegExp(`href="/explore\\?batch=${BATCH}#caption-c1"`));
  assert.match(ready, /View your captions/);
  const failed = toast(mod, { status: "error", message: "The AI is busy right now. Wait a minute and try again." });
  assert.match(failed, /Couldn’t make your captions/);
  assert.match(failed, /The AI is busy right now/);
  // Bottom-right placement on larger screens.
  assert.match(failed, /sm:right-6 sm:bottom-6/);
});

// Captures the provider's context during a server render, then drives it.
function probe(mod) {
  let ctx;
  function Probe() { ctx = mod.useGeneration(); return null; }
  renderToStaticMarkup(React.createElement(mod.GenerationProvider, null, React.createElement(Probe)));
  return ctx;
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 10));
const file = { type: "image/jpeg", size: 10, name: "a.jpg" };

test("generation: uploads, then POSTs JSON to the Route Handler (not a Server Action); duplicate starts are refused", async () => {
  const { mod, log } = loadProvider({ fetchImpl: async () => new Response(JSON.stringify(OK), { status: 200 }) });
  const ctx = probe(mod);
  assert.equal(ctx.start({ file, context: "2am pizza", tone: "dry", perspective: "professor" }), true);
  assert.equal(ctx.start({ file, context: "again", tone: null, perspective: "student" }), false, "second click while running");
  await flush();
  assert.equal(log.prepare, 1);
  assert.equal(log.upload, 1);
  assert.equal(log.fetch.length, 1);
  const [url, init] = log.fetch[0];
  assert.equal(url, "/api/captions");
  assert.equal(init.method, "POST");
  assert.equal(init.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(init.body), { path: PATH, context: "2am pizza", tone: "dry", perspective: "professor" });
  assert.equal(log.refresh, 1, "Explore refreshes once the captions exist");
  // Once finished, a new generation may start.
  assert.equal(ctx.start({ file, context: "", tone: null, perspective: "student" }), true);
  await flush();
  assert.equal(log.fetch.length, 2);
});

test("generation: failures release the lock and never call Gemini twice", async () => {
  const { mod, log } = loadProvider({ prepare: async () => ({ status: "error", message: "Too many" }), fetchImpl: async () => { throw new Error("no"); } });
  const ctx = probe(mod);
  assert.equal(ctx.start({ file, context: "", tone: null, perspective: "student" }), true);
  await flush();
  assert.equal(log.fetch.length, 0);
  assert.equal(ctx.start({ file, context: "", tone: null, perspective: "student" }), true);
  await flush();

  const broken = loadProvider({ fetchImpl: async () => new Response("<html>gateway timeout</html>", { status: 504 }) });
  const ctx2 = probe(broken.mod);
  ctx2.start({ file, context: "", tone: null, perspective: "student" });
  await flush();
  assert.equal(broken.log.fetch.length, 1);
  assert.equal(broken.log.refresh, 0);
});

// ---- Route Handler -------------------------------------------------------
function route(result = OK) {
  const received = [];
  const { POST } = loadModule("app/api/captions/route.ts", {
    "@/app/(lab)/create/actions": { createCaptions: async (body) => { received.push(body); return result; } },
  });
  return { POST, received };
}
const post = (body, type = "application/json") => new Request("https://app.example/api/captions", { method: "POST", headers: { "content-type": type }, body });

test("route: passes JSON to the verified createCaptions action and returns its result, uncached", async () => {
  const { POST, received } = route();
  const response = await POST(post(JSON.stringify({ path: PATH, perspective: "student" })));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual((await response.json()).batchId, BATCH);
  assert.deepEqual(received, [{ path: PATH, perspective: "student" }]);
});

test("route: rejects non-JSON (cross-site form) and malformed bodies before doing any work", async () => {
  const { POST, received } = route();
  assert.equal((await POST(post("path=x", "application/x-www-form-urlencoded"))).status, 415);
  assert.equal((await POST(post("path=x", "text/plain"))).status, 415);
  assert.equal((await POST(post("{nope"))).status, 400);
  assert.equal(received.length, 0);
});

test("route: an expired session is a 401, other failures a 422", async () => {
  assert.equal((await route({ status: "error", message: "Your session expired. Sign in again to create captions." }).POST(post("{}"))).status, 401);
  assert.equal((await route({ status: "error", message: "The AI is busy right now." }).POST(post("{}"))).status, 422);
});

test("Create shows the shared job's progress and result, and offers Explore while waiting", () => {
  const render = (job) => {
    const { CreateStudio } = loadModule("app/(lab)/create/create-studio.tsx", {
      ...ui,
      "next/image": { __esModule: true, default: ({ src, alt }) => React.createElement("img", { src, alt }) },
      "../generation-provider": { useGeneration: () => ({ job, busy: job?.status === "generating", start: () => true, dismiss() {} }) },
    });
    return renderToStaticMarkup(React.createElement(CreateStudio, { vibe: { title: "t", hint: "h" } }));
  };
  assert.match(render({ status: "success", result: OK }), /Three takes\. Campus decides\./);
  assert.match(render({ status: "success", result: OK }), new RegExp(`href="/explore\\?batch=${BATCH}#caption-c1"`));
  assert.match(render({ status: "error", message: "The AI is busy right now." }), /role="alert"[^>]*>The AI is busy right now\./);
  assert.match(render({ status: "generating", perspective: "student" }), /Writing captions…/);
});
