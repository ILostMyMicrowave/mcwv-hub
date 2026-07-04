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
    async function load() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await res.json();
        const nextUser: User = data?.user ?? null;

        setUser(nextUser);

        const theme = nextUser?.theme || "dark";
        document.documentElement.setAttribute("data-theme", theme);
      } catch {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    }

    load();
  }, []);

  return null;
}
