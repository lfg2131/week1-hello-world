export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 font-semibold tracking-tight">
      <span aria-hidden="true" className="grid size-8 place-items-center rounded-xl bg-funny text-sm font-black text-zinc-950 shadow-lg shadow-lime-900/30">
        ha
      </span>
      <span className={compact ? "text-base" : "text-lg"}>Caption Lab</span>
    </span>
  );
}
