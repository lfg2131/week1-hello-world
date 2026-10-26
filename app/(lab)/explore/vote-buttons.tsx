"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { setVote } from "@/app/(lab)/rate/actions";

type Vote = 1 | -1;

export function VoteButtons({ captionId, initialVote, signedIn }: { captionId: string; initialVote: Vote | null; signedIn: boolean }) {
  const [vote, selectVote] = useState<Vote | null>(initialVote);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [askSignIn, setAskSignIn] = useState(false);
  const [pending, startTransition] = useTransition();
  const sending = useRef(false);
  function choose(value: Vote) {
    if (!signedIn) { setAskSignIn(true); return; }
    if (sending.current) return;
    sending.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await setVote(captionId, vote === value ? null : value);
        if (result.status === "saved") {
          selectVote(result.vote);
          setMessage(result.vote === null ? "Vote removed." : "Saved. Click selected choice to undo.");
        } else setError(result.message);
      } catch { setError("Your vote didn’t save. Check your connection and try again."); }
      finally { sending.current = false; }
    });
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2" role="group" aria-label="Rate this caption">
        <button type="button" className="btn-funny min-h-11 px-3 py-2 text-sm" aria-pressed={vote === 1} aria-label={vote === 1 ? "Funny selected; click to undo" : "Funny"} disabled={pending} onClick={() => choose(1)}>😂 Funny</button>
        <button type="button" className="btn-quiet min-h-11 px-3 py-2 text-sm" aria-pressed={vote === -1} aria-label={vote === -1 ? "Not funny selected; click to undo" : "Not funny"} disabled={pending} onClick={() => choose(-1)}>😐 Not funny</button>
      </div>
      <p aria-live="polite" className="text-center text-xs text-muted">{pending ? "Saving your vote…" : message || (vote === null ? "" : `You voted ${vote === 1 ? "Funny" : "Not funny"}. Click again to undo.`)}</p>
      {error && <p role="alert" className="text-xs text-red-200">{error}</p>}
      {askSignIn && <p className="text-sm">Sign in to vote. <Link href="/login?next=/explore" className="text-brand-soft underline">Continue with Google</Link></p>}
    </div>
  );
}
