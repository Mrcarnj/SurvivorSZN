"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setErr(null);
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin}/auth/callback`,
      },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setSent(true);
  }

  return (
    <div className="wrap" style={{ maxWidth: 420, paddingTop: "clamp(40px, 12vh, 80px)" }}>
      <h1 style={{ fontSize: "clamp(28px, 9vw, 40px)", marginBottom: 6 }}>Hollydell Survivor Pool</h1>
      <p className="note" style={{ marginBottom: 20 }}>
        Enter the email the commissioner has on file. We&apos;ll send a sign-in link — no
        password to remember.
      </p>

      {sent ? (
        <div className="banner">
          Link sent to <strong>{email}</strong>. Open it on this device.
        </div>
      ) : (
        <>
          <input
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <button
            className="btn"
            style={{ marginTop: 12, width: "100%" }}
            type="button"
            disabled={busy || !email.includes("@")}
            onClick={send}
          >
            {busy ? "Sending…" : "Email me a link"}
          </button>
          {err && (
            <p className="err" style={{ marginTop: 10 }}>
              {err}
            </p>
          )}
        </>
      )}
    </div>
  );
}
