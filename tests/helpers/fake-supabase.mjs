import { JPEG } from "./fixtures.mjs";

// A recording stand-in for the Supabase server client. Every call is logged
// in `calls` so tests can assert exactly what would reach the database.
export function fakeSupabase({
  userId = null,
  claimsError = null,
  download = { data: new Blob([JPEG]), error: null },
  hourlyCount = 0,
  countError = null,
  insertError = null,
  insertedRows = null,
  voteError = null,
} = {}) {
  const calls = [];
  const builder = (table) => {
    const state = { table, ops: [] };
    const record = (op) => (...args) => { state.ops.push([op, ...args]); calls.push([table, op, ...args]); return query; };
    const resolveQuery = () => {
      const insert = state.ops.find(([op]) => op === "insert");
      const select = state.ops.find(([op]) => op === "select");
      if (insert && table === "ai_captions") {
        if (insertError) return { data: null, error: insertError };
        const rows = insertedRows ?? insert[1].map((row, index) => ({ id: `row-${index}`, caption: row.caption }));
        return { data: rows, error: null };
      }
      if (insert && table === "caption_votes") {
        if (voteError) return { data: null, error: voteError };
        return { data: { caption_id: insert[1].caption_id, vote: insert[1].vote }, error: null };
      }
      if (select?.[2]?.head) return { count: hourlyCount, error: countError };
      return { data: [], error: null };
    };
    const query = {
      select: record("select"), insert: record("insert"), eq: record("eq"), gte: record("gte"),
      is: record("is"), order: record("order"), limit: record("limit"),
      update: record("update"), delete: record("delete"), upsert: record("upsert"),
      single: () => { state.ops.push(["single"]); return Promise.resolve(resolveQuery()); },
      then: (resolve, reject) => Promise.resolve(resolveQuery()).then(resolve, reject),
    };
    return query;
  };
  const client = {
    auth: {
      getClaims: async () => { calls.push(["auth", "getClaims"]); return claimsError ? { data: null, error: claimsError } : { data: userId ? { claims: { sub: userId } } : null, error: null }; },
      exchangeCodeForSession: async (code) => { calls.push(["auth", "exchange", code]); return { error: null }; },
      signOut: async (options) => { calls.push(["auth", "signOut", options]); return { error: null }; },
    },
    from: (table) => { calls.push([table, "from"]); return builder(table); },
    storage: {
      from: (bucket) => ({
        download: async (path) => { calls.push(["storage", "download", bucket, path]); return download; },
        remove: async (paths) => { calls.push(["storage", "remove", bucket, paths]); return { data: [], error: null }; },
        createSignedUrl: async (path, seconds) => { calls.push(["storage", "sign", bucket, path, seconds]); return { data: { signedUrl: `https://signed.example/${path}` }, error: null }; },
      }),
    },
  };
  return { client, calls };
}

export function actionStubs(client, extra = {}) {
  const revalidated = [];
  return {
    revalidated,
    stubs: {
      "@/lib/supabase/server": { createClient: async (options) => { client.lastOptions = options; return client; } },
      "next/cache": { revalidatePath: (path) => revalidated.push(path) },
      ...extra,
    },
  };
}
