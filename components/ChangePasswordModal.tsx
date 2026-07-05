"use client";

import { useEffect, useMemo, useState } from "react";

type ChangePasswordModalProps = {
  open: boolean;
  onClose: () => void;
};

type Strength = {
  label: string;
  percent: number;
  color: string;
};

function getStrength(password: string): Strength {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[a-z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) {
    return { label: "Weak", percent: 25, color: "bg-red-500" };
  }

  if (score <= 3) {
    return { label: "Fair", percent: 50, color: "bg-orange-400" };
  }

  if (score <= 5) {
    return { label: "Good", percent: 75, color: "bg-emerald-400" };
  }

  return { label: "Strong", percent: 100, color: "bg-sky-400" };
}

export default function ChangePasswordModal({
  open,
  onClose,
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getStrength(newPassword), [newPassword]);

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setStatus("");
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  async function handleSubmit() {
    setStatus("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setStatus("Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      setStatus("New passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setStatus("Password must be at least 6 characters");
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

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus(data?.error || "Failed to change password");
        return;
      }

      setStatus("Password changed successfully. Logging out...");

      await fetch("/api/auth/logout", { method: "POST" });
      window.location.href = "/login?passwordChanged=1";
    } catch {
      setStatus("Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0b0b0b] p-6 text-white shadow-2xl backdrop-blur"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Change Password</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Update your password and you will be signed out afterwards.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-300 transition hover:bg-white/10"
          >
            ✕
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-200">
              Current password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-emerald-400/40"
              placeholder="Current password"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-200">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-emerald-400/40"
              placeholder="New password"
            />

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Password strength</span>
                <span>{strength.label}</span>
              </div>

              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all ${strength.color}`}
                  style={{ width: `${strength.percent}%` }}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-zinc-200">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition focus:border-emerald-400/40"
              placeholder="Confirm new password"
            />
          </div>

          {status && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-300">
              {status}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
