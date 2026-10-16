import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./captions/validation";

/** Paths reachable without a session. Everything else requires sign-in. */
export const PUBLIC_PATHS = ["/explore", "/login", "/auth/callback"] as const;

export function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Where a visitor may be sent after signing in. Anything else falls back to Explore. */
export const RETURN_PATHS = ["/explore", "/rate", "/create"] as const;
export type ReturnPath = (typeof RETURN_PATHS)[number];
export const DEFAULT_RETURN_PATH: ReturnPath = "/explore";
/** Short-lived, non-sensitive cookie carrying the post-login destination through Google OAuth. */
export const RETURN_COOKIE = "caption_lab_next";

/** Allow-list only: never an absolute URL, protocol-relative URL, or unknown path. */
export function safeReturnPath(value: unknown): ReturnPath {
  return (RETURN_PATHS as readonly unknown[]).includes(value) ? (value as ReturnPath) : DEFAULT_RETURN_PATH;
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
