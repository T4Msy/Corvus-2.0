import type {
  CorvusSupabaseClient,
  Database,
  ThemePreference,
  UserProfileRow,
} from "@/integrations/supabase/types";
import type { UserProfile } from "@/lib/types";

type ProfileRowUpdate = Database["public"]["Tables"]["msy_usuarios"]["Update"];

const VALID_THEMES: readonly ThemePreference[] = ["dark", "light", "system"];

export type ProfileUpdate = {
  nome?: string | null;
  nome_interno?: string | null;
  avatar_url?: string | null;
  theme_preference?: ThemePreference;
};

function rowToProfile(row: UserProfileRow): UserProfile {
  return {
    id: row.id,
    nome: row.nome ?? undefined,
    nome_interno: row.nome_interno ?? undefined,
    cargo: row.cargo ?? undefined,
    sigla_cargo: row.sigla_cargo ?? undefined,
    tipo: row.tipo ?? "membro",
    avatar_url: row.avatar_url ?? undefined,
    theme_preference:
      row.theme_preference && VALID_THEMES.includes(row.theme_preference)
        ? row.theme_preference
        : "dark",
  };
}

const PROFILE_COLUMNS =
  "id,nome,nome_interno,cargo,sigla_cargo,tipo,avatar_url,theme_preference,preferences,created_at,updated_at";

/**
 * Carrega o perfil do usuário. Se a linha não existir ainda em `msy_usuarios`,
 * faz auto-provisionamento (insert default + select). Útil para usuários
 * recém-criados via Supabase Auth que ainda não têm profile row.
 */
export async function loadOrCreateProfile(
  supabase: CorvusSupabaseClient,
  userId: string,
  fallbackName: string
): Promise<{ profile: UserProfile; error: string | null }> {
  const { data, error } = await supabase
    .from("msy_usuarios")
    .select(PROFILE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    return {
      profile: {
        id: userId,
        nome: fallbackName,
        tipo: "membro",
        theme_preference: "dark",
      },
      error: error.message,
    };
  }

  if (data) {
    return { profile: rowToProfile(data as UserProfileRow), error: null };
  }

  const insertResult = await supabase
    .from("msy_usuarios")
    .insert({
      id: userId,
      nome: fallbackName,
      tipo: "membro",
      theme_preference: "dark",
    })
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (insertResult.error || !insertResult.data) {
    return {
      profile: {
        id: userId,
        nome: fallbackName,
        tipo: "membro",
        theme_preference: "dark",
      },
      error: insertResult.error?.message ?? "Falha ao criar perfil.",
    };
  }

  return {
    profile: rowToProfile(insertResult.data as UserProfileRow),
    error: null,
  };
}

export async function updateProfile(
  supabase: CorvusSupabaseClient,
  userId: string,
  patch: ProfileUpdate
): Promise<UserProfile> {
  const cleanPatch: ProfileRowUpdate = {};
  if (patch.nome !== undefined) cleanPatch.nome = patch.nome;
  if (patch.nome_interno !== undefined) cleanPatch.nome_interno = patch.nome_interno;
  if (patch.avatar_url !== undefined) cleanPatch.avatar_url = patch.avatar_url;
  if (patch.theme_preference !== undefined) {
    if (!VALID_THEMES.includes(patch.theme_preference)) {
      throw new Error("Tema invalido.");
    }
    cleanPatch.theme_preference = patch.theme_preference;
  }

  if (Object.keys(cleanPatch).length === 0) {
    const { data, error } = await supabase
      .from("msy_usuarios")
      .select(PROFILE_COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) {
      throw new Error(error?.message ?? "Perfil nao encontrado.");
    }
    return rowToProfile(data as UserProfileRow);
  }

  const { data, error } = await supabase
    .from("msy_usuarios")
    .update(cleanPatch)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Perfil nao encontrado para atualizar.");
  return rowToProfile(data as UserProfileRow);
}
