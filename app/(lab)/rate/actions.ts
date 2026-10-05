"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/auth";
import { isUuid, parseVote } from "@/lib/captions/validation";

export type VoteResult =
  | { status: "saved"; captionId: string; vote: 1 | -1 }
  | { status: "duplicate"; message: string }
  | { status: "error"; message: string };

/**
 * Records one immutable vote as a new caption_votes row. The client sends
 * only the caption id and vote; user_id always comes from the verified session.
 * There is intentionally no update or delete path.
 */
export async function submitVote(captionId: unknown, vote: unknown): Promise<VoteResult> {
  const supabase = await createClient({ writable: true });
  const userId = await getVerifiedUserId(supabase);
  if (!userId) return { status: "error", message: "Your session expired. Sign in again to keep rating." };

  const value = parseVote(vote);
  if (!isUuid(captionId) || value === null) return { status: "error", message: "That vote didn’t look right. Refresh and try again." };

  const { data, error } = await supabase
    .from("caption_votes")
    .insert({ caption_id: captionId, user_id: userId, vote: value })
    .select("caption_id, vote")
    .single();

  if (error?.code === "23505") return { status: "duplicate", message: "You already rated this one." };
  if (error?.code === "23503") return { status: "error", message: "This caption isn’t available anymore. Skipping it." };
  if (error || !data) return { status: "error", message: "Your vote didn’t save. Try again." };
  return { status: "saved", captionId: data.caption_id, vote: data.vote };
}
