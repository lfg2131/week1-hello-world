import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <section className="card max-w-md space-y-5 p-8 text-center" aria-labelledby="missing-title">
        <h1 id="missing-title" className="text-2xl font-bold">Nothing to caption here</h1>
        <p className="text-muted">That page doesn’t exist.</p>
        <Link href="/rate" className="btn-funny">Back to rating</Link>
      </section>
    </main>
  );
}
