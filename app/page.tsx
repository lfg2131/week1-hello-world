import { supabase } from "@/lib/supabase";

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

  const games = (data ?? []) as Game[];

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-white">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-2 text-4xl font-bold">Games from Supabase</h1>

        <p className="mb-8 text-zinc-400">
          This list is loaded from a Supabase database.
        </p>

        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-left">
            <thead className="bg-zinc-900 text-zinc-300">
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
