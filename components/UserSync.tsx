"use client";

import { useEffect, useState } from "react";

type User = {
  id: number;
  username: string;
  theme?: string | null;
} | null;

const THEMES = new Set(["default", "ice", "inferno"]);

function safeTheme(value: string | null | undefined) {
  return value && THEMES.has(value) ? value : "default";
}

export default function UserSync() {
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    const rawSaved = localStorage.getItem("mcwv-theme");
    const savedTheme = safeTheme(rawSaved);

    if (rawSaved) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }

    async function load() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        const nextUser: User = data?.user ?? null;

        setUser(nextUser);

        if (!rawSaved) {
          const theme = safeTheme(nextUser?.theme);

          document.documentElement.setAttribute("data-theme", theme);
          localStorage.setItem("mcwv-theme", theme);
        }
      } catch {
        if (!rawSaved) {
          document.documentElement.setAttribute("data-theme", "default");
          localStorage.setItem("mcwv-theme", "default");
        }
      }
    }

    load();
  }, []);

  return null;
}
