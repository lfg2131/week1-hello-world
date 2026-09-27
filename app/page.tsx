import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Game = {
  id: number;
  name: string;
  genre: string;
  release_year: number | null;
};

export default async function Home() {
  const { data, error } = await supabase
    .from("week2_games")
    .select("id, name, genre, release_year")
    .order("id", { ascending: true });

  if (error) {
    throw new Error(`Failed to load games: ${error.message}`);
  }

  const auth = await createClient();
  const { data: identity } = await auth.auth.getClaims();
  const signedIn = Boolean(identity?.claims?.sub);

  const games = (data ?? []) as Game[];

  return (
    <main className="account-background min-h-screen px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl">
        <nav className="mb-8 flex flex-wrap gap-2 text-sm text-slate-300" aria-label="Page navigation">
          <Link className="nav-link bg-indigo-500/20 text-indigo-200" href="/" aria-current="page">Public Games</Link>
          <Link className="nav-link" href={signedIn ? "/profile" : "/login"} prefetch={false}>{signedIn ? "Profile" : "Sign In"}</Link>
          <Link className="nav-link" href="/protected" prefetch={false}>Protected Page</Link>
        </nav>
        <h1 className="mb-2 text-4xl font-bold text-indigo-100">Games from Supabase</h1>

        <p className="mb-8 text-zinc-400">
          This list is loaded from a Supabase database.
        </p>

        <div className="overflow-x-auto rounded-xl border border-indigo-400/30 shadow-xl shadow-indigo-950/30">
          <table className="w-full text-left">
            <thead className="bg-indigo-950/70 text-indigo-200">
              <tr>
                <th className="px-5 py-4">Game</th>
                <th className="px-5 py-4">Genre</th>
                <th className="px-5 py-4">Year</th>
              </tr>
            </thead>

            <tbody>
              {games.map((game) => (
                <tr
                  key={game.id}
                  className="border-t border-zinc-800 bg-zinc-950"
                >
                  <td className="px-5 py-4 font-medium">{game.name}</td>
                  <td className="px-5 py-4 text-zinc-300">{game.genre}</td>
                  <td className="px-5 py-4 text-zinc-300">
                    {game.release_year ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
