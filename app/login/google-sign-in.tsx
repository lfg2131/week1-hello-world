"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GoogleSignIn() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setLoading(true);
    setError("");
    try {
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
