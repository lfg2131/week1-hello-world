import { redirect } from "next/navigation";
import GoogleSignIn from "./google-sign-in";
import { createClient } from "@/lib/supabase/server";
import { isProfileComplete } from "@/lib/profile";
import { AccountShell, ProfileUnavailable } from "@/app/components/account-shell";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (!error && data?.claims?.sub) {
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("first_name,last_name").eq("id", data.claims.sub).single();
    if (profileError || !profile) return <ProfileUnavailable />;
    redirect(isProfileComplete(profile) ? "/protected" : "/profile/complete");
  }
  return <AccountShell signedIn={false} tone="auth">
    <p className="status-auth">Week 3 · Your account</p>
    <h1 className="text-3xl font-bold text-indigo-100">Sign in with Google</h1>
    <p className="text-zinc-300">A few great games. A space of your own. Sign in to visit the protected page and personalize your profile.</p>
    <GoogleSignIn />
    <p className="text-sm text-zinc-400">The Public Games page is always available without an account.</p>
  </AccountShell>;
}
