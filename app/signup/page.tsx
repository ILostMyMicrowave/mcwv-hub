"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? "Signup failed");
        return;
      }

      router.push("/login");
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--background)" }}
    >
      <div
        className="w-full max-w-md"
        style={{ animation: "fadeInUp 0.6s ease-out forwards" }}
      >
        <div className="text-center mb-10">
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ color: "var(--foreground)" }}
          >
            MCWV
          </h1>
        </div>

        <div
          className="rounded-3xl border p-8"
          style={{
            background: "var(--card)",
            borderColor: "var(--border)",
            animation: "fadeInUp 0.6s ease-out forwards",
            animationDelay: "0.1s",
            opacity: 0,
          }}
        >
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold">Create account</h2>
            <p className="mt-2 text-zinc-400">
              Make an account so your theme and future settings can stay with you.
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-5">
            <div
              className="relative"
              style={{
                animation: "fadeInUp 0.4s ease-out forwards",
                animationDelay: "0.2s",
                opacity: 0,
              }}
            >
              <label
                htmlFor="username"
                className="absolute -top-2 left-3 bg-card px-1 text-xs text-zinc-400 transition-colors duration-200"
                style={{
                  background: "var(--card)",
                  color: focusedField === "username" ? "var(--primary)" : "var(--foreground)",
                }}
              >
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={() => setFocusedField("username")}
                onBlur={() => setFocusedField(null)}
                placeholder="Choose a username"
                className="w-full rounded-2xl border bg-zinc-950/50 px-4 py-3 text-white placeholder-zinc-600 transition-all duration-200 focus:outline-none"
                style={{
                  borderColor: focusedField === "username" ? "var(--primary)" : "var(--border)",
                }}
                disabled={loading}
              />
            </div>

            <div
              className="relative"
              style={{
                animation: "fadeInUp 0.4s ease-out forwards",
                animationDelay: "0.25s",
                opacity: 0,
              }}
            >
              <label
                htmlFor="password"
                className="absolute -top-2 left-3 bg-card px-1 text-xs text-zinc-400 transition-colors duration-200"
                style={{
                  background: "var(--card)",
                  color: focusedField === "password" ? "var(--primary)" : "var(--foreground)",
                }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                placeholder="Create a password"
                className="w-full rounded-2xl border bg-zinc-950/50 px-4 py-3 text-white placeholder-zinc-600 transition-all duration-200 focus:outline-none"
                style={{
                  borderColor: focusedField === "password" ? "var(--primary)" : "var(--border)",
                }}
                disabled={loading}
              />
            </div>

            <div
              className="relative"
              style={{
                animation: "fadeInUp 0.4s ease-out forwards",
                animationDelay: "0.3s",
                opacity: 0,
              }}
            >
              <label
                htmlFor="confirm"
                className="absolute -top-2 left-3 bg-card px-1 text-xs text-zinc-400 transition-colors duration-200"
                style={{
                  background: "var(--card)",
                  color: focusedField === "confirm" ? "var(--primary)" : "var(--foreground)",
                }}
              >
                Confirm password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onFocus={() => setFocusedField("confirm")}
                onBlur={() => setFocusedField(null)}
                placeholder="Repeat your password"
                className="w-full rounded-2xl border bg-zinc-950/50 px-4 py-3 text-white placeholder-zinc-600 transition-all duration-200 focus:outline-none"
                style={{
                  borderColor: focusedField === "confirm" ? "var(--primary)" : "var(--border)",
                }}
                disabled={loading}
              />
            </div>

            {error && (
              <div
                className="rounded-xl p-3 text-sm text-red-200 animate-shake"
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                }}
                role="alert"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full py-3 text-sm font-medium transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                background: "var(--primary)",
                color: "#000",
              }}
            >
              {loading ? "Creating..." : "Create Account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-400" style={{ animation: "fadeInUp 0.4s ease-out forwards", animationDelay: "0.4s", opacity: 0 }}>
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium hover:underline transition-colors"
              style={{ color: "var(--primary)" }}
            >
              Log in
            </Link>
          </p>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.5s ease-in-out; }
      `}</style>
    </main>
  );
}
