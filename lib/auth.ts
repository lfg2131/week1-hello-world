import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./captions/validation";

/** Paths reachable without a session. Everything else requires sign-in. */
export const PUBLIC_PATHS = ["/login", "/auth/callback"] as const;

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * The verified user id from the session JWT (getClaims validates the token
 * signature). Never read a user id from forms, query strings, or the browser.
 */
export async function getVerifiedUserId(supabase: Pick<SupabaseClient, "auth">): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return !error && isUuid(sub) ? sub : null;
  } catch {
    return null;
  }
}
