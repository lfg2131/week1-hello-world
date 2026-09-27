import { createClient } from "@/lib/supabase/server";
import { isProfileComplete } from "@/lib/profile";

function redirectTo(path: "/login" | "/protected" | "/profile/complete" | "/profile") {
  // Fixed relative locations preserve the external origin behind Vercel's proxy.
  // Never build redirects from untrusted Host / X-Forwarded-Host or query input.
  return new Response(null, {
    status: 303,
    headers: { Location: path, "Cache-Control": "private, no-store" },
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  if (!code) return redirectTo("/login");

  try {
    const supabase = await createClient({ writable: true });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectTo("/login");
    const { data, error: authError } = await supabase.auth.getClaims();
    if (authError || !data?.claims?.sub) return redirectTo("/login");
    const { data: profile, error: profileError } = await supabase.from("profiles")
      .select("first_name,last_name").eq("id", data.claims.sub).single();
    // The database trigger owns creation. This page displays a recoverable error.
    if (profileError || !profile) return redirectTo("/profile");
    return redirectTo(isProfileComplete(profile) ? "/protected" : "/profile/complete");
  } catch {
    // Provider errors, codes, and credentials never appear in URLs or logs.
    return redirectTo("/login");
  }
}
