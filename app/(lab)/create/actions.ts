"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/auth";
import {
  CAPTION_COUNT,
  MAX_IMAGE_BYTES,
  MEDIA_BUCKET,
  buildImagePath,
  extensionMimeType,
  isImageMimeType,
  isOwnedImagePath,
  parseGenerationOptions,
  sniffImageType,
  validateImageFile,
  type Perspective,
  type Tone,
} from "@/lib/captions/validation";
import { beginGeneration } from "@/lib/captions/runtime";
import { createRuntimeClient } from "@/lib/supabase/runtime";
import { GenerationError, generateCaptions, getGeminiConfig } from "@/lib/captions/gemini";

// Light abuse guard for a shared free-tier key: 10 generations per user per hour.
const HOURLY_GENERATION_LIMIT = 10;
const SIGNED_URL_SECONDS = 60 * 60;

type Client = Awaited<ReturnType<typeof createClient>>;

export type PrepareResult = { status: "ok"; path: string } | { status: "error"; message: string };
export type GenerateResult =
  | {
    status: "ok";
    batchId: string;
    imageUrl: string;
    imageAlt: string;
    perspective: Perspective;
    tone: Tone | null;
    captions: { id: string; caption: string }[];
  }
  | { status: "error"; message: string };

const SESSION_EXPIRED = "Your session expired. Sign in again to create captions.";
const RATE_LIMITED = "You’ve made a lot of captions this hour. Take a break and try again later.";

async function overHourlyLimit(supabase: Client, userId: string) {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_captions")
    .select("id", { count: "exact", head: true })
    .eq("creator_id", userId)
    .gte("created_at", since);
  // Fail closed: if usage can't be checked, don't spend the shared quota.
  return Boolean(error) || (count ?? 0) >= HOURLY_GENERATION_LIMIT * CAPTION_COUNT;
}

async function removeUpload(supabase: Client, path: string) {
  // Storage RLS only allows deleting the owner's own, still-unreferenced upload.
  await supabase.storage.from(MEDIA_BUCKET).remove([path]).catch(() => undefined);
}

/** Step 1: validate photo metadata and hand back a path inside the user's own folder. */
export async function prepareUpload(file: unknown): Promise<PrepareResult> {
  const supabase = await createClient({ writable: true });
  const userId = await getVerifiedUserId(supabase);
  if (!userId) return { status: "error", message: SESSION_EXPIRED };

  const meta = file as { type?: unknown; size?: unknown; name?: unknown } | null;
  if (!meta || typeof meta.type !== "string" || typeof meta.size !== "number" || typeof meta.name !== "string") {
    return { status: "error", message: "Choose a photo first." };
  }
  const invalid = validateImageFile({ type: meta.type, size: meta.size, name: meta.name });
  if (invalid || !isImageMimeType(meta.type)) return { status: "error", message: invalid ?? "Choose a photo first." };
  if (await overHourlyLimit(supabase, userId)) return { status: "error", message: RATE_LIMITED };

  return { status: "ok", path: buildImagePath(userId, crypto.randomUUID(), meta.type) };
}

/** Step 2: verify the uploaded photo, generate 3 captions, and save them together. */
export async function createCaptions(input: unknown): Promise<GenerateResult> {
  const supabase = await createClient({ writable: true });
  const userId = await getVerifiedUserId(supabase);
  if (!userId) return { status: "error", message: SESSION_EXPIRED };

  const { path, context, tone, perspective } = (input ?? {}) as { path?: unknown; context?: unknown; tone?: unknown; perspective?: unknown };
  if (!path) return { status: "error", message: "Choose a photo first." };
  // Only the caller's own folder: rejects other users' files, traversal, and URLs.
  if (!isOwnedImagePath(path, userId)) return { status: "error", message: "That upload couldn’t be found. Try adding the photo again." };

  const options = parseGenerationOptions(context, tone, perspective);
  if ("error" in options) {
    await removeUpload(supabase, path);
    return { status: "error", message: options.error };
  }

  const { data: blob, error: downloadError } = await supabase.storage.from(MEDIA_BUCKET).download(path);
  if (downloadError || !blob) return { status: "error", message: "That upload couldn’t be found. Try adding the photo again." };

  // Server-side checks on the actual bytes, independent of the browser.
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sniffed = sniffImageType(bytes);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES || !sniffed || sniffed !== extensionMimeType(path)) {
    await removeUpload(supabase, path);
    return { status: "error", message: bytes.byteLength > MAX_IMAGE_BYTES ? "That photo is over 5 MB. Try a smaller one." : "That file isn’t a supported photo. Use a JPEG, PNG, or WebP." };
  }

  if (await overHourlyLimit(supabase, userId)) {
    await removeUpload(supabase, path);
    return { status: "error", message: RATE_LIMITED };
  }

  let execution: Awaited<ReturnType<typeof beginGeneration>> | undefined;
  let registering = false;
  let generated: Awaited<ReturnType<typeof generateCaptions>>;
  try {
    const config = getGeminiConfig();
    registering = true;
    execution = await beginGeneration(createRuntimeClient(), userId, "main", { path, mimeType: sniffed, bytes: bytes.byteLength }, options, config.model);
    generated = await generateCaptions({ prompt: execution.prompt, image: bytes, mimeType: sniffed }, { ...config, onAttempt: execution.onAttempt });
  } catch (error) {
    if (execution) {
      try { await execution.finish([], error instanceof GenerationError ? error.code : "unexpected"); }
      catch { return { status: "error", message: "Generation failed and its outcome could not be recorded. Try again later." }; }
    } else if (!registering) { await removeUpload(supabase, path); }
    return { status: "error", message: error instanceof GenerationError ? error.userMessage : "Caption generation failed. Try again." };
  }

  // All three rows go in one INSERT statement, so they are saved together or not at all.
  const batchId = crypto.randomUUID();
  const { data: rows, error: insertError } = await supabase
    .from("ai_captions")
    .insert(generated.captions.map((caption) => ({
      batch_id: batchId,
      creator_id: userId,
      source_image_path: path,
      caption,
      generation_prompt: execution.prompt.persisted,
      user_context: options.context,
      tone: options.tone,
      perspective: options.perspective,
      model: generated.model,
      image_alt: generated.altText,
    })))
    .select("id, caption");
  if (insertError || rows?.length !== CAPTION_COUNT) {
    try { await execution.finish([], "caption_save_failed"); } catch { /* User sees a save error below; no success claimed. */ }
    return { status: "error", message: "Your captions were written but couldn’t be saved. Nothing was posted. Try again." };
  }
  try { await execution.finish(rows.map((row) => row.id)); }
  catch { return { status: "error", message: "Captions were saved, but their telemetry link failed. Refresh before trying again." }; }


  const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  revalidatePath("/rate");
  revalidatePath("/explore");
  revalidatePath("/create");
  const order = new Map(generated.captions.map((caption, index) => [caption, index]));
  return {
    status: "ok",
    batchId,
    imageUrl: signed?.signedUrl ?? "",
    imageAlt: generated.altText,
    perspective: options.perspective,
    tone: options.tone,
    captions: [...rows].sort((a, b) => (order.get(a.caption) ?? 0) - (order.get(b.caption) ?? 0)),
  };
}
