"use client";

import Navbar from "@/components/Navbar";
import { useEffect, useMemo, useState } from "react";

type HallOfFameEntry = {
  id: number;
  name: string;
  reason: string;
  image_url: string | null;
  created_at: string;
  created_by?: number | null;
  created_by_username?: string | null;
};

type HallOfFameResponse = {
  entries: HallOfFameEntry[];
};

type AppUser = {
  id: number;
  username: string;
  role: "member" | "officer" | "owner";
};

type AuthMeResponse =
  | { user?: AppUser | null; role?: AppUser["role"] | null }
  | AppUser
  | null;

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default function HallOfFamePage() {
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [role, setRole] = useState<AppUser["role"] | null>(null);

  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const canAdd = role === "owner";
  const isEditing = editId !== null;

  const featuredEntry = useMemo(() => entries[0] ?? null, [entries]);

  useEffect(() => {
    async function load() {
      setLoading(true);

      try {
        const [hofRes, authRes] = await Promise.all([
          fetch("/api/hall-of-fame", { cache: "no-store" }),
          fetch("/api/auth/me", { cache: "no-store" }),
        ]);

        if (hofRes.ok) {
          const data: HallOfFameResponse = await hofRes.json();
          setEntries(Array.isArray(data.entries) ? data.entries : []);
        } else {
          setEntries([]);
        }

        if (authRes.ok) {
          const authData: AuthMeResponse = await authRes.json();

          const resolvedUser =
            authData && "user" in authData
              ? authData.user ?? null
              : authData && "role" in authData
              ? (authData as AppUser)
              : (authData as AppUser | null);

          setRole(resolvedUser?.role ?? "member");
        } else {
          setRole("member");
        }
      } catch {
        setEntries([]);
        setRole("member");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  function startEdit(entry: HallOfFameEntry) {
    setEditId(entry.id);
    setName(entry.name);
    setReason(entry.reason);
    setImageUrl(entry.image_url ?? "");
    setStatus("");
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditId(null);
    setName("");
    setReason("");
    setImageUrl("");
    setStatus("");
  }

  async function refreshEntries() {
    const refreshed = await fetch("/api/hall-of-fame", {
      cache: "no-store",
    });

    if (refreshed.ok) {
      const next: HallOfFameResponse = await refreshed.json();
      setEntries(Array.isArray(next.entries) ? next.entries : []);
    }
  }

  async function handleSubmit() {
    if (!canAdd) {
      setStatus("Owner only");
      return;
    }

    const trimmedName = name.trim();
    const trimmedReason = reason.trim();
    const trimmedImage = imageUrl.trim();

    if (!trimmedName || !trimmedReason) {
      setStatus("Name and reason are required");
      return;
    }

    setSaving(true);
    setStatus("");

    try {
      const res = await fetch("/api/hall-of-fame", {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          isEditing
            ? {
                id: editId,
                name: trimmedName,
                reason: trimmedReason,
                image_url: trimmedImage,
              }
            : {
                name: trimmedName,
                reason: trimmedReason,
                image_url: trimmedImage,
              }
        ),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to save entry");
      }

      setName("");
      setReason("");
      setImageUrl("");
      setEditId(null);
      setStatus(isEditing ? "Entry updated" : "Added to Hall of Fame");

      await refreshEntries();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save entry");
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatus(""), 1800);
    }
  }

  async function handleDelete(entry: HallOfFameEntry) {
    if (!canAdd) return;

    const ok = window.confirm(`Remove ${entry.name} from Hall of Fame?`);
    if (!ok) return;

    setSaving(true);
    setStatus("");

    try {
      const res = await fetch(`/api/hall-of-fame?id=${entry.id}`, {
        method: "DELETE",
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to delete entry");
      }

      if (editId === entry.id) {
        cancelEdit();
      }

      setStatus("Entry removed");
      await refreshEntries();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to delete entry");
    } finally {
      setSaving(false);
      window.setTimeout(() => setStatus(""), 1800);
    }
  }

  return (
    <>
      <Navbar />

      <main className="min-h-screen bg-black text-white">
        <section className="mx-auto max-w-7xl px-4 pb-10 pt-10 sm:px-6 lg:px-10">
          <div className="relative overflow-hidden rounded-[2rem] border border-yellow-400/20 bg-gradient-to-b from-[#121212] to-[#070707] p-6 shadow-[0_0_40px_rgba(234,179,8,0.06)] sm:p-10">
            <div className="pointer-events-none absolute inset-0 opacity-40 [background:radial-gradient(circle_at_top,rgba(250,204,21,0.18),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.10),transparent_30%)]" />
            <div className="relative">
              <div className="inline-flex items-center rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-semibold tracking-[0.24em] text-yellow-300">
                LEGENDS
              </div>

              <h1 className="mt-4 text-4xl font-black tracking-tight sm:text-6xl">
                Hall of Fame
              </h1>

              <p className="mt-4 max-w-2xl text-sm text-zinc-300 sm:text-base">
                A curated showcase of the people who made a real impact on MCWV.
                Hand-picked by the owner, framed like the legends they are.
              </p>

              <div className="mt-8 h-px w-full bg-gradient-to-r from-transparent via-yellow-400/70 to-transparent" />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
          {loading ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-400">
              Loading Hall of Fame...
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 text-zinc-300">
              No Hall of Fame entries yet.
            </div>
          ) : (
            <>
              {featuredEntry && (
                <div className="mb-8 rounded-[2rem] border border-yellow-400/20 bg-yellow-400/5 p-5 shadow-[0_0_30px_rgba(234,179,8,0.08)] sm:p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-yellow-300">
                    Featured
                  </p>
                  <div className="mt-3 grid gap-4 md:grid-cols-[160px_1fr] md:items-center">
                    <div className="mx-auto flex h-36 w-36 items-center justify-center overflow-hidden rounded-[1.5rem] border-2 border-yellow-400/40 bg-black/40 shadow-[0_0_24px_rgba(234,179,8,0.18)]">
                      {featuredEntry.image_url ? (
                        <img
                          src={featuredEntry.image_url}
                          alt={featuredEntry.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-yellow-400/20 to-yellow-600/10 text-3xl font-black text-yellow-200">
                          {getInitials(featuredEntry.name)}
                        </div>
                      )}
                    </div>

                    <div>
                      <h2 className="text-3xl font-black text-white sm:text-4xl">
                        {featuredEntry.name}
                      </h2>
                      <p className="mt-2 max-w-3xl text-zinc-300">
                        {featuredEntry.reason}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs">
                        <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-yellow-300">
                          Added {formatDate(featuredEntry.created_at)}
                        </span>
                        {featuredEntry.created_by_username && (
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                            By {featuredEntry.created_by_username}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {entries.map((entry, index) => {
                  const isFeatured = index === 0;

                  return (
                    <article
                      key={entry.id}
                      className={`
                        group relative overflow-hidden rounded-[2rem] border bg-[#0d0d0d] p-5
                        transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_28px_rgba(234,179,8,0.22)]
                        ${isFeatured ? "border-yellow-400/30" : "border-yellow-400/15"}
                      `}
                    >
                      <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 [background:radial-gradient(circle_at_top,rgba(250,204,21,0.12),transparent_40%)]" />
                      <div className="relative">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl border border-yellow-400/30 bg-gradient-to-br from-yellow-400/15 to-yellow-600/10 shadow-[0_0_20px_rgba(234,179,8,0.10)]">
                              {entry.image_url ? (
                                <img
                                  src={entry.image_url}
                                  alt={entry.name}
                                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                                />
                              ) : (
                                <span className="text-lg font-black text-yellow-200">
                                  {getInitials(entry.name)}
                                </span>
                              )}
                            </div>

                            <div>
                              <p className="text-xs uppercase tracking-[0.24em] text-yellow-300">
                                Hall of Fame
                              </p>
                              <h3 className="mt-1 text-xl font-bold text-white">
                                {entry.name}
                              </h3>
                            </div>
                          </div>

                          <span className="rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-xs font-semibold text-yellow-200">
                            #{String(index + 1).padStart(2, "0")}
                          </span>
                        </div>

                        <p className="mt-4 text-sm leading-6 text-zinc-300">
                          {entry.reason}
                        </p>

                        <div className="mt-5 flex flex-wrap gap-2 text-xs">
                          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                            Added {formatDate(entry.created_at)}
                          </span>
                          {entry.created_by_username && (
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-zinc-300">
                              By {entry.created_by_username}
                            </span>
                          )}
                        </div>

                        {canAdd && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startEdit(entry)}
                              className="rounded-full border border-yellow-400/25 bg-yellow-400/10 px-3 py-2 text-xs font-semibold text-yellow-200 transition hover:bg-yellow-400/15"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(entry)}
                              className="rounded-full border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:bg-red-400/15"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>

        {canAdd && (
          <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10" id="hof-form">
            <div className="rounded-[2rem] border border-yellow-400/20 bg-white/5 p-6 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-black text-white">
                    {isEditing ? "Edit Hall of Fame Entry" : "Add to Hall of Fame"}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    Owner only. Add or update a legend manually.
                  </p>
                </div>
                <p className="text-xs text-zinc-500">{status}</p>
              </div>

              <div className="mt-6 grid gap-4">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-200">
                    Name
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/40"
                    placeholder="Member name"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-200">
                    Reason
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={5}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/40"
                    placeholder="Why are they in the Hall of Fame?"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-zinc-200">
                    Image URL (optional)
                  </label>
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none transition placeholder:text-zinc-600 focus:border-yellow-400/40"
                    placeholder="https://..."
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving}
                    className="rounded-2xl bg-gradient-to-r from-yellow-400 to-yellow-600 px-5 py-3 font-bold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving
                      ? isEditing
                        ? "Updating..."
                        : "Adding..."
                      : isEditing
                      ? "Update Entry"
                      : "Add Legend"}
                  </button>

                  {isEditing && (
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-semibold text-white transition hover:bg-white/10"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
