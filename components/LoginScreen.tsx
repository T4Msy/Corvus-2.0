"use client";

import Image from "next/image";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, LockKeyhole, Mail, Shield, UserRound } from "lucide-react";

interface Props {
  logoSrc: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onGuest: () => void;
  supabaseError?: string | null;
}

export function LoginScreen({
  logoSrc,
  onLogin,
  onGuest,
  supabaseError,
}: Props) {
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
      setError(
        err instanceof Error ? err.message : "Credenciais invalidas."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <div className="cinema-bg" aria-hidden="true" />
      <motion.section
        className="login-panel"
        initial={{ opacity: 0, y: 22, filter: "blur(12px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        transition={{ duration: 0.56, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="login-brand">
          <Image
            src={logoSrc}
            alt="Corvus"
            width={72}
            height={72}
            priority
          />
          <p className="eyebrow">MSY / Britannia</p>
          <h1>CORVUS</h1>
          <span>V3 Intelligence Core</span>
        </div>

        {(error || supabaseError) && (
          <div className="login-alert" role="alert">
            <Shield size={16} />
            <span>{error || supabaseError}</span>
          </div>
        )}

        <div className="login-form">
          <label className="login-field" htmlFor="login-email">
            <span>Email</span>
            <div>
              <Mail size={17} />
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="voce@msy.ai"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </label>

          <label className="login-field" htmlFor="login-password">
            <span>Senha</span>
            <div>
              <LockKeyhole size={17} />
              <input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="********"
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
            <span>{busy ? "Validando" : "Acessar"}</span>
            <ArrowRight size={17} />
          </button>

          <button
            type="button"
            className="secondary-action"
            disabled={busy}
            onClick={onGuest}
          >
            <UserRound size={17} />
            <span>Convidado</span>
          </button>
        </div>
      </motion.section>
    </main>
  );
}
