import { isPerspective, type Perspective } from "./validation";

export type ExploreRow = {
  id: string;
  batch_id: string;
  caption: string;
  source_image_path: string;
  image_alt: string | null;
  tone: string | null;
  perspective: string;
  creator_id: string;
  created_at: string;
};

/** One generated post: a photo and the captions written for it together. */
export type ExplorePost = {
  batchId: string;
  createdAt: string;
  imagePath: string;
  imageAlt: string | null;
  tone: string | null;
  perspective: Perspective | null;
  creatorId: string;
  captions: { id: string; caption: string }[];
};

/** Group caption rows into posts (one per generation batch), newest post first. */
export function groupPosts(rows: ExploreRow[]): ExplorePost[] {
  const posts = new Map<string, ExplorePost>();
  for (const row of rows) {
    const post = posts.get(row.batch_id);
    if (post) {
      post.captions.push({ id: row.id, caption: row.caption });
      continue;
    }
    posts.set(row.batch_id, {
      batchId: row.batch_id,
      createdAt: row.created_at,
      imagePath: row.source_image_path,
      imageAlt: row.image_alt,
      tone: row.tone,
      perspective: isPerspective(row.perspective) ? row.perspective : null,
      creatorId: row.creator_id,
      captions: [{ id: row.id, caption: row.caption }],
    });
  }
  return [...posts.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Short post time: "just now", "5m ago", "3h ago", "2d ago", then a New York date like "Oct 5". */
export function formatPostedAt(iso: string, now = new Date()) {
  const posted = new Date(iso);
  const elapsed = now.getTime() - posted.getTime();
  if (Number.isNaN(elapsed)) return "";
  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  const sameYear = posted.getUTCFullYear() === now.getUTCFullYear();
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(posted);
}
