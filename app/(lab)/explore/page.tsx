import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";
import { CAPTION_COUNT, MEDIA_BUCKET } from "@/lib/captions/validation";
import { formatPostedAt, groupPosts, type ExplorePost, type ExploreRow } from "@/lib/captions/explore";
import { PerspectiveBadge, ToneBadge } from "@/app/components/caption-badges";

export const metadata: Metadata = { title: "Explore" };

// Plenty for a class-sized feed; the page says so if there are more.
const MAX_POSTS = 120;
const SIGNED_URL_SECONDS = 60 * 60;

export default async function ExplorePage() {
  const { supabase, userId } = await requireUser();

  // Every caption from every creator, newest first (RLS lets any signed-in
  // user read the feed). Votes are not joined: no public vote counts.
  const { data, error } = await supabase
    .from("ai_captions")
    .select("id, batch_id, caption, source_image_path, image_alt, tone, perspective, creator_id, created_at")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_POSTS * CAPTION_COUNT);
  if (error) throw new Error("Failed to load Explore");

  const rows = (data ?? []) as ExploreRow[];
  const posts = groupPosts(rows);
  const paths = [...new Set(posts.map((post) => post.imagePath))];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const entry of signed ?? []) if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  }
  const now = new Date();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="space-y-2">
          <p className="eyebrow">Explore</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">See what everyone made</h1>
          <p className="text-muted">Every photo and its three AI captions, newest first.</p>
        </div>
        {posts.length > 0 && (
          <p className="text-sm text-muted">
            {posts.length} {posts.length === 1 ? "post" : "posts"} · {rows.length} captions
          </p>
        )}
      </header>

      {posts.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, index) => (
            <li key={post.batchId} className="flex">
              <PostCard
                post={post}
                imageUrl={urls.get(post.imagePath)}
                mine={post.creatorId === userId}
                postedAt={formatPostedAt(post.createdAt, now)}
                eager={index < 3}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState />
      )}

      {rows.length >= MAX_POSTS * CAPTION_COUNT && (
        <p className="text-center text-sm text-muted">Showing the newest {posts.length} posts.</p>
      )}
    </div>
  );
}

function PostCard({ post, imageUrl, mine, postedAt, eager }: {
  post: ExplorePost;
  imageUrl: string | undefined;
  mine: boolean;
  postedAt: string;
  eager: boolean;
}) {
  return (
    <article className="card flex w-full flex-col">
      <div className="relative aspect-square bg-zinc-900">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={post.imageAlt || "Photo shared for captioning."}
            fill
            unoptimized
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
            loading={eager ? "eager" : "lazy"}
          />
        ) : (
          <p className="absolute inset-0 grid place-items-center text-sm text-muted">Photo unavailable</p>
        )}
        {mine && <span className="absolute top-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white backdrop-blur">Your post</span>}
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <PerspectiveBadge perspective={post.perspective} />
          <ToneBadge tone={post.tone} />
          <time dateTime={post.createdAt} className="ml-auto text-xs text-muted">{postedAt}</time>
        </div>
        <ul className="divide-y divide-line">
          {post.captions.map((caption) => (
            <li key={caption.id} className="py-3 leading-snug font-medium text-pretty first:pt-0 last:pb-0">
              “{caption.caption}”
            </li>
          ))}
        </ul>
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
