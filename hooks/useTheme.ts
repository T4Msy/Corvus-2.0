"use client";

import { useCallback, useEffect, useState } from "react";
import type { ThemePreference } from "@/lib/types";

const STORAGE_KEY = "corvus.theme";
const VALID: readonly ThemePreference[] = ["dark", "light", "system"];

type Resolved = "dark" | "light";

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "dark";
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return VALID.includes(raw as ThemePreference) ? (raw as ThemePreference) : "dark";
}

function resolveTheme(pref: ThemePreference): Resolved {
  if (pref === "system") {
    if (typeof window === "undefined") return "dark";
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return pref;
}

function apply(resolved: Resolved): void {
  if (typeof document === "undefined") return;
  document.body.setAttribute("data-theme", resolved);
  document.documentElement.style.colorScheme = resolved;
}

/**
 * Tema com 3 modos: dark | light | system. `dark` é default.
 *
 * Não persiste no Supabase aqui — a tela de Settings chama updateProfile()
 * separadamente e em seguida invoca `setPreference()`. Local storage segura
 * a preferência entre reloads para evitar FOUC.
 */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>("dark");
  const [resolved, setResolved] = useState<Resolved>("dark");

  useEffect(() => {
    const initial = readStored();
    const initialResolved = resolveTheme(initial);
    setPreferenceState(initial);
    setResolved(initialResolved);
    apply(initialResolved);
  }, []);

  useEffect(() => {
    if (preference !== "system" || typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    function handle() {
      const next: Resolved = media.matches ? "light" : "dark";
      setResolved(next);
      apply(next);
    }
    media.addEventListener("change", handle);
    return () => media.removeEventListener("change", handle);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    if (!VALID.includes(next)) return;
    setPreferenceState(next);
    const r = resolveTheme(next);
    setResolved(r);
    apply(r);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage indisponivel */
    }
  }, []);

  const logoSrc = resolved === "light" ? "/corvuslogolight.png" : "/corvuslogo.png";

  return { preference, resolved, setPreference, logoSrc };
}
