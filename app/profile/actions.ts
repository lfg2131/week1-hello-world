"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnedAvatarPath, parseNames } from "@/lib/profile";

export type SaveState = { error?: string; success?: string; avatarUrl?: string };

export async function saveProfile(form: FormData): Promise<SaveState> {
  const supabase = await createClient({ writable: true });
  const { data, error: authError } = await supabase.auth.getClaims();
  if (authError || !data?.claims?.sub) return { error: "Your session has expired. Please sign in again." };
  const userId = data.claims.sub;
  const names = parseNames(form.get("first_name"), form.get("last_name"));
  if (!names) return { error: "Enter both names, using 1–80 characters each." };
  const avatarPath = form.get("avatar_path");
  let avatarUrl: string | undefined;
  if (avatarPath) {
    if (typeof avatarPath !== "string" || !isOwnedAvatarPath(avatarPath, userId)) {
      return { error: "Invalid photo. Please upload it again." };
    }
    avatarUrl = supabase.storage.from("media").getPublicUrl(avatarPath).data.publicUrl;
  }
  const { data: saved, error } = await supabase.from("profiles").update({
    ...names,
    updated_at: new Date().toISOString(),
    ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
  }).eq("id", userId).select("id").single();
  if (error || !saved) return { error: "Your profile could not be saved. Please retry; if this continues, contact the app owner." };
  revalidatePath("/", "layout");
  return { success: "Profile saved.", avatarUrl };
}

export async function completeProfile(form: FormData): Promise<SaveState> {
  const result = await saveProfile(form);
  if (result.error) return result;
  redirect("/protected");
}
