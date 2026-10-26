import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Call only after verified server auth, for Caption Lab configuration/telemetry. */
export function createRuntimeClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Generation logging is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
