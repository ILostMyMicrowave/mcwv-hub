"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { AuthButton, AuthError, AuthField, AuthShell } from "@/components/AuthShell";

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = (searchParams.get("token") || "").trim();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!token) {
      setError("This reset link is missing a token. Request a new one.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Couldn't reset that password.");
        return;
      }
      setDone(true);
      window.setTimeout(() => router.push("/login"), 1400);
    } catch {
      setError("Can't reach the hub. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="ACCOUNT RECOVERY"
      title="Set a new password"
      subtitle="No current password needed. Pick a new one and you're in."
      footer={
        <>
          Back to <Link href="/login">log in</Link>
        </>
      }
    >
      {done ? (
        <p style={{ textAlign: "center", color: "#6ee7b7", fontSize: "0.9rem" }}>
          Password updated. Taking you to log in...
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <AuthField
            id="password"
            label="New password"
            icon="🔒"
            value={password}
            onChange={setPassword}
            placeholder="New password"
            autoComplete="new-password"
            disabled={loading}
            allowReveal
            delay="0.24s"
          />
          <AuthField
            id="confirm"
            label="Confirm password"
            icon="🔐"
            value={confirm}
            onChange={setConfirm}
            placeholder="Repeat new password"
            autoComplete="new-password"
            disabled={loading}
            allowReveal
            delay="0.3s"
          />
          <AuthError message={error} />
          <AuthButton loading={loading} loadingText="Saving..." delay="0.36s">
            Save password
          </AuthButton>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
