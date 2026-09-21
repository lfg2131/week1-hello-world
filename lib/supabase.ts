import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "./supabase/env";

const { url, key } = getSupabaseEnv();

// Keep the public Assignment 2 query anonymous, even when a visitor signs in.
export const supabase = createClient(url, key, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
