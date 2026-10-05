import { createClient } from "@/lib/supabase/server";
import { getVerifiedUserId } from "@/lib/auth";

function redirectTo(path: "/login" | "/rate") {
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
    // Access depends only on a verified Supabase Auth identity.
    const userId = await getVerifiedUserId(supabase);
    return redirectTo(userId ? "/rate" : "/login");
  } catch {
    // Provider errors, codes, and credentials never appear in URLs or logs.
    return redirectTo("/login");
  }
}
