import { createCaptions } from "@/app/(lab)/create/actions";

// Caption generation runs as a Route Handler called with fetch() from the
// layout's GenerationProvider. Unlike a Server Action (dispatched one at a
// time per client), it never blocks voting or navigation while Gemini works.
// Upload verification plus up to two 25s model attempts; keep headroom under the limit.
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  // JSON only: a cross-site form cannot send this without a CORS preflight,
  // which this route never allows.
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ status: "error", message: "Unsupported request." }, { status: 415, headers: NO_STORE });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "error", message: "Unsupported request." }, { status: 400, headers: NO_STORE });
  }
  // createCaptions verifies the session itself and derives the creator from it.
  const result = await createCaptions(body);
  const status = result.status === "ok" ? 200 : result.message.startsWith("Your session expired") ? 401 : 422;
  return Response.json(result, { status, headers: NO_STORE });
}
