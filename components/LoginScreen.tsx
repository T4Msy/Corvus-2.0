"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Fingerprint,
  LockKeyhole,
  Mail,
  ShieldAlert,
  Sparkles,
  UserRound,
} from "lucide-react";

interface Props {
  logoSrc: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onGuest: () => void;
  supabaseError?: string | null;
}

export function LoginScreen({ logoSrc, onLogin, onGuest, supabaseError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!email.trim() || !password) {
      setError("Preencha email e senha.");
      return;
    }
    setBusy(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err) {
      console.error("[corvus] login:", err);
      setError("Não foi possível entrar. Confira o e-mail e a senha e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen rebuilt-login">
      <div className="login-bg" aria-hidden="true" />

      <motion.section
        className="login-hero-panel"
        initial={{ opacity: 0, x: -18 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="login-brand-lockup">
          <Image src={logoSrc} alt="Corvus" width={62} height={62} priority />
          <div>
            <p className="eyebrow">Ordem Masayoshi</p>
            <h1>Corvus</h1>
          </div>
        </div>

        <div className="login-hero-copy">
          <span className="login-system-pill">
            <Sparkles size={14} />
            Inteligência privada MSY
          </span>
          <p>
            Workspace premium para análise, decisão e memória estratégica com uma
            experiência silenciosa, precisa e profundamente contextual.
          </p>
        </div>

        <div className="login-signal-grid" aria-label="Capacidades">
          <span>
            <strong>Privado</strong>
            <small>sessão protegida</small>
          </span>
          <span>
            <strong>Contextual</strong>
            <small>perfil e memória</small>
          </span>
          <span>
            <strong>Operacional</strong>
            <small>execução e persistência</small>
          </span>
        </div>
      </motion.section>

      <motion.section
        className="login-panel auth-panel"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="auth-card-header">
          <span className="auth-access-chip">
            <Fingerprint size={14} />
            Acesso restrito
          </span>
          <div>
            <h2>Entrar no Corvus</h2>
            <p>Use suas credenciais MSY ou continue em modo convidado.</p>
          </div>
        </div>

        {(error || supabaseError) && (
          <div className="login-alert" role="alert">
            <ShieldAlert size={15} />
            <span>{error || supabaseError}</span>
          </div>
        )}

        <div className="login-form">
          <label className="login-field" htmlFor="login-email">
            <span>Email</span>
            <div>
              <Mail size={15} />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="você@msy.ai"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
              />
            </div>
          </label>

          <label className="login-field" htmlFor="login-password">
            <span>Senha</span>
            <div>
              <LockKeyhole size={15} />
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
              />
            </div>
          </label>

          <button
            type="button"
            className="primary-action"
            disabled={busy}
            onClick={submit}
          >
            <span>{busy ? "Validando…" : "Entrar"}</span>
            <ArrowRight size={15} />
          </button>

          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={onGuest}
          >
            <UserRound size={15} />
            <span>Continuar como convidado</span>
          </button>
        </div>
      </motion.section>
    </main>
  );
}
