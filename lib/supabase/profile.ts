import { redirect } from "next/navigation";
import { createClient } from "./server";
import type { Profile } from "../profile";

export async function requireProfile() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("first_name,last_name,avatar_url")
    .eq("id", data.claims.sub)
    .single();
  return {
    profile: profileError ? null : profile as Profile | null,
    email: typeof data.claims.email === "string" ? data.claims.email : "",
  };
}
