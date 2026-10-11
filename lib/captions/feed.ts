export type FeedRow = {
  id: string;
  batch_id: string;
  caption: string;
  source_image_path: string;
  tone: string | null;
  perspective: string;
  created_at: string;
  creator_id: string;
};

/**
 * Round-robin across batches (newest batch first) so consecutive cards show
 * different photos whenever possible instead of the same image three times.
 */
export function interleaveBatches<T extends Pick<FeedRow, "batch_id" | "created_at">>(rows: T[]): T[] {
  const batches = new Map<string, T[]>();
  for (const row of [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at))) {
    const list = batches.get(row.batch_id) ?? [];
    list.push(row);
    batches.set(row.batch_id, list);
  }
  const queues = [...batches.values()];
  const result: T[] = [];
  for (let round = 0; result.length < rows.length; round++) {
    for (const queue of queues) if (queue[round]) result.push(queue[round]);
  }
  return result;
}
