"use client";

import Link from "next/link";

export default function SignupPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-black text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.08),_transparent_55%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <div className="mb-8 text-center">
            <Link href="/" className="text-sm font-semibold tracking-[0.35em] text-zinc-300">
              MCWV
            </Link>
            <h1 className="mt-4 text-3xl font-bold">Create account</h1>
            <p className="mt-2 text-sm text-zinc-400">
              Make an account so your theme and future settings can stay with you.
            </p>
          </div>

          <form className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-200">
                Username
              </label>
              <input
                type="text"
                placeholder="Choose a username"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-200">
                Password
              </label>
              <input
                type="password"
                placeholder="Create a password"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-zinc-200">
                Confirm password
              </label>
              <input
                type="password"
                placeholder="Repeat your password"
                className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400/40"
              />
            </div>

            <button
              type="button"
              className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-black transition hover:opacity-90"
            >
              Create Account
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-zinc-400">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold text-emerald-300 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
