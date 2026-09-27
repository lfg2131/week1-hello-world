import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/protected/actions";

type Tone = "auth" | "profile" | "setup" | "success";
const tones: Record<Tone, string> = {
  auth: "border-indigo-400/40 shadow-indigo-950/40",
  profile: "border-violet-400/40 shadow-violet-950/40",
  setup: "border-amber-400/40 shadow-amber-950/20",
  success: "border-emerald-400/40 shadow-emerald-950/30",
};

export function AccountShell({ children, signedIn = true, tone = "profile" }: {
  children: ReactNode;
  signedIn?: boolean;
  tone?: Tone;
}) {
  return (
    <main className="account-background min-h-screen px-6 py-12 text-white sm:py-20">
      <div className="mx-auto max-w-xl space-y-8">
        <nav className="flex flex-wrap gap-2 text-sm text-slate-300" aria-label="Page navigation">
          <Link className="nav-link" href="/">Public Games</Link>
          <Link className={`nav-link ${tone === "success" ? "bg-emerald-500/15 text-emerald-300" : ""}`} aria-current={tone === "success" ? "page" : undefined} href="/protected" prefetch={false}>Protected Page</Link>
          <Link className={`nav-link ${tone === "profile" ? "bg-violet-500/15 text-violet-300" : tone === "auth" ? "bg-indigo-500/20 text-indigo-200" : ""}`} aria-current={tone === "profile" || tone === "auth" ? "page" : undefined} href={signedIn ? "/profile" : "/login"} prefetch={false}>{signedIn ? "Profile" : "Sign In"}</Link>
        </nav>
        <section className={`space-y-6 rounded-2xl border bg-slate-900/90 p-6 shadow-2xl sm:p-8 ${tones[tone]}`}>{children}</section>
        {signedIn && (
          <form action={signOut}>
            <button className="secondary-button" type="submit">Sign Out</button>
          </form>
        )}
      </div>
    </main>
  );
}

export function ProfileUnavailable() {
  return (
    <AccountShell>
      <p className="status-error">Profile needs attention</p>
      <h1 className="text-2xl font-semibold">Profile unavailable</h1>
      <p className="text-slate-300">We couldn’t load your profile. Please refresh to retry. If this continues, contact the app owner to check automatic profile creation and access.</p>
      <Link href="/profile" className="secondary-button inline-block">Try again</Link>
    </AccountShell>
  );
}
