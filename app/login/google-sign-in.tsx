"use client";

import Script from "next/script";
import { useRef, useState } from "react";

type GoogleIdentity = {
  initialize: (options: { client_id: string; ux_mode: "redirect"; login_uri: string }) => void;
  renderButton: (element: HTMLElement, options: { theme: "outline"; size: "large"; text: "signin_with" }) => void;
};

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}

export default function GoogleSignIn() {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  if (!clientId) {
    return <p className="rounded-lg border border-zinc-700 p-4 text-zinc-300">Google sign-in is not configured yet.</p>;
  }

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        onReady={() => {
          const identity = window.google?.accounts.id;
          if (!identity || !container.current) {
            setFailed(true);
            return;
          }
          identity.initialize({
            client_id: clientId,
            ux_mode: "redirect",
            login_uri: `${window.location.origin}/auth/callback`,
          });
          container.current.replaceChildren();
          identity.renderButton(container.current, { theme: "outline", size: "large", text: "signin_with" });
        }}
        onError={() => setFailed(true)}
      />
      <div ref={container} className="min-h-11" />
      {failed && <p role="alert" className="text-amber-300">Google sign-in could not load. Please refresh and try again.</p>}
      <noscript>Enable JavaScript to sign in with Google.</noscript>
    </>
  );
}
