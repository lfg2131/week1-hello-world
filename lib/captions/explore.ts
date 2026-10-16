import { isPerspective, isUuid, type Perspective } from "./validation";

/**
 * Public Explore columns. Signed-out visitors have column-level SELECT on
 * exactly these (see the Week 6 migration): no prompt, context, model, or creator.
 */
export const PUBLIC_EXPLORE_COLUMNS = "id, batch_id, caption, source_image_path, image_alt, tone, perspective, created_at";
/** Signed-in viewers also read creator_id, only to mark their own posts. */
export const SIGNED_IN_EXPLORE_COLUMNS = `${PUBLIC_EXPLORE_COLUMNS}, creator_id`;

export type ExploreRow = {
  id: string;
  batch_id: string;
  caption: string;
  source_image_path: string;
  image_alt: string | null;
  tone: string | null;
  perspective: string;
  created_at: string;
  creator_id?: string;
};

/** One Explore card per caption row. Captions from the same upload share (and repeat) the image. */
export type ExploreCard = {
  id: string;
  batchId: string;
  caption: string;
  createdAt: string;
  imagePath: string;
  imageAlt: string | null;
  tone: string | null;
  perspective: Perspective | null;
  mine: boolean;
};

/** Newest first; captions of one upload stay together in a stable order. */
export function toExploreCards(rows: ExploreRow[], viewerId: string | null): ExploreCard[] {
  return [...rows]
    .sort((a, b) => b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id))
    .map((row) => ({
      id: row.id,
      batchId: row.batch_id,
      caption: row.caption,
      createdAt: row.created_at,
      imagePath: row.source_image_path,
      imageAlt: row.image_alt,
      tone: row.tone,
      perspective: isPerspective(row.perspective) ? row.perspective : null,
      mine: Boolean(viewerId && row.creator_id === viewerId),
    }));
}

/** The batch to highlight after "View your captions"; anything but a UUID is ignored. */
export function highlightedBatch(value: unknown) {
  return isUuid(value) ? value : null;
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
