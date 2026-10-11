export default function ExploreLoading() {
  return (
    <div className="space-y-8" aria-busy="true">
      <header className="space-y-2">
        <p className="eyebrow">Explore</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">See what everyone made</h1>
        <p className="text-muted" role="status">Loading posts…</p>
      </header>
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
        {[0, 1, 2].map((item) => (
          <li key={item} className="card animate-pulse">
            <div className="aspect-square bg-surface-raised" />
            <div className="space-y-3 p-5">
              <div className="h-6 w-40 rounded-full bg-surface-raised" />
              <div className="h-4 rounded-full bg-surface-raised" />
              <div className="h-4 w-5/6 rounded-full bg-surface-raised" />
              <div className="h-4 w-2/3 rounded-full bg-surface-raised" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
