import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCaptionPrompt } from "./prompt";
import type { GenerationOptions, ImageMimeType } from "./validation";
import { GENERATION_SETTINGS, type AttemptRecord } from "./gemini";

// Only server generation actions call this module, after verified authentication.
// Fixed Caption Lab operations; it is never a browser-callable mutation API.
export async function beginGeneration(db: SupabaseClient, userId: string, application: "main" | "admin", image: { path: string; mimeType: ImageMimeType; bytes: number }, options: GenerationOptions, model: string) {
  const { data: mixtures, error } = await db.from("caption_lab_mix").select("chain_id, enabled, weight, caption_lab_chains!inner(id, application, enabled)").eq("enabled", true);
  if (error) throw new Error("Generation configuration could not be loaded.");
  type Mix = { chain_id: string; enabled: boolean; weight: number; caption_lab_chains: { application: string; enabled: boolean } };
  const eligible = (mixtures as unknown as Mix[] ?? []).filter((row) => row.caption_lab_chains.application === application && row.caption_lab_chains.enabled);
  const total = eligible.reduce((sum, row) => sum + row.weight, 0);
  let draw = Math.random() * total;
  const choice = eligible.find((row) => (draw -= row.weight) < 0);
  if (!choice) throw new Error("No enabled generation chain for this application.");
  const { data: steps, error: stepError } = await db.from("caption_lab_steps").select("id, model_id, position, system_template, user_template, caption_lab_models!inner(model_key, active, caption_lab_providers!inner(slug, active))").eq("chain_id", choice.chain_id).order("position");
  type Step = { id: string; model_id: string; system_template: string; user_template: string; caption_lab_models: { model_key: string; active: boolean; caption_lab_providers: { slug: string; active: boolean } } };
  const step = (steps as unknown as Step[] ?? [])[0];
  if (stepError || steps?.length !== 1 || !step || !step.caption_lab_models.active || !step.caption_lab_models.caption_lab_providers.active || step.caption_lab_models.model_key !== model || step.caption_lab_models.caption_lab_providers.slug !== "google-gemini") throw new Error("This chain must use the configured active Gemini model and one step.");
  const original = buildCaptionPrompt(options, image);
  const lines = original.userPrompt.split("\n");
  const slots: Record<string, string> = { perspective: lines[1], tone: lines[2], context: lines.slice(3).join("\n") };
  const userPrompt = step.user_template.replace(/\{\{(perspective|tone|context)\}\}/g, (_, key: string) => slots[key]);
  const prompt = { systemInstruction: step.system_template, userPrompt, persisted: `[system instruction]\n${step.system_template}\n\n[user]\n${userPrompt}\n\n[image]\ninline ${image.mimeType}, ${image.bytes} bytes, from week4-media/${image.path}` };
  const { data: registry, error: imageError } = await db.from("caption_lab_images").upsert({ storage_path: image.path, owner_id: userId, mime_type: image.mimeType, size_bytes: image.bytes }, { onConflict: "storage_path" }).select("id, state").single();
  if (imageError || !registry || registry.state !== "available") throw new Error("Image metadata could not be saved.");
  const { data: request, error: requestError } = await db.from("caption_lab_requests").insert({ requester_id: userId, image_id: registry.id, chain_id: choice.chain_id, step_id: step.id, model_id: step.model_id, application, perspective: options.perspective, tone: options.tone, prompt_snapshot: { systemInstruction: prompt.systemInstruction, userPrompt: prompt.userPrompt, image: { mimeType: image.mimeType, bytes: image.bytes, storagePath: image.path }, provider: "google-gemini", model, generationConfig: GENERATION_SETTINGS, captionCount: application === "main" ? 3 : 1 } }).select("id").single();
  if (requestError || !request) throw new Error("Generation request could not be recorded.");
  return {
    id: request.id as string,
    prompt,
    async onAttempt(record: AttemptRecord) {
      const { error } = await db.from("caption_lab_responses").insert({ request_id: request.id, model_id: step.model_id, provider_key: "google-gemini", model_key: model, ...record });
      if (error) throw new Error("Provider attempt could not be recorded.");
    },
    async finish(captionIds: string[], errorCode: string | null = null) {
      if (captionIds.length) {
        const { data, error } = await db.from("ai_captions").update({ generation_request_id: request.id }).eq("creator_id", userId).in("id", captionIds).select("id");
        if (error || data?.length !== captionIds.length) throw new Error("Caption telemetry could not be linked.");
      }
      const { error } = await db.from("caption_lab_requests").update({ status: errorCode ? "failed" : "succeeded", error_code: errorCode, finished_at: new Date().toISOString() }).eq("id", request.id);
      if (error) throw new Error("Generation outcome could not be recorded.");
    },
  };
}
