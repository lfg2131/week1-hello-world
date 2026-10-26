"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { PerspectiveBadge, ToneBadge } from "@/app/components/caption-badges";
import { ratingShortcut } from "@/lib/captions/rating-shortcuts";
import { setVote } from "./actions";

export type RateCard = {
  id: string; caption: string; imageUrl: string; imageAlt: string;
  tone: string | null; perspective: string; mine: boolean; initialVote: 1 | -1 | null;
};

export function RateDeck({ cards }: { cards: RateCard[] }) {
  // Preserve this session’s order when the action revalidates the server feed.
  const [deck] = useState(cards);
  const [index, setIndex] = useState(0);
  const [votes, setVotes] = useState<Record<string, 1 | -1 | null>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const sending = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const card = deck[index];
  const selected = card ? (Object.hasOwn(votes, card.id) ? votes[card.id] : card.initialVote) : null;

  useEffect(() => { if (index > 0) headingRef.current?.focus(); }, [index]);

  function choose(value: 1 | -1) {
    if (!card || sending.current) return;
    sending.current = true;
    const nextVote = selected === value ? null : value;
    setError("");
    startTransition(async () => {
      try {
        const result = await setVote(card.id, nextVote);
        if (result.status === "saved") {
          setVotes((previous) => ({ ...previous, [card.id]: result.vote }));
          setMessage(result.vote === null ? "Vote removed." : "Vote saved. Change it or click again to undo.");
        } else setError(result.message);
      } catch { setError("Your vote didn’t save. Check your connection and try again."); }
      finally { sending.current = false; }
    });
  }

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const overlayOpen = Boolean(document.querySelector('dialog[open], [aria-modal="true"], [role="dialog"]:not([hidden]):not([data-state="closed"]), [role="menu"]:not([hidden]):not([data-state="closed"]), [aria-expanded="true"][aria-haspopup]'));
      const value = ratingShortcut(event, pending || sending.current || !card, overlayOpen);
      if (value === null) return;
      event.preventDefault();
      choose(value);
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  function advance() {
    if (sending.current) return;
    setError(""); setMessage(""); setIndex((value) => value + 1);
  }

  if (!card) return (
    <section className="card p-6 text-center" aria-labelledby="done-title">
      <h2 id="done-title" tabIndex={-1} className="text-2xl font-bold">You’ve reached the end of this batch.</h2>
      <p className="mt-3 text-muted">{deck.length} captions viewed. Your saved votes are available on Explore.</p>
      <Link href="/explore" className="btn-funny mt-5">Explore captions</Link>
    </section>
  );

  return (
    <section aria-labelledby="caption-heading" className="space-y-2">
      <p className="text-sm text-muted">{index + 1} of {deck.length} captions · Unrated first</p>
      <article className="card">
        <div className="rate-image relative w-full bg-zinc-900">
          <Image src={card.imageUrl} alt={card.imageAlt} fill unoptimized sizes="(min-width: 640px) 576px, 100vw" className="object-contain" preload={index === 0} />
          {card.mine && <span className="absolute top-2 left-2 rounded-full bg-black/70 px-3 py-1 text-xs">Your caption</span>}
        </div>
        <div className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2"><PerspectiveBadge perspective={card.perspective} /><ToneBadge tone={card.tone} /></div>
          <h2 id="caption-heading" ref={headingRef} tabIndex={-1} className="text-xl leading-snug font-semibold text-balance sm:text-2xl">{card.caption}</h2>
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Rate this caption">
            <button type="button" className="btn-funny" aria-pressed={selected === 1} aria-label={selected === 1 ? "Funny selected; click to undo" : "Funny"} disabled={pending} onClick={() => choose(1)}>😂 Funny</button>
            <button type="button" className="btn-quiet" aria-pressed={selected === -1} aria-label={selected === -1 ? "Not funny selected; click to undo" : "Not funny"} disabled={pending} onClick={() => choose(-1)}>😐 Not funny</button>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted">↑ Funny · ↓ Not funny</p>
            <button type="button" className="btn-quiet min-h-10 py-2" disabled={pending} onClick={advance}>Next →</button>
          </div>
          <p aria-live="polite" className="min-h-5 text-xs text-muted">{pending ? "Saving your vote…" : message || (selected === null ? "Choose a rating or skip with Next." : `Saved: ${selected === 1 ? "Funny" : "Not funny"}. Click again to undo.`)}</p>
          {error && <p role="alert" className="alert-error">{error}</p>}
        </div>
      </article>
    </section>
  );
}
