"use client";

import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  getBrowserSupabase,
  getBrowserSupabaseStatus,
} from "@/integrations/supabase/client";
import { loadUserProfile } from "@/integrations/supabase/auth";
import type { UserProfile } from "@/lib/types";

type AuthStatus = "loading" | "anon" | "authed" | "guest";

interface AuthState {
  status: AuthStatus;
  userId: string;
  profile: UserProfile | null;
  session: Session | null;
  accessToken: string | null;
  supabaseReady: boolean;
  error: string | null;
}

const GUEST_KEY = "corvus_guest_profile";

const initial: AuthState = {
  status: "loading",
  userId: "",
  profile: null,
  session: null,
  accessToken: null,
  supabaseReady: false,
  error: null,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>(initial);

  useEffect(() => {
    let cancelled = false;
    const runtime = getBrowserSupabaseStatus();

    if (!runtime.configured) {
      const guest = readGuestState(runtime.configured);
      setState(
        guest ?? {
          status: "anon",
          userId: "",
          profile: null,
          session: null,
          accessToken: null,
          supabaseReady: false,
          error: `Supabase publico ausente: ${runtime.missing.join(", ")}`,
        }
      );
      return;
    }

    const supabase = getBrowserSupabase();

    async function applySession(session: Session | null) {
      if (!session?.user) {
        const guest = readGuestState(runtime.configured);
        if (!cancelled) {
          setState(
            guest ?? {
              status: "anon",
              userId: "",
              profile: null,
              session: null,
              accessToken: null,
              supabaseReady: true,
              error: null,
            }
          );
        }
        return;
      }

      const { profile, error } = await loadUserProfile(supabase, session.user);
      if (cancelled) return;
      setState({
        status: "authed",
        userId: session.user.id,
        profile,
        session,
        accessToken: session.access_token,
        supabaseReady: true,
        error,
      });
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error && !cancelled) {
        setState({
          status: "anon",
          userId: "",
          profile: null,
          session: null,
          accessToken: null,
          supabaseReady: true,
          error: error.message,
        });
        return;
      }
      void applySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => {
        void applySession(session);
      }, 0);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const loginEmail = useCallback(async (email: string, password: string) => {
    const runtime = getBrowserSupabaseStatus();
    if (!runtime.configured) {
      throw new Error(`Supabase publico ausente: ${runtime.missing.join(", ")}`);
    }

    const supabase = getBrowserSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;

    window.sessionStorage.removeItem(GUEST_KEY);
    const { profile, error: profileError } = await loadUserProfile(
      supabase,
      data.user
    );
    setState({
      status: "authed",
      userId: data.user.id,
      profile,
      session: data.session,
      accessToken: data.session.access_token,
      supabaseReady: true,
      error: profileError,
    });
  }, []);

  const loginGuest = useCallback(() => {
    const runtime = getBrowserSupabaseStatus();
    const guest = createGuestState(runtime.configured);
    writeGuestProfile(guest);
    setState(guest);
  }, []);

  const logout = useCallback(async () => {
    const runtime = getBrowserSupabaseStatus();
    if (runtime.configured) {
      try {
        await getBrowserSupabase().auth.signOut();
      } catch {
        /* noop */
      }
    }
    window.sessionStorage.removeItem(GUEST_KEY);
    setState({
      status: "anon",
      userId: "",
      profile: null,
      session: null,
      accessToken: null,
      supabaseReady: runtime.configured,
      error: runtime.configured
        ? null
        : `Supabase publico ausente: ${runtime.missing.join(", ")}`,
    });
  }, []);

  return { ...state, loginEmail, loginGuest, logout };
}

function createGuestState(supabaseReady: boolean): AuthState {
  const id = `convidado_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  return {
    status: "guest",
    userId: id,
    profile: { id, nome: "Convidado", tipo: "convidado" },
    session: null,
    accessToken: null,
    supabaseReady,
    error: null,
  };
}

function writeGuestProfile(state: AuthState): void {
  try {
    window.sessionStorage.setItem(
      GUEST_KEY,
      JSON.stringify({
        id: state.userId,
        profile: state.profile,
      })
    );
  } catch {
    /* sessionStorage indisponivel */
  }
}

function readGuestState(supabaseReady: boolean): AuthState | null {
  try {
    const raw = window.sessionStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      id?: string;
      profile?: UserProfile;
    };
    if (!parsed.id || !parsed.profile) return null;
    return {
      status: "guest",
      userId: parsed.id,
      profile: parsed.profile,
      session: null,
      accessToken: null,
      supabaseReady,
      error: null,
    };
  } catch {
    return null;
  }
}
