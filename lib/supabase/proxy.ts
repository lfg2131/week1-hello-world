import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";
import { getVerifiedUserId, isPublicPath } from "../auth";

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
  // auth routes. Pages and actions verify identity again on their own.
  let target: string | null = null;
  if (!userId && !isPublicPath(pathname)) target = "/login";
  else if (userId && (pathname === "/" || pathname === "/login")) target = "/rate";
  else if (!userId && pathname === "/") target = "/login";

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
