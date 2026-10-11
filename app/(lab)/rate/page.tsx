import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";
import { MEDIA_BUCKET } from "@/lib/captions/validation";
import { interleaveBatches, type FeedRow } from "@/lib/captions/feed";
import { RateDeck, type RateCard } from "./rate-deck";

export const metadata: Metadata = { title: "Rate" };

const FEED_SIZE = 60;
const SIGNED_URL_SECONDS = 60 * 60;

export default async function RatePage() {
  const { supabase, userId } = await requireUser();

  // Unrated first: left-join the viewer's own votes (RLS exposes only theirs)
  // and keep captions with no matching vote. Newest content leads.
  const { data, error } = await supabase
    .from("ai_captions")
    .select("id, batch_id, caption, source_image_path, image_alt, tone, perspective, created_at, creator_id, caption_votes!left(id)")
    .is("caption_votes", null)
    .order("created_at", { ascending: false })
    .limit(FEED_SIZE);
  if (error) throw new Error("Failed to load the rating feed");

  const rows = interleaveBatches((data ?? []) as (FeedRow & { image_alt: string | null })[]);
  const paths = [...new Set(rows.map((row) => row.source_image_path))];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const entry of signed ?? []) if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }

  // Only display data reaches the browser: no storage paths or other users' ids.
  const cards: RateCard[] = rows.flatMap((row) => {
    const imageUrl = urls.get(row.source_image_path);
    return imageUrl ? [{
      id: row.id,
      caption: row.caption,
      imageUrl,
      imageAlt: row.image_alt || "Photo shared for captioning.",
      tone: row.tone,
      perspective: row.perspective,
      mine: row.creator_id === userId,
    }] : [];
  });

  return (
    <div className="mx-auto max-w-xl space-y-4 sm:space-y-6">
      <header className="space-y-2">
        <p className="eyebrow">Rate</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Is it funny?</h1>
        <p className="hidden text-muted sm:block">One tap per caption. Fresh, unrated captions come first.</p>
      </header>
      {cards.length ? <RateDeck cards={cards} /> : <EmptyState />}
    </div>
  );
}

function EmptyState() {
  return (
    <section className="card card-enter p-8 text-center sm:p-10" aria-labelledby="empty-title">
      <p aria-hidden="true" className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-funny text-2xl text-zinc-950">✓</p>
      <h2 id="empty-title" className="text-2xl font-bold">Nothing left to rate. Make something funny.</h2>
      <p className="mx-auto mt-3 max-w-sm text-muted">
        You’re all caught up. New captions land here as people post, so check back after class.
      </p>
      <Link href="/create" className="btn-funny mt-6">Create captions</Link>
    </section>
  );
}
