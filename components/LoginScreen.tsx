"use client";

import Image from "next/image";
import { useState } from "react";

interface Props {
  logoSrc: string;
  onLogin: (email: string, password: string) => Promise<void>;
  onGuest: () => void;
}

export function LoginScreen({ logoSrc, onLogin, onGuest }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  async function submit() {
    setErrMsg("");
    if (!email || !password) {
      setErrMsg("Preencha email e senha.");
      return;
    }
    setBusy(true);
    try {
      await onLogin(email, password);
    } catch {
      setErrMsg("Credenciais inválidas.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="loginScreen" className="login-screen" style={{ display: "flex" }}>
      <div className="login-bg">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
      </div>
      <div className="login-card">
        <div className="login-header">
          <Image
            src={logoSrc}
            alt="Corvus"
            className="login-logo-img"
            width={72}
            height={72}
            priority
          />
          <h1 className="login-title">CORVUS</h1>
          <span className="login-subtitle">Ordem Masayoshi</span>
        </div>
        {errMsg && (
          <div className="login-error" style={{ display: "block" }}>
            {errMsg}
          </div>
        )}
        <div className="login-form">
          <div className="login-field">
            <label htmlFor="loginEmail">Email</label>
            <input
              id="loginEmail"
              type="email"
              placeholder="seu@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="login-field">
            <label htmlFor="loginPassword">Senha</label>
            <input
              id="loginPassword"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>
          <button className="login-btn" onClick={submit} disabled={busy}>
            {busy ? "Aguarde..." : "Acessar"}
          </button>
          <button className="login-guest-btn" onClick={onGuest} disabled={busy}>
            Entrar como convidado
          </button>
        </div>
      </div>
    </div>
  );
}
