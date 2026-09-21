import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function redirectTo(path: "/login" | "/protected") {
  // Relative redirects preserve the browser's origin on localhost and Vercel.
  return new Response(null, {
    status: 303,
    headers: { Location: path, "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const cookieToken = request.cookies.get("g_csrf_token")?.value;
    const bodyToken = form.get("g_csrf_token");
    if (!cookieToken || typeof bodyToken !== "string" || !bodyToken || cookieToken !== bodyToken) {
      return redirectTo("/login");
    }

    const credential = form.get("credential");
    if (typeof credential !== "string" || !credential.trim()) return redirectTo("/login");

    const supabase = await createClient({ writable: true });
    const { data, error } = await supabase.auth.signInWithIdToken({
      provider: "google",
      token: credential,
    });
    if (error || !data.session) return redirectTo("/login");

    return redirectTo("/protected");
  } catch {
    // Never expose credentials or provider errors in a URL, response, or log.
    return redirectTo("/login");
  }
}

export function GET() {
  return redirectTo("/login");
}
