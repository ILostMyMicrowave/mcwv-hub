"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthButton, AuthError, AuthField, AuthShell } from "@/components/AuthShell";

export default function ForgotPasswordPage() {
  const [discordUsername, setDiscordUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setDone("");

    const name = discordUsername.trim().replace(/^@+/, "");
    if (!name) {
      setError("Enter your Discord username.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordUsername: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't send a reset link.");
        return;
      }
      setDone(data?.message || "If that Discord is linked to a Hub login, you'll get a DM with a reset link.");
    } catch {
      setError("Can't reach the hub. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      title="Forgot password"
      subtitle="Enter your Discord username. If it's linked to a Hub login, MCWV-BOT DMs a reset link (can take up to a minute)."
      footer={
        <>
          Remembered it? <Link href="/login">Log in</Link>
        </>
      }
    >
      {done ? (
        <p style={{ textAlign: "center", color: "#c4b5fd", fontSize: "0.9rem", lineHeight: 1.55 }}>
          {done}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <AuthField
            id="discordUsername"
            label="Discord username"
            icon="@"
            value={discordUsername.replace(/^@+/, "")}
            onChange={(v) => setDiscordUsername(v.replace(/^@+/, ""))}
            placeholder="username"
            autoComplete="username"
            disabled={loading}
            delay="0.24s"
          />

          <AuthError message={error} />

          <AuthButton loading={loading} loadingText="Sending..." delay="0.32s">
            Send reset link
          </AuthButton>
        </form>
      )}
    </AuthShell>
  );
}
