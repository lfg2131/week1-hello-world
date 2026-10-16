"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RETURN_COOKIE, type ReturnPath } from "@/lib/auth";

export default function GoogleSignIn({ next }: { next: ReturnPath }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setLoading(true);
    setError("");
    try {
      // Where to land after Google; the callback re-validates it against an allow-list.
      document.cookie = `${RETURN_COOKIE}=${next}; Path=/; Max-Age=600; SameSite=Lax; Secure`;
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch {
      setError("Google sign-in couldn’t start. Check your connection and try again.");
      setLoading(false);
    }
  }

  return <div className="space-y-3">
    <button type="button" className="btn-primary w-full text-lg" disabled={loading} aria-busy={loading} onClick={signIn}>
      {loading ? "Opening Google…" : "Continue with Google"}
    </button>
    {error && <p role="alert" className="alert-error">{error}</p>}
    <noscript><p className="alert-error">Enable JavaScript to sign in with Google.</p></noscript>
  </div>;
}
