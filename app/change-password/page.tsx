"use client";

import { useState } from "react";
import Navbar from "@/components/Navbar";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setStatus("");

    if (newPassword !== confirmPassword) {
      setStatus("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Failed");
      }

      setStatus("Password updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setStatus(err.message || "Error updating password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <h1 className="text-2xl font-bold">Change Password</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Update your account password securely.
          </p>

          <div className="mt-6 space-y-4">
            <input
              type="password"
              placeholder="Current password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3"
            />

            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3"
            />

            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl bg-black/40 border border-white/10 px-4 py-3"
            />

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-2xl bg-emerald-400 text-black font-semibold py-3 hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

            {status && (
              <p className="text-sm text-zinc-300 mt-2">{status}</p>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
