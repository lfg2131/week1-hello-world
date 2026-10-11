import { isPerspective } from "@/lib/captions/validation";

export const PERSPECTIVE_DISPLAY = {
  student: { label: "Student", icon: "🎒", badge: "border-sky-300/30 bg-sky-300/10 text-sky-100" },
  professor: { label: "Professor", icon: "🧑‍🏫", badge: "border-amber-300/35 bg-amber-300/10 text-amber-100" },
} as const;

/** Whose point of view a caption is written from. Renders nothing for unknown values. */
export function PerspectiveBadge({ perspective }: { perspective: unknown }) {
  if (!isPerspective(perspective)) return null;
  const { label, icon, badge } = PERSPECTIVE_DISPLAY[perspective];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${badge}`}>
      <span aria-hidden="true">{icon}</span>
      {label} perspective
    </span>
  );
}

export function ToneBadge({ tone }: { tone: string | null }) {
  if (!tone) return null;
  return <span className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-muted capitalize">{tone}</span>;
}
