export const CAPTIONS = ["Dollar slice, hundred-dollar regret.", "The pizza is load-bearing at this point.", "Midwest me would never. NYC me already did."];
export const ALT = "A slice of pizza on a paper plate outside a lit shop at night.";
export const USER = "11111111-1111-4111-8111-111111111111";
export const OTHER = "22222222-2222-4222-8222-222222222222";
export const CAPTION_ID = "44444444-4444-4444-8444-444444444444";
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

export function geminiPayload(captions = CAPTIONS, extra = {}) {
  return {
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify({ alt_text: ALT, captions }) }] } }],
    modelVersion: "gemini-3.8-flash",
    ...extra,
  };
}
