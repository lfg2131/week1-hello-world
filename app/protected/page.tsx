import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");

  const email = typeof data.claims.email === "string" ? data.claims.email : null;

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-xl space-y-6 rounded-xl border border-zinc-800 bg-zinc-900 p-8">
        <p className="text-sm text-emerald-400">Authenticated · /protected</p>
        <h1 className="text-3xl font-bold">Protected Page</h1>
        <p>Signed in as: <span className="font-semibold">{email || "Authenticated user"}</span></p>
        <p className="text-zinc-300">This content is only visible to authenticated users.</p>
        <form action={signOut}>
          <button className="cursor-pointer rounded-lg bg-white px-5 py-2.5 font-medium text-zinc-950 hover:bg-zinc-200" type="submit">Sign out</button>
        </form>
        <Link className="inline-block text-sm underline underline-offset-4" href="/">Back to public games</Link>
      </div>
    </main>
  );
}
