"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { submitVote } from "./actions";

export type RateCard = {
  id: string;
  caption: string;
  imageUrl: string;
  imageAlt: string;
  tone: string | null;
  mine: boolean;
};

type Feedback = { kind: "saved"; vote: 1 | -1 } | { kind: "skipped"; message: string } | null;

const ADVANCE_MS = 650;

export function RateDeck({ cards }: { cards: RateCard[] }) {
  const [index, setIndex] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [error, setError] = useState("");
  const [rated, setRated] = useState(0);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const card = cards[index];
  const locked = pending || feedback !== null;

  // Move focus to the new caption so keyboard and screen-reader users follow along.
  useEffect(() => {
    if (index > 0) headingRef.current?.focus();
  }, [index]);

  function advance() {
    setFeedback(null);
    setIndex((value) => value + 1);
  }

  function vote(value: 1 | -1) {
    if (!card || locked) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await submitVote(card.id, value);
        if (result.status === "saved") {
          setRated((count) => count + 1);
          setFeedback({ kind: "saved", vote: result.vote });
          setTimeout(advance, ADVANCE_MS);
        } else if (result.status === "duplicate") {
          setFeedback({ kind: "skipped", message: result.message });
          setTimeout(advance, ADVANCE_MS * 2);
        } else {
          setError(result.message);
        }
      } catch {
        setError("Your vote didn’t save. Check your connection and try again.");
      }
    });
  }

  if (!card) {
    return (
      <section className="card card-enter p-8 text-center sm:p-10" aria-labelledby="done-title">
        <p aria-hidden="true" className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-funny text-2xl text-zinc-950">✓</p>
        <h2 id="done-title" tabIndex={-1} className="text-2xl font-bold">Nothing left to rate. Make something funny.</h2>
        <p className="mx-auto mt-3 max-w-sm text-muted">
          You rated {rated} {rated === 1 ? "caption" : "captions"} this session. New ones show up as people post, so come back later.
        </p>
        <Link href="/create" className="btn-funny mt-6">Create captions</Link>
      </section>
    );
  }

  return (
    <section aria-labelledby="caption-heading" className="space-y-4">
      <div className="flex items-center justify-between text-sm text-muted">
        <p aria-live="polite">{index + 1} of {cards.length} unrated</p>
        {rated > 0 && <p>{rated} rated</p>}
      </div>

      <article key={card.id} className="card card-enter">
        <div className="relative aspect-[4/5] max-h-[58vh] w-full bg-zinc-900 sm:max-h-[62vh]">
          <Image
            src={card.imageUrl}
            alt={card.imageAlt}
            fill
            unoptimized
            sizes="(min-width: 640px) 576px, 100vw"
            className="object-cover"
            priority={index === 0}
          />
          <div className="absolute top-3 left-3 flex gap-2">
            {card.mine && <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">Your caption</span>}
            {card.tone && <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-medium text-zinc-200 capitalize backdrop-blur">{card.tone}</span>}
          </div>
          {feedback?.kind === "saved" && (
            <div className="absolute inset-0 grid place-items-center bg-black/35">
              <p className={`vote-stamp rounded-2xl px-5 py-3 text-2xl font-black ${feedback.vote === 1 ? "bg-funny text-zinc-950" : "bg-white text-zinc-950"}`}>
                {feedback.vote === 1 ? "Funny ✓" : "Not funny ✓"}
              </p>
            </div>
          )}
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <h2 id="caption-heading" ref={headingRef} tabIndex={-1} className="text-xl leading-snug font-semibold text-balance sm:text-2xl">
            {card.caption}
          </h2>
          <div className="grid grid-cols-2 gap-3" role="group" aria-label="Rate this caption">
            <button type="button" className="btn-funny" disabled={locked} onClick={() => vote(1)}>
              <span aria-hidden="true">😂</span> Funny
            </button>
            <button type="button" className="btn-quiet" disabled={locked} onClick={() => vote(-1)}>
              <span aria-hidden="true">😐</span> Not funny
            </button>
          </div>
          <div aria-live="polite" className="min-h-6 text-sm">
            {pending && <p className="text-muted">Saving your vote…</p>}
            {feedback?.kind === "saved" && <p className="text-lime-200">Vote saved. Next one coming up.</p>}
            {feedback?.kind === "skipped" && <p className="text-muted">{feedback.message} Skipping ahead.</p>}
          </div>
          {error && (
            <div role="alert" className="alert-error flex flex-wrap items-center justify-between gap-3">
              <span>{error}</span>
              <button type="button" className="btn-ghost text-red-100" onClick={advance}>Skip</button>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
