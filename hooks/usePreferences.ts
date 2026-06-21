"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserProfile } from "@/lib/types";
import { FRIENDLY_ERROR } from "@/lib/ui-messages";

interface ProfileEnvelope {
  ok?: boolean;
  profile?: UserProfile;
  error?: { message?: string } | string | null;
}

interface State {
  profile: UserProfile | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
}

interface Args {
  accessToken: string | null | undefined;
  enabled: boolean;
  fallbackName?: string;
  /** Disparado quando o profile é carregado/atualizado para sincronizar useAuth e useTheme. */
  onProfile?: (profile: UserProfile) => void;
}

type ProfilePatch = {
  nome?: string;
  nome_interno?: string;
  avatar_url?: string | null;
  theme_preference?: UserProfile["theme_preference"];
};

const initial: State = { profile: null, loading: false, saving: false, error: null };

export function usePreferences({
  accessToken,
  enabled,
  fallbackName,
  onProfile,
}: Args) {
  const [state, setState] = useState<State>(initial);
  const lastTokenRef = useRef<string | null>(null);
  const onProfileRef = useRef(onProfile);

  useEffect(() => {
    onProfileRef.current = onProfile;
  }, [onProfile]);

  useEffect(() => {
    if (!enabled || !accessToken) {
      setState(initial);
      lastTokenRef.current = null;
      return;
    }
    if (lastTokenRef.current === accessToken) return;
    lastTokenRef.current = accessToken;

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        const res = await fetch("/api/profile", {
          method: "GET",
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            ...(fallbackName ? { "x-corvus-fallback-name": fallbackName } : {}),
          },
        });
        const data = (await res.json().catch(() => null)) as ProfileEnvelope | null;
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data.profile) {
          console.error("[corvus] perfil (carregar): HTTP", res.status, data?.error);
          setState({ profile: null, loading: false, saving: false, error: FRIENDLY_ERROR });
          return;
        }
        setState({ profile: data.profile, loading: false, saving: false, error: null });
        onProfileRef.current?.(data.profile);
      } catch (err) {
        if (cancelled) return;
        console.error("[corvus] perfil (carregar):", err);
        setState({
          profile: null,
          loading: false,
          saving: false,
          error: FRIENDLY_ERROR,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, enabled, fallbackName]);

  const updateProfile = useCallback(
    async (patch: ProfilePatch): Promise<UserProfile | null> => {
      if (!accessToken) {
        setState((s) => ({ ...s, error: "Sessao Supabase ausente." }));
        return null;
      }
      setState((s) => ({ ...s, saving: true, error: null }));
      try {
        const res = await fetch("/api/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(patch),
        });
        const data = (await res.json().catch(() => null)) as ProfileEnvelope | null;
        if (!res.ok || !data?.ok || !data.profile) {
          console.error("[corvus] perfil (salvar): HTTP", res.status, data?.error);
          setState((s) => ({ ...s, saving: false, error: FRIENDLY_ERROR }));
          return null;
        }
        setState({ profile: data.profile, loading: false, saving: false, error: null });
        onProfileRef.current?.(data.profile);
        return data.profile;
      } catch (err) {
        console.error("[corvus] perfil (salvar):", err);
        setState((s) => ({
          ...s,
          saving: false,
          error: FRIENDLY_ERROR,
        }));
        return null;
      }
    },
    [accessToken]
  );

  return {
    profile: state.profile,
    loading: state.loading,
    saving: state.saving,
    error: state.error,
    updateProfile,
  };
}
