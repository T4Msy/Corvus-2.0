"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light" | "gray";
const CYCLE: Theme[] = ["dark", "light", "gray"];
const STORAGE_KEY = "corvus_theme";

function readInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light" || stored === "gray") return stored;
  return "dark";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const initial = readInitial();
    setTheme(initial);
    document.body.setAttribute("data-theme", initial);
  }, []);

  const apply = useCallback((next: Theme) => {
    setTheme(next);
    document.body.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage indisponível */
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const idx = CYCLE.indexOf(current);
      const next = CYCLE[(idx + 1) % CYCLE.length];
      document.body.setAttribute("data-theme", next);
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  const label = labelFor(theme);
  const logoSrc = theme === "light" ? "/corvuslogolight.png" : "/corvuslogo.png";

  return { theme, setTheme: apply, toggle, label, logoSrc };
}

function labelFor(t: Theme): string {
  if (t === "dark") return "Escuro";
  if (t === "light") return "Claro";
  return "Cinza";
}
