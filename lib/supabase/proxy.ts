import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";
import { RETURN_PATHS, getVerifiedUserId, isPublicPath, safeReturnPath } from "../auth";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, key } = getSupabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      },
    },
  });
  const userId = await getVerifiedUserId(supabase);
  const { pathname } = request.nextUrl;

  // Default-deny: every app route needs a session except the explicit public
  // routes (Explore, login, OAuth callback). Pages and actions verify again.
  let target: string | null = null;
  if (pathname === "/") target = "/explore";
  else if (userId && pathname === "/login") target = safeReturnPath(request.nextUrl.searchParams.get("next"));
  else if (!userId && pathname.startsWith("/api/")) {
    return NextResponse.json({ status: "error", message: "Your session expired. Sign in again." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  } else if (!userId && !isPublicPath(pathname)) {
    // Remember allow-listed destinations so sign-in returns there.
    target = (RETURN_PATHS as readonly string[]).includes(pathname) ? `/login?next=${pathname}` : "/login";
  }

  if (target) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // Carry refreshed/cleared auth cookies onto the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
