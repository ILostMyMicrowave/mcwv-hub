"use client";

import { useEffect, useState } from "react";

export type Theme = "default" | "ice" | "inferno";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("default");

  // load saved theme
  useEffect(() => {
    const saved = localStorage.getItem("mcwv-theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  // apply theme globally
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("mcwv-theme", theme);
  }, [theme]);

  return { theme, setTheme };
}
