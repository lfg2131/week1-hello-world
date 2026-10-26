"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/auth";
import { isUuid } from "@/lib/captions/validation";

export type VoteResult =
  | { status: "saved"; captionId: string; vote: 1 | -1 | null }
  | { status: "error"; message: string };

/** Idempotent desired state. The invoker RPC derives user_id from auth.uid(),
 * writes a real row on first vote, and updates only vote on conflict. */
export async function setVote(captionId: unknown, nextVote: unknown): Promise<VoteResult> {
  const supabase = await createClient({ writable: true });
  const userId = await getVerifiedUserId(supabase);
  if (!userId) return { status: "error", message: "Your session expired. Sign in again to keep rating." };
  if (!isUuid(captionId) || (nextVote !== 1 && nextVote !== -1 && nextVote !== null)) {
    return { status: "error", message: "That vote didn’t look right. Refresh and try again." };
  }
  const { error } = await supabase.rpc("caption_lab_set_vote", { p_caption_id: captionId, p_vote: nextVote });
  if (error?.code === "23503") return { status: "error", message: "This caption isn’t available anymore." };
  if (error) return { status: "error", message: "Your vote didn’t save. Try again." };
  revalidatePath("/explore");
  revalidatePath("/rate");
  return { status: "saved", captionId, vote: nextVote };
}
