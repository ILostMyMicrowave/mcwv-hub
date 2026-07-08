"use client";

import { useEffect, useState } from "react";

type User = {
  id: number;
  username: string;
  theme?: string | null;
} | null;

export default function UserSync() {
  const [user, setUser] = useState<User>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("mcwv-theme");

    if (savedTheme) {
      document.documentElement.setAttribute("data-theme", savedTheme);
    }

    async function load() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        const nextUser: User = data?.user ?? null;

        setUser(nextUser);

        if (!savedTheme) {
          const theme = nextUser?.theme || "default";

          document.documentElement.setAttribute("data-theme", theme);
          localStorage.setItem("mcwv-theme", theme);
        }
      } catch {
        if (!savedTheme) {
          document.documentElement.setAttribute("data-theme", "default");
          localStorage.setItem("mcwv-theme", "default");
        }
      }
    }

    load();
  }, []);

  return null;
}
