import Link from "next/link";
import { requireUser } from "@/lib/supabase/require-user";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/app/components/brand";
import { LabNav } from "./lab-nav";

export default async function LabLayout({ children }: LayoutProps<"/">) {
  await requireUser();
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-line/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 sm:px-6">
          <Link href="/rate" className="mr-auto rounded-xl py-1" aria-label="Caption Lab home">
            <BrandMark compact />
          </Link>
          <LabNav />
          <form action={signOut}>
            <button className="btn-ghost" type="submit">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pt-6 pb-16 sm:px-6 sm:pt-10">{children}</main>
    </div>
  );
}
