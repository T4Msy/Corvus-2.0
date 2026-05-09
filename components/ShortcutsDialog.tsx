"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, X } from "lucide-react";

interface Shortcut {
  keys: string[];
  label: string;
}

const SECTIONS: Array<{ title: string; shortcuts: Shortcut[] }> = [
  {
    title: "Navegação",
    shortcuts: [
      { keys: ["Ctrl", "K"], label: "Abrir paleta de comandos" },
      { keys: ["Ctrl", "F"], label: "Buscar na conversa atual" },
      { keys: ["?"], label: "Mostrar atalhos de teclado" },
      { keys: ["Esc"], label: "Fechar painel / cancelar ação" },
    ],
  },
  {
    title: "Chat",
    shortcuts: [
      { keys: ["Ctrl", "Enter"], label: "Enviar mensagem" },
      { keys: ["Enter"], label: "Nova linha na mensagem" },
    ],
  },
  {
    title: "Conversa",
    shortcuts: [
      { keys: ["Novo chat"], label: "Abrir rascunho sem criar conversa vazia" },
      { keys: ["Clique no título"], label: "Renomear conversa inline" },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
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
            className="dialog-panel shortcuts-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Atalhos de teclado"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="dialog-header">
              <div className="shortcuts-heading">
                <Keyboard size={18} className="shortcuts-heading-icon" />
                <div>
                  <h2>Atalhos de teclado</h2>
                  <p>Comandos rápidos disponíveis no Corvus.</p>
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

            <div className="shortcuts-body">
              {SECTIONS.map((section) => (
                <section key={section.title} className="shortcuts-section">
                  <h3>{section.title}</h3>
                  <ul>
                    {section.shortcuts.map((s) => (
                      <li key={s.label}>
                        <span className="shortcut-label">{s.label}</span>
                        <span className="shortcut-keys">
                          {s.keys.map((key, i) => (
                            <span key={i}>
                              <kbd>{key}</kbd>
                              {i < s.keys.length - 1 && <span className="shortcut-plus">+</span>}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
