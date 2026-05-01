"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  LogOut,
  Monitor,
  Moon,
  Sun,
  X,
} from "lucide-react";
import type { ThemePreference, UserProfile } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  themePreference: ThemePreference;
  isGuest: boolean;
  onSetTheme: (next: ThemePreference) => void;
  onUpdateProfile: (patch: {
    nome?: string;
    nome_interno?: string;
    theme_preference?: ThemePreference;
  }) => Promise<UserProfile | null>;
  onLogout: () => void;
}

const THEMES: { value: ThemePreference; label: string; icon: React.ReactNode }[] = [
  { value: "dark", label: "Escuro", icon: <Moon size={16} /> },
  { value: "light", label: "Claro", icon: <Sun size={16} /> },
  { value: "system", label: "Sistema", icon: <Monitor size={16} /> },
];

export function SettingsDialog({
  open,
  onClose,
  profile,
  loading,
  saving,
  error,
  themePreference,
  isGuest,
  onSetTheme,
  onUpdateProfile,
  onLogout,
}: Props) {
  const [nome, setNome] = useState("");
  const [nomeInterno, setNomeInterno] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setFeedback(null);
      return;
    }
    setNome(profile?.nome ?? "");
    setNomeInterno(profile?.nome_interno ?? "");
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleSaveProfile() {
    if (isGuest) return;
    const patch: { nome?: string; nome_interno?: string } = {};
    const trimNome = nome.trim();
    const trimInterno = nomeInterno.trim();
    if (trimNome !== (profile?.nome ?? "")) patch.nome = trimNome;
    if (trimInterno !== (profile?.nome_interno ?? "")) {
      patch.nome_interno = trimInterno;
    }
    if (Object.keys(patch).length === 0) {
      setFeedback({ type: "ok", message: "Nada para salvar." });
      return;
    }
    const result = await onUpdateProfile(patch);
    if (result) {
      setFeedback({ type: "ok", message: "Perfil atualizado." });
    } else {
      setFeedback({ type: "error", message: "Falha ao salvar." });
    }
  }

  async function handleSetTheme(next: ThemePreference) {
    onSetTheme(next);
    if (isGuest) return;
    const result = await onUpdateProfile({ theme_preference: next });
    if (!result) {
      setFeedback({
        type: "error",
        message: "Tema aplicado, mas falhou ao salvar no servidor.",
      });
    }
  }

  const inicial = (
    profile?.nome_interno ||
    profile?.nome ||
    "?"
  )
    .charAt(0)
    .toUpperCase();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="dialog-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onClose}
          role="presentation"
        >
          <motion.div
            className="dialog-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Configurações"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="dialog-header">
              <div>
                <h2>Configurações</h2>
                <p>Perfil e preferências da sua sessão.</p>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Fechar"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </header>

            {error && (
              <div className="dialog-alert" role="alert">
                <AlertCircle size={16} />
                <span>{error}</span>
              </div>
            )}

            <section className="dialog-section">
              <h3>Perfil</h3>

              <div className="profile-card">
                <div className="profile-card-avatar">
                  {profile?.avatar_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={profile.avatar_url} alt="" />
                  ) : (
                    <span>{inicial}</span>
                  )}
                </div>
                <div className="profile-card-meta">
                  <strong>{profile?.nome_interno || profile?.nome || "—"}</strong>
                  <span>
                    {profile?.cargo
                      ? `${profile.cargo}${profile.sigla_cargo ? ` · ${profile.sigla_cargo}` : ""}`
                      : isGuest
                        ? "Convidado"
                        : "Membro"}
                  </span>
                </div>
              </div>

              {!isGuest && (
                <>
                  <label className="dialog-field">
                    <span>Nome</span>
                    <input
                      type="text"
                      value={nome}
                      placeholder="Seu nome"
                      onChange={(e) => setNome(e.target.value)}
                      disabled={loading || saving}
                    />
                  </label>

                  <label className="dialog-field">
                    <span>Nome interno (MSY)</span>
                    <input
                      type="text"
                      value={nomeInterno}
                      placeholder="Como prefere ser chamado"
                      onChange={(e) => setNomeInterno(e.target.value)}
                      disabled={loading || saving}
                    />
                  </label>

                  <div className="dialog-field-actions">
                    <button
                      type="button"
                      className="primary-action sm"
                      onClick={handleSaveProfile}
                      disabled={saving || loading}
                    >
                      {saving ? "Salvando..." : "Salvar perfil"}
                    </button>
                    {feedback && (
                      <span
                        className={`dialog-feedback ${feedback.type}`}
                        role="status"
                      >
                        {feedback.type === "ok" ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <AlertCircle size={14} />
                        )}
                        {feedback.message}
                      </span>
                    )}
                  </div>
                </>
              )}

              {isGuest && (
                <p className="dialog-hint">
                  Como convidado, perfil e tema vivem só nesta sessão. Faça login
                  para sincronizar.
                </p>
              )}
            </section>

            <section className="dialog-section">
              <h3>Aparência</h3>

              <div className="theme-picker" role="radiogroup" aria-label="Tema">
                {THEMES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={themePreference === t.value}
                    className={`theme-option${
                      themePreference === t.value ? " active" : ""
                    }`}
                    onClick={() => void handleSetTheme(t.value)}
                  >
                    {t.icon}
                    <span>{t.label}</span>
                  </button>
                ))}
              </div>
              <p className="dialog-hint">
                {isGuest
                  ? "Salvo só no navegador. Faça login para sincronizar entre dispositivos."
                  : "Salvo no seu perfil — sincroniza entre dispositivos."}
              </p>
            </section>

            <section className="dialog-section">
              <h3>Sessão</h3>
              <button
                type="button"
                className="danger-action"
                onClick={() => {
                  onClose();
                  onLogout();
                }}
              >
                <LogOut size={15} />
                <span>{isGuest ? "Sair do modo convidado" : "Sair"}</span>
              </button>
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
