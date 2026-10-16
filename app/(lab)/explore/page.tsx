import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/auth";
import { MEDIA_BUCKET } from "@/lib/captions/validation";
import {
  PUBLIC_EXPLORE_COLUMNS,
  SIGNED_IN_EXPLORE_COLUMNS,
  formatPostedAt,
  highlightedBatch,
  toExploreCards,
  type ExploreCard,
  type ExploreRow,
} from "@/lib/captions/explore";
import { PerspectiveBadge, ToneBadge } from "@/app/components/caption-badges";
import { VoteButtons } from "./vote-buttons";

export const metadata: Metadata = { title: "Explore" };

// Plenty for a class-sized feed; the page says so if there are more.
const MAX_CARDS = 150;
const SIGNED_URL_SECONDS = 60 * 60;

/**
 * Public: anyone can browse. Signed-out visitors read through the anon role,
 * which only has column-level SELECT on display fields and can only sign URLs
 * for images that back a published caption. Signed-in viewers additionally
 * see which posts are theirs and their own votes (RLS: own rows only).
 */
export default async function ExplorePage({ searchParams }: PageProps<"/explore">) {
  const supabase = await createClient();
  const userId = await getVerifiedUserId(supabase);
  const highlight = highlightedBatch((await searchParams).batch);

  const { data, error } = await supabase
    .from("ai_captions")
    .select(userId ? SIGNED_IN_EXPLORE_COLUMNS : PUBLIC_EXPLORE_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_CARDS);
  if (error) throw new Error("Failed to load Explore");

  const cards = toExploreCards((data ?? []) as unknown as ExploreRow[], userId);
  const paths = [...new Set(cards.map((card) => card.imagePath))];
  const urls = new Map<string, string>();
  if (paths.length) {
    // One signature per photo, reused by every card that repeats it.
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const entry of signed ?? []) if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }

  // The viewer's own existing votes, so a reload shows what they already chose.
  const votes = new Map<string, 1 | -1>();
  if (userId && cards.length) {
    const { data: own } = await supabase
      .from("caption_votes")
      .select("caption_id, vote")
      .eq("user_id", userId)
      .in("caption_id", cards.map((card) => card.id));
    for (const row of (own ?? []) as { caption_id: string; vote: 1 | -1 }[]) votes.set(row.caption_id, row.vote);
  }
  const now = new Date();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="space-y-2">
          <p className="eyebrow">Explore</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">See what everyone made</h1>
          <p className="text-muted">Every AI caption, newest first. Tap Funny or Not funny on the ones you like.</p>
        </div>
        {cards.length > 0 && (
          <p className="text-sm text-muted">
            {cards.length} {cards.length === 1 ? "caption" : "captions"} · {paths.length} {paths.length === 1 ? "photo" : "photos"}
          </p>
        )}
      </header>

      {!userId && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          You’re browsing as a guest.
          <Link href="/login?next=/explore" className="font-semibold text-brand-soft underline-offset-4 hover:text-white hover:underline">
            Sign in with Google to vote and create
          </Link>
        </p>
      )}

      {cards.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, index) => (
            <li key={card.id} id={`caption-${card.id}`} className="flex scroll-mt-24">
              <CaptionCard
                card={card}
                imageUrl={urls.get(card.imagePath)}
                postedAt={formatPostedAt(card.createdAt, now)}
                eager={index < 3}
                isNew={card.batchId === highlight}
                vote={votes.get(card.id) ?? null}
                signedIn={Boolean(userId)}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState />
      )}

      {cards.length >= MAX_CARDS && (
        <p className="text-center text-sm text-muted">Showing the newest {cards.length} captions.</p>
      )}
    </div>
  );
}

function CaptionCard({ card, imageUrl, postedAt, eager, isNew, vote, signedIn }: {
  card: ExploreCard;
  imageUrl: string | undefined;
  postedAt: string;
  eager: boolean;
  isNew: boolean;
  vote: 1 | -1 | null;
  signedIn: boolean;
}) {
  return (
    <article className={`card flex w-full flex-col ${isNew ? "card-new" : ""}`}>
      <div className="relative aspect-[4/3] bg-zinc-900">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={card.imageAlt || "Photo shared for captioning."}
            fill
            unoptimized
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            loading={eager ? "eager" : "lazy"}
          />
        ) : (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted">Photo unavailable</p>
        )}
        <div className="absolute top-3 left-3 flex gap-2">
          {isNew && <span className="rounded-full bg-funny px-3 py-1 text-xs font-bold text-zinc-950">New</span>}
          {card.mine && <span className="rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">Your post</span>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <p className="flex-1 text-lg leading-snug font-semibold text-pretty">“{card.caption}”</p>
        <div className="flex flex-wrap items-center gap-2">
          <PerspectiveBadge perspective={card.perspective} />
          <ToneBadge tone={card.tone} />
          <time dateTime={card.createdAt} className="ml-auto text-xs text-muted">{postedAt}</time>
        </div>
        <VoteButtons captionId={card.id} initialVote={vote} signedIn={signedIn} />
      </div>
    </article>
  );
}

function EmptyState() {
  return (
    <section className="card card-enter p-8 text-center sm:p-10" aria-labelledby="empty-title">
      <p aria-hidden="true" className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-surface-raised text-2xl">📸</p>
      <h2 id="empty-title" className="text-2xl font-bold">No posts yet</h2>
      <p className="mx-auto mt-3 max-w-sm text-muted">
        Drop a photo, pick a student or professor perspective, and yours will be the first post here.
      </p>
      <Link href="/create" className="btn-funny mt-6">Create the first post</Link>
    </section>
  );
}
