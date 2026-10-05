"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="card max-w-md space-y-5 p-8" aria-labelledby="error-title">
        <p className="eyebrow text-red-200">Something broke</p>
        <h1 id="error-title" className="text-2xl font-bold">That didn’t load</h1>
        <p className="text-muted">Check your connection and try again. If it keeps happening, sign in again.</p>
        <div className="flex flex-wrap gap-3">
          <button className="btn-primary" onClick={reset}>Try again</button>
          <Link href="/login" className="btn-quiet">Go to sign in</Link>
        </div>
      </section>
    </main>
  );
}
