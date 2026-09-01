"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthButton, AuthError, AuthField, AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Login failed");
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next");
      const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

      router.push(safeNext);
      router.refresh();
    } catch {
      setError("Can't reach the hub. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="MEMBER ACCESS"
      title="Log in"
      subtitle="Hub username and password."
      footer={
        <>
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
        </>
      }
    >
      <form onSubmit={handleLogin} className="space-y-5" noValidate>
        <AuthField
          id="username"
          label="Username"
          icon="👤"
          value={username}
          onChange={setUsername}
          placeholder="Enter your username"
          autoComplete="username"
          disabled={loading}
          delay="0.24s"
        />

        <AuthField
          id="password"
          label="Password"
          icon="🔒"
          value={password}
          onChange={setPassword}
          placeholder="Enter your password"
          autoComplete="current-password"
          disabled={loading}
          allowReveal
          delay="0.3s"
        />

        <AuthError message={error} />

        <AuthButton loading={loading} loadingText="Logging in..." delay="0.36s">
          Log In
        </AuthButton>

        <div className="forgot-wrap">
          <style jsx>{`
            .forgot-wrap {
              text-align: center;
              margin-top: 4px;
            }
            .forgot-wrap a {
              font-size: 0.8rem;
              font-weight: 600;
              color: #a78bfa;
            }
            .forgot-wrap a:hover { text-decoration: underline; }
          `}</style>
          <Link href="/forgot-password">Forgot password?</Link>
        </div>
      </form>
    </AuthShell>
  );
}
