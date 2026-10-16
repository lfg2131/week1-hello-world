import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { RETURN_COOKIE, getVerifiedUserId, safeReturnPath } from "@/lib/auth";

function redirectTo(path: string) {
  // Fixed relative locations preserve the external origin behind Vercel's proxy.
  // Never build redirects from untrusted Host / X-Forwarded-Host or query input.
  return new Response(null, {
    status: 303,
    headers: {
      Location: path,
      "Cache-Control": "private, no-store",
      // One-time return destination: always cleared.
      "Set-Cookie": `${RETURN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`,
    },
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
    // Access depends only on a verified Supabase Auth identity. The return
    // path is allow-listed (/explore, /rate, /create), never a URL.
    const userId = await getVerifiedUserId(supabase);
    const next = safeReturnPath((await cookies()).get(RETURN_COOKIE)?.value);
    return redirectTo(userId ? next : "/login");
  } catch {
    // Provider errors, codes, and credentials never appear in URLs or logs.
    return redirectTo("/login");
  }
}
