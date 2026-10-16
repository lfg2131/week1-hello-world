"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { submitVote } from "@/app/(lab)/rate/actions";

type Vote = 1 | -1;

/**
 * Funny / Not funny on every Explore card. Signed-in votes go through the same
 * verified-user Server Action as Rate (user id from the session, one vote per
 * caption enforced by the database). Signed-out clicks only ask for sign-in.
 */
export function VoteButtons({ captionId, initialVote, signedIn }: { captionId: string; initialVote: Vote | null; signedIn: boolean }) {
  const [vote, setVote] = useState<Vote | null>(initialVote);
  const [justSaved, setJustSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [askSignIn, setAskSignIn] = useState(false);
  const [pending, startTransition] = useTransition();
  // Blocks a second click before React re-renders with the pending state.
  const sending = useRef(false);

  function choose(value: Vote) {
    if (!signedIn) {
      setAskSignIn(true);
      return;
    }
    if (vote !== null || sending.current) return;
    sending.current = true;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await submitVote(captionId, value);
        if (result.status === "saved") {
          setVote(result.vote);
          setJustSaved(true);
        } else if (result.status === "duplicate") {
          // Already rated elsewhere (another tab, or on Rate): keep one vote, say so.
          setVote(value);
          setMessage("You already rated this one.");
        } else {
          setMessage(result.message);
        }
      } catch {
        setMessage("Your vote didn’t save. Check your connection and try again.");
      } finally {
        sending.current = false;
      }
    });
  }

  if (vote !== null) {
    return (
      <div className="space-y-2">
        <p className={`flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold ${vote === 1 ? "bg-funny/15 text-lime-100" : "bg-white/5 text-zinc-200"}`}>
          <span aria-hidden="true">{vote === 1 ? "😂" : "😐"}</span>
          You voted {vote === 1 ? "Funny" : "Not funny"}
        </p>
        <p aria-live="polite" className="text-center text-xs text-muted">
          {justSaved ? "Vote saved ✓" : message}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Rate this caption">
        <button type="button" className="btn-funny min-h-11 px-3 py-2 text-sm" disabled={pending} onClick={() => choose(1)}>
          <span aria-hidden="true">😂</span> Funny
        </button>
        <button type="button" className="btn-quiet min-h-11 px-3 py-2 text-sm" disabled={pending} onClick={() => choose(-1)}>
          <span aria-hidden="true">😐</span> Not funny
        </button>
      </div>
      <div aria-live="polite" className="text-center text-xs">
        {pending && <p className="text-muted">Saving your vote…</p>}
        {message && <p role="alert" className="text-red-200">{message}</p>}
        {askSignIn && (
          <p className="rounded-xl border border-brand-soft/30 bg-brand/10 px-3 py-2 text-sm text-zinc-100">
            Sign in to vote.{" "}
            <Link href="/login?next=/explore" className="font-semibold text-brand-soft underline underline-offset-4 hover:text-white">
              Continue with Google
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
