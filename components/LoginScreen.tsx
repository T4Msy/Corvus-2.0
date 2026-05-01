"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, LockKeyhole, Mail, ShieldAlert, UserRound } from "lucide-react";

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
      setError(err instanceof Error ? err.message : "Credenciais inválidas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="login-bg" aria-hidden="true" />
      <motion.section
        className="login-panel"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="login-brand">
          <Image src={logoSrc} alt="Corvus" width={56} height={56} priority />
          <p className="eyebrow">MSY · Corvus</p>
          <h1>Acesso</h1>
          <span>Inteligência institucional</span>
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
