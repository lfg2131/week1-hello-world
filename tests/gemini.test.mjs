import assert from "node:assert/strict";
import { test } from "node:test";
import { loadModule } from "./helpers/load-ts.mjs";

// Gemini is always mocked here: no network, no API quota.
const gemini = loadModule("lib/captions/gemini.ts");
const { buildCaptionPrompt } = loadModule("lib/captions/prompt.ts");

import { ALT, CAPTIONS, geminiPayload } from "./helpers/fixtures.mjs";

const prompt = buildCaptionPrompt({ context: "2am pizza", tone: "dry", perspective: "student" }, { path: "u/x.jpg", mimeType: "image/jpeg", bytes: 3 });
const input = { prompt, image: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: "image/jpeg" };
const config = (fetchImpl, extra = {}) => ({ apiKey: "test-key-not-real", model: "gemini-3.8-flash", fetchImpl, retryDelayMs: 1, ...extra });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("parses exactly 3 trimmed captions and alt text from structured output", () => {
  const parsed = gemini.parseCaptionResponse(geminiPayload([`  "${CAPTIONS[0]}" `, CAPTIONS[1], CAPTIONS[2]]));
  assert.deepEqual([...parsed.captions], CAPTIONS);
  assert.equal(parsed.altText, ALT);
});

test("ignores thought parts and joins text parts", () => {
  const text = JSON.stringify({ alt_text: ALT, captions: CAPTIONS });
  const payload = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking...", thought: true }, { text: text.slice(0, 20) }, { text: text.slice(20) }] } }] };
  assert.deepEqual([...gemini.parseCaptionResponse(payload).captions], CAPTIONS);
});

for (const [label, payload, code] of [
  ["two captions", geminiPayload(CAPTIONS.slice(0, 2)), "wrong_count"],
  ["four captions", geminiPayload([...CAPTIONS, "extra"]), "wrong_count"],
  ["non-string caption", geminiPayload([1, 2, 3]), "invalid_caption"],
  ["empty caption", geminiPayload(["", CAPTIONS[1], CAPTIONS[2]]), "invalid_caption"],
  ["overlong caption", geminiPayload(["x".repeat(201), CAPTIONS[1], CAPTIONS[2]]), "invalid_caption"],
  ["duplicate captions", geminiPayload([CAPTIONS[0], CAPTIONS[0].toUpperCase(), CAPTIONS[2]]), "duplicate_captions"],
  ["self-harm caption", geminiPayload(["If I jump will the city catch me", CAPTIONS[1], CAPTIONS[2]]), "unsafe_output"],
  ["kms caption", geminiPayload(["finals week, kms", CAPTIONS[1], CAPTIONS[2]]), "unsafe_output"],
  ["missing alt text", { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ captions: CAPTIONS }) }] } }] }, "invalid_alt_text"],
  ["invalid JSON", { candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Here are captions: 1." }] } }] }, "invalid_json"],
  ["no candidates", { candidates: [] }, "no_candidate"],
  ["prompt blocked", { promptFeedback: { blockReason: "SAFETY" } }, "blocked"],
  ["safety finish", { candidates: [{ finishReason: "SAFETY" }] }, "finish_safety"],
  ["truncated output", { candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{\"captions\": [" }] } }] }, "finish_max_tokens"],
]) test(`rejects malformed or unsafe output (never partially parsed): ${label}`, () => {
  assert.throws(() => gemini.parseCaptionResponse(payload), (error) => error.code === code && typeof error.userMessage === "string");
});

test("sends key in a header (never the URL), the image inline, and a JSON schema", async () => {
  let request;
  const result = await gemini.generateCaptions(input, config(async (url, init) => { request = { url, init }; return json(geminiPayload()); }));
  assert.equal(request.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
  assert.doesNotMatch(request.url, /key=/);
  assert.equal(request.init.headers["x-goog-api-key"], "test-key-not-real");
  const body = JSON.parse(request.init.body);
  assert.equal(body.systemInstruction.parts[0].text, prompt.systemInstruction);
  assert.equal(body.contents[0].parts[0].inlineData.mimeType, "image/jpeg");
  assert.equal(body.contents[0].parts[0].inlineData.data, "/9j/");
  assert.equal(body.contents[0].parts[1].text, prompt.userPrompt);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseJsonSchema.required, ["alt_text", "captions"]);
  assert.equal(result.model, "gemini-3.8-flash");
  assert.equal(result.captions.length, 3);
});

test("retries once on transient 503 and on rejected output, then succeeds", async () => {
  for (const first of [json({ error: {} }, 503), json(geminiPayload(["kms", CAPTIONS[1], CAPTIONS[2]]))]) {
    let calls = 0;
    const responses = [first, json(geminiPayload())];
    const result = await gemini.generateCaptions(input, config(async () => { calls++; return responses.shift(); }));
    assert.equal(calls, 2);
    assert.equal(result.captions.length, 3);
  }
});

test("does not retry client errors and reports quota errors clearly", async () => {
  let calls = 0;
  await assert.rejects(gemini.generateCaptions(input, config(async () => { calls++; return json({}, 400); })), (e) => e.code === "http_400");
  assert.equal(calls, 1);
  await assert.rejects(gemini.generateCaptions(input, config(async () => json({}, 429))), (e) => e.code === "rate_limited" && /busy/.test(e.userMessage));
});

test("a persistently overloaded model (503) is reported as busy, not as a problem with the photo", async () => {
  let calls = 0;
  await assert.rejects(
    gemini.generateCaptions(input, config(async () => { calls++; return json({ error: { status: "UNAVAILABLE" } }, 503); })),
    (e) => e.code === "http_503" && /busy/.test(e.userMessage) && !/photo/.test(e.userMessage),
  );
  assert.equal(calls, 2);
  await assert.rejects(gemini.generateCaptions(input, config(async () => json({}, 400))), (e) => /couldn’t caption this photo/.test(e.userMessage));
});

test("gives up after the retry budget on persistent failure", async () => {
  let calls = 0;
  await assert.rejects(gemini.generateCaptions(input, config(async () => { calls++; throw new TypeError("fetch failed"); })), (e) => e.code === "network");
  assert.equal(calls, 2);
});

test("config requires a server-side key and a sane model id", () => {
  assert.throws(() => gemini.getGeminiConfig({}), (e) => e.code === "missing_api_key");
  assert.throws(() => gemini.getGeminiConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "../../evil" }), (e) => e.code === "invalid_model");
  assert.deepEqual({ ...gemini.getGeminiConfig({ GEMINI_API_KEY: "k" }) }, { apiKey: "k", model: "gemini-3.8-flash" });
  assert.equal(gemini.getGeminiConfig({ GEMINI_API_KEY: "k", GEMINI_MODEL: "gemini-3.5-flash" }).model, "gemini-3.5-flash");
});

// ---- Week 6: ten-word captions -------------------------------------------
const ELEVEN = "one two three four five six seven eight nine ten eleven";
const TEN = "one two three four five six seven eight nine ten";

test("accepts captions of exactly ten words and rejects any caption over ten", () => {
  assert.equal(gemini.parseCaptionResponse(geminiPayload([TEN, CAPTIONS[1], CAPTIONS[2]])).captions[0], TEN);
  assert.throws(() => gemini.parseCaptionResponse(geminiPayload([CAPTIONS[0], ELEVEN, CAPTIONS[2]])), (e) => e.code === "too_many_words" && /10 words/.test(e.userMessage));
  // Extra whitespace does not hide extra words.
  assert.throws(() => gemini.parseCaptionResponse(geminiPayload([ELEVEN.replaceAll(" ", "  \n"), CAPTIONS[1], CAPTIONS[2]])), (e) => e.code === "too_many_words");
});

test("an over-long batch is regenerated once (bounded), never saved", async () => {
  let calls = 0;
  const responses = [json(geminiPayload([ELEVEN, CAPTIONS[1], CAPTIONS[2]])), json(geminiPayload())];
  const result = await gemini.generateCaptions(input, config(async () => { calls++; return responses.shift(); }));
  assert.equal(calls, 2);
  assert.deepEqual([...result.captions], CAPTIONS);

  calls = 0;
  await assert.rejects(
    gemini.generateCaptions(input, config(async () => { calls++; return json(geminiPayload([ELEVEN, CAPTIONS[1], CAPTIONS[2]])); })),
    (e) => e.code === "too_many_words",
  );
  assert.equal(calls, 2);
});

test("the prompt and the response schema both state the ten-word limit", () => {
  assert.match(prompt.systemInstruction, /at most 10 words/);
  assert.match(prompt.userPrompt, /^Write 3 captions for the attached photo, each at most 10 words\./);
  assert.ok(gemini.CAPTION_SCHEMA.properties.captions.items.maxLength <= 100);
});
