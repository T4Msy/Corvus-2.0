"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Trash2,
  X,
} from "lucide-react";
import type { ThemePreference, UserProfile } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  profile: UserProfile | null;
  avatarSrc?: string | null;
  loading: boolean;
  saving: boolean;
  avatarBusy?: boolean;
  error: string | null;
  themePreference: ThemePreference;
  isGuest: boolean;
  onSetTheme: (next: ThemePreference) => void;
  onUpdateProfile: (patch: {
    nome?: string;
    nome_interno?: string;
    avatar_url?: string | null;
    theme_preference?: ThemePreference;
  }) => Promise<UserProfile | null>;
  onUploadAvatar?: (file: File) => Promise<void>;
  onRemoveAvatar?: () => Promise<void>;
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
  avatarSrc,
  loading,
  saving,
  avatarBusy = false,
  error,
  themePreference,
  isGuest,
  onSetTheme,
  onUpdateProfile,
  onUploadAvatar,
  onRemoveAvatar,
  onLogout,
}: Props) {
  const [nome, setNome] = useState("");
  const [nomeInterno, setNomeInterno] = useState("");
  const [feedback, setFeedback] = useState<{
    type: "ok" | "error";
    message: string;
  } | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setFeedback(null);
      setConfirmLogout(false);
      return;
    }
    setNome(profile?.nome ?? "");
    setNomeInterno(profile?.nome_interno ?? "");
  }, [open, profile]);

  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const id = window.setTimeout(() => closeButtonRef.current?.focus(), 20);

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener("keydown", onKey);
      restoreFocusRef.current?.focus();
    };
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

  async function handleAvatarFile(file: File | undefined) {
    if (!file || !onUploadAvatar) return;
    if (!file.type.startsWith("image/")) {
      setFeedback({ type: "error", message: "Escolha uma imagem." });
      return;
    }
    await onUploadAvatar(file);
  }

  async function handleRemoveAvatar() {
    if (!onRemoveAvatar) return;
    await onRemoveAvatar();
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
            ref={panelRef}
            className="dialog-panel settings-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Configurações"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="dialog-header settings-dialog-header">
              <div className="settings-title-lockup">
                <span className="settings-header-mark">
                  <Monitor size={17} />
                </span>
                <div>
                  <h2>Configurações</h2>
                  <p>Identidade, aparência e sessão do Corvus.</p>
                </div>
              </div>
              <button
                ref={closeButtonRef}
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

              <div className="profile-card settings-profile-card">
                <div className="profile-card-avatar">
                  {avatarSrc ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={avatarSrc} alt="" />
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
                <span className="settings-profile-badge">
                  {isGuest ? "Local" : "Sincronizado"}
                </span>
              </div>

              {!isGuest && (
                <>
                  <div className="avatar-actions">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      className="sr-only"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        void handleAvatarFile(file);
                      }}
                    />
                    <button
                      type="button"
                      className="secondary-action sm"
                      disabled={loading || saving || avatarBusy}
                      onClick={() => avatarInputRef.current?.click()}
                    >
                      <Camera size={14} />
                      <span>{avatarBusy ? "Enviando..." : "Alterar avatar"}</span>
                    </button>
                    {profile?.avatar_url && (
                      <button
                        type="button"
                        className="danger-action sm"
                        disabled={loading || saving || avatarBusy}
                        onClick={() => void handleRemoveAvatar()}
                      >
                        <Trash2 size={14} />
                        <span>Remover</span>
                      </button>
                    )}
                  </div>

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
              {confirmLogout ? (
                <div className="logout-confirm">
                  <span>
                    {isGuest
                      ? "Sair do modo convidado? O histórico desta sessão será perdido."
                      : "Tem certeza que deseja sair?"}
                  </span>
                  <div className="logout-confirm-actions">
                    <button
                      type="button"
                      className="danger-action sm"
                      onClick={() => {
                        onClose();
                        onLogout();
                      }}
                    >
                      <LogOut size={14} />
                      <span>Confirmar saída</span>
                    </button>
                    <button
                      type="button"
                      className="secondary-action sm"
                      onClick={() => setConfirmLogout(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="danger-action"
                  onClick={() => setConfirmLogout(true)}
                >
                  <LogOut size={15} />
                  <span>{isGuest ? "Sair do modo convidado" : "Sair"}</span>
                </button>
              )}
            </section>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
