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
      setError("Google sign-in could not start. Please try again or contact the app owner.");
      setLoading(false);
    }
  }

  return <div className="space-y-4">
    <button type="button" className="primary-button w-full" disabled={loading} onClick={signIn}>
      {loading ? "Connecting to Google…" : "Continue with Google"}
    </button>
    {error && <p role="alert" className="status-error">{error}</p>}
    <noscript>Enable JavaScript to sign in with Google.</noscript>
  </div>;
}
