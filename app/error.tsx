"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="account-background flex min-h-screen items-center justify-center px-6 text-white">
      <section className="max-w-lg space-y-5 rounded-2xl border border-red-400/30 bg-slate-900 p-8">
        <p className="status-error">Something went wrong</p>
        <h1 className="text-2xl font-bold">Please try again</h1>
        <p className="text-slate-300">We couldn’t complete that request. Check your connection and retry. If this continues, contact the app owner.</p>
        <button className="primary-button" onClick={reset}>Try again</button>
        <Link href="/login" className="secondary-button ml-3 inline-block">Sign In</Link>
      </section>
    </main>
  );
}
