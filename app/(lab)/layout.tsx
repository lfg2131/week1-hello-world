import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/auth";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/app/components/brand";
import { LabNav } from "./lab-nav";
import { GenerationProvider } from "./generation-provider";

// Shared shell for Explore (public), Rate and Create (protected). This layout
// does not guard access: the proxy and each protected page's own session check do.
export default async function LabLayout({ children }: LayoutProps<"/">) {
  const signedIn = Boolean(await getVerifiedUserId(await createClient()));
  return (
    <GenerationProvider>
      <div className="flex min-h-full flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-line/70 bg-background/85 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 sm:px-6">
            <Link href="/explore" className="shrink-0 rounded-xl py-1 max-[359px]:hidden sm:mr-auto" aria-label="Caption Lab home">
              <BrandMark compact />
            </Link>
            <LabNav />
            {signedIn ? (
              <form action={signOut} className="shrink-0">
                <button className="btn-ghost" type="submit">Sign out</button>
              </form>
            ) : (
              <Link href="/login?next=/explore" className="btn-ghost shrink-0 text-foreground">Sign in</Link>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-28 sm:px-6 sm:pt-10">{children}</main>
      </div>
    </GenerationProvider>
  );
}
