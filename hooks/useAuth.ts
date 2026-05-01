"use client";

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { UserProfile } from "@/lib/types";

interface AuthState {
  status: "loading" | "anon" | "authed" | "guest";
  userId: string;
  profile: UserProfile | null;
}

const initial: AuthState = {
  status: "loading",
  userId: "",
  profile: null,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(initial);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getBrowserSupabase();
        const { data } = await sb.auth.getSession();
        if (data.session) {
          const u = data.session.user;
          const { data: perfil } = await sb
            .from("msy_usuarios")
            .select("*")
            .eq("id", u.id)
            .single();
          if (cancelled) return;
          setState({
            status: "authed",
            userId: u.id,
            profile: (perfil ?? { id: u.id, nome: u.email ?? "Membro" }) as UserProfile,
          });
          return;
        }
        if (window.sessionStorage.getItem("corvus_convidado")) {
          enterAsGuest(setState);
          return;
        }
        if (cancelled) return;
        setState({ status: "anon", userId: "", profile: null });
      } catch (err) {
        console.error("[useAuth]", err);
        if (cancelled) return;
        setState({ status: "anon", userId: "", profile: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loginEmail = useCallback(async (email: string, password: string) => {
    const sb = getBrowserSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const { data: perfil } = await sb
      .from("msy_usuarios")
      .select("*")
      .eq("id", data.user.id)
      .single();
    setState({
      status: "authed",
      userId: data.user.id,
      profile: (perfil ?? { id: data.user.id, nome: data.user.email ?? "Membro" }) as UserProfile,
    });
  }, []);

  const loginGuest = useCallback(() => enterAsGuest(setState), []);

  const logout = useCallback(async () => {
    try {
      const sb = getBrowserSupabase();
      await sb.auth.signOut();
    } catch {
      /* noop */
    }
    window.sessionStorage.removeItem("corvus_convidado");
    setState({ status: "anon", userId: "", profile: null });
  }, []);

  return { ...state, loginEmail, loginGuest, logout };
}

function enterAsGuest(set: React.Dispatch<React.SetStateAction<AuthState>>) {
  const id = "convidado_" + Date.now();
  window.sessionStorage.setItem("corvus_convidado", "true");
  set({
    status: "guest",
    userId: id,
    profile: { id, nome: "Convidado", tipo: "convidado" },
  });
}
