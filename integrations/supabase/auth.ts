import type { User } from "@supabase/supabase-js";
import type { CorvusSupabaseClient } from "@/integrations/supabase/types";
import type { UserProfile } from "@/lib/types";

export type ProfileResult = {
  profile: UserProfile;
  error: string | null;
};

export function fallbackProfile(user: User): UserProfile {
  return {
    id: user.id,
    nome: user.email ?? "Membro",
    tipo: "membro",
  };
}

export async function loadUserProfile(
  supabase: CorvusSupabaseClient,
  user: User
): Promise<ProfileResult> {
  const fallback = fallbackProfile(user);

  const { data, error } = await supabase
    .from("msy_usuarios")
    .select("id,nome,nome_interno,cargo,sigla_cargo,tipo")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return {
      profile: fallback,
      error:
        error.message ||
        "Nao foi possivel carregar o perfil em msy_usuarios.",
    };
  }

  if (!data) {
    return {
      profile: fallback,
      error: null,
    };
  }

  return {
    profile: {
      id: data.id,
      nome: data.nome ?? undefined,
      nome_interno: data.nome_interno ?? undefined,
      cargo: data.cargo ?? undefined,
      sigla_cargo: data.sigla_cargo ?? undefined,
      tipo: data.tipo ?? "membro",
    },
    error: null,
  };
}
