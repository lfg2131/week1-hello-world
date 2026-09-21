import Link from "next/link";
import GoogleSignIn from "./google-sign-in";

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-xl space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-sm text-zinc-400">Provisional Week 3 · /login</p>
        <h1 className="text-3xl font-bold">Sign in with Google</h1>
        <p className="text-zinc-300">Sign in to view the protected page. The Assignment 2 games page is public.</p>
        <GoogleSignIn />
        <nav className="flex flex-wrap gap-5 text-sm" aria-label="Page navigation">
          <Link className="underline underline-offset-4" href="/">Public games</Link>
          <Link className="underline underline-offset-4" href="/protected" prefetch={false}>Protected page</Link>
        </nav>
      </div>
    </main>
  );
}
