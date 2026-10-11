import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";
import { MEDIA_BUCKET } from "@/lib/captions/validation";
import { getDailyVibe } from "@/lib/captions/daily-vibe";
import { PerspectiveBadge } from "@/app/components/caption-badges";
import { CreateStudio } from "./create-studio";

export const metadata: Metadata = { title: "Create" };
// Upload verification plus up to two 25s model attempts; keep headroom under the limit.
export const maxDuration = 60;

type RecentRow = { id: string; batch_id: string; caption: string; source_image_path: string; image_alt: string | null; perspective: string; created_at: string };

export default async function CreatePage() {
  const { supabase, userId } = await requireUser();
  const vibe = getDailyVibe();

  // The viewer's own latest batches, so generated captions persist across refreshes.
  const { data } = await supabase
    .from("ai_captions")
    .select("id, batch_id, caption, source_image_path, image_alt, perspective, created_at")
    .eq("creator_id", userId)
    .order("created_at", { ascending: false })
    .limit(9);
  const batches = new Map<string, RecentRow[]>();
  for (const row of (data ?? []) as RecentRow[]) batches.set(row.batch_id, [...(batches.get(row.batch_id) ?? []), row]);
  const recent = [...batches.values()].slice(0, 2);
  const paths = recent.map((rows) => rows[0].source_image_path);
  const { data: signed } = paths.length ? await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 60 * 60) : { data: [] };
  const urls = new Map((signed ?? []).filter((entry) => entry.signedUrl && !entry.error).map((entry) => [entry.path, entry.signedUrl]));

  return (
    <div className="space-y-12">
      <CreateStudio vibe={vibe} />

      {recent.length > 0 && (
        <section aria-labelledby="recent-title" className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="recent-title" className="text-xl font-bold">Your recent drops</h2>
            <Link href="/explore" className="rounded-lg text-sm font-semibold text-brand-soft underline-offset-4 hover:text-white hover:underline">
              See all posts on Explore
            </Link>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {recent.map((rows) => {
              const url = urls.get(rows[0].source_image_path);
              return (
                <article key={rows[0].batch_id} className="card flex gap-4 p-3">
                  <div className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-2xl bg-zinc-900 sm:w-28">
                    {url && <Image src={url} alt={rows[0].image_alt || "Your uploaded photo."} fill unoptimized sizes="112px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 space-y-2 py-1">
                    <PerspectiveBadge perspective={rows[0].perspective} />
                    <ol className="space-y-1.5 text-sm">
                      {[...rows].reverse().map((row) => <li key={row.id} className="text-pretty">“{row.caption}”</li>)}
                    </ol>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
