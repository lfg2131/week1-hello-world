import { CAPTION_COUNT, MAX_CAPTION_LENGTH, type ImageMimeType } from "./validation";
import type { CaptionPrompt } from "./prompt";

// Gemini via the stable REST generateContent endpoint with structured JSON
// output. Server-only: the API key is read from a non-public env var.

export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export const CAPTION_SCHEMA = {
  type: "object",
  properties: {
    alt_text: { type: "string", maxLength: 200 },
    captions: {
      type: "array",
      minItems: CAPTION_COUNT,
      maxItems: CAPTION_COUNT,
      items: { type: "string", maxLength: 160 },
    },
  },
  required: ["alt_text", "captions"],
} as const;

export class GenerationError extends Error {
  readonly userMessage: string;
  readonly code: string;
  constructor(userMessage: string, code: string) {
    super(code);
    this.name = "GenerationError";
    this.userMessage = userMessage;
    this.code = code;
  }
}

export function getGeminiConfig(env: Record<string, string | undefined> = process.env) {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
  if (!apiKey) throw new GenerationError("Caption generation isn’t configured right now. Try again later.", "missing_api_key");
  if (!/^[a-z0-9.-]{1,100}$/.test(model)) throw new GenerationError("Caption generation isn’t configured right now. Try again later.", "invalid_model");
  return { apiKey, model };
}

// Defense in depth behind the system prompt: a caption matching these is
// discarded (and regenerated once) rather than shown or saved.
const UNSAFE_CAPTION_PATTERNS = [
  /\b(kms|kys)\b/i,
  /\bkill (my|your|him|her|them)sel(f|ves)\b/i,
  /\bsuicid/i,
  /\bself[- ]?harm/i,
  /\b(want|wanna|going|gonna) (to )?die\b/i,
  /\bif i jump\b|\bjump(ing)? off\b/i,
  /\bend (it all|my life)\b/i,
  /\b(slit|cut) (my|your) (wrists?|throat)\b/i,
];

export function isUnsafeCaption(caption: string) {
  return UNSAFE_CAPTION_PATTERNS.some((pattern) => pattern.test(caption));
}

/** Validate a raw generateContent response: exactly 3 clean captions plus alt text, or throw. */
export function parseCaptionResponse(payload: unknown): { captions: string[]; altText: string } {
  const data = payload as {
    promptFeedback?: { blockReason?: string };
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  if (data?.promptFeedback?.blockReason) {
    throw new GenerationError("This photo can’t be captioned here. Try a different one.", "blocked");
  }
  const candidate = data?.candidates?.[0];
  if (!candidate) throw new GenerationError("The AI didn’t return captions. Try again.", "no_candidate");
  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    const safety = ["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "IMAGE_SAFETY"].includes(candidate.finishReason);
    throw new GenerationError(
      safety ? "This photo can’t be captioned here. Try a different one." : "The AI got cut off. Try again.",
      `finish_${candidate.finishReason.toLowerCase()}`,
    );
  }
  const text = (candidate.content?.parts ?? []).filter((part) => !part.thought && typeof part.text === "string").map((part) => part.text).join("");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GenerationError("The AI returned something unreadable. Try again.", "invalid_json");
  }
  const { captions, alt_text: altText } = (parsed ?? {}) as { captions?: unknown; alt_text?: unknown };
  if (!Array.isArray(captions) || captions.length !== CAPTION_COUNT) {
    throw new GenerationError("The AI didn’t return 3 captions. Try again.", "wrong_count");
  }
  const cleaned = captions.map((caption) => {
    if (typeof caption !== "string") throw new GenerationError("The AI returned something unreadable. Try again.", "invalid_caption");
    const value = caption.replace(/\s+/g, " ").trim().replace(/^["“](.*)["”]$/, "$1").trim();
    if (!value || value.length > MAX_CAPTION_LENGTH) throw new GenerationError("The AI returned an unusable caption. Try again.", "invalid_caption");
    return value;
  });
  if (cleaned.some(isUnsafeCaption)) {
    throw new GenerationError("The AI wrote something we won’t post. Try again.", "unsafe_output");
  }
  if (new Set(cleaned.map((caption) => caption.toLowerCase())).size !== CAPTION_COUNT) {
    throw new GenerationError("The AI repeated itself. Try again.", "duplicate_captions");
  }
  const alt = typeof altText === "string" ? altText.replace(/\s+/g, " ").trim() : "";
  if (!alt || alt.length > 300) throw new GenerationError("The AI returned something unreadable. Try again.", "invalid_alt_text");
  return { captions: cleaned, altText: alt };
}

const RETRYABLE = new Set(["network", "http_500", "http_502", "http_503", "http_504", "unsafe_output", "duplicate_captions"]);

type GenerateInput = { prompt: CaptionPrompt; image: Uint8Array; mimeType: ImageMimeType };
type GenerateConfig = { apiKey: string; model: string; fetchImpl?: typeof fetch; timeoutMs?: number; attempts?: number; retryDelayMs?: number };

/** One model call, retried once for transient failures or rejected output. */
export async function generateCaptions(input: GenerateInput, config: GenerateConfig) {
  const attempts = config.attempts ?? 2;
  for (let attempt = 1; ; attempt++) {
    try {
      return await requestCaptions(input, config);
    } catch (error) {
      if (attempt >= attempts || !(error instanceof GenerationError) || !RETRYABLE.has(error.code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, config.retryDelayMs ?? 800));
    }
  }
}

async function requestCaptions(
  input: GenerateInput,
  { apiKey, model, fetchImpl = fetch, timeoutMs = 25_000 }: GenerateConfig,
) {
  let response: Response;
  try {
    response = await fetchImpl(`${ENDPOINT}/${model}:generateContent`, {
      method: "POST",
      // Header auth keeps the key out of URLs and request logs.
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: input.prompt.systemInstruction }] },
        contents: [{
          role: "user",
          parts: [
            { inlineData: { mimeType: input.mimeType, data: Buffer.from(input.image).toString("base64") } },
            { text: input.prompt.userPrompt },
          ],
        }],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: CAPTION_SCHEMA,
          temperature: 1,
          thinkingConfig: { thinkingLevel: "low" },
        },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new GenerationError("The AI took too long or couldn’t be reached. Try again.", "network");
  }
  if (response.status === 429) throw new GenerationError("The AI is busy right now. Wait a minute and try again.", "rate_limited");
  if (!response.ok) throw new GenerationError("The AI couldn’t caption this photo. Try again.", `http_${response.status}`);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new GenerationError("The AI returned something unreadable. Try again.", "invalid_body");
  }
  return { ...parseCaptionResponse(payload), model };
}
