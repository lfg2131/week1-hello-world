export default function LabLoading() {
  return (
    <div className="grid min-h-[45vh] place-items-center" aria-busy="true">
      <p role="status" className="flex items-center gap-3 text-muted">
        <span aria-hidden="true" className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-funny" />
        Loading…
      </p>
    </div>
  );
}
