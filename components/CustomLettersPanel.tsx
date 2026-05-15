"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Copy,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import {
  SYMBOL_CATEGORIES,
  UNICODE_STYLES,
  generateTextVariants,
} from "@/lib/custom-text";
import type { CompatibilityLevel } from "@/lib/custom-text";

interface Props {
  open: boolean;
  onClose: () => void;
}

type StyleFilter = "all" | CompatibilityLevel;

const MAX_INPUT_LENGTH = 280;

const STYLE_FILTERS: Array<{ value: StyleFilter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "stable", label: "Estáveis" },
  { value: "masayoshi", label: "Masayoshi" },
  { value: "experimental", label: "Premium" },
];

export function CustomLettersPanel({ open, onClose }: Props) {
  const toast = useToast();
  const [text, setText] = useState("Masayoshi");
  const [styleFilter, setStyleFilter] = useState<StyleFilter>("all");
  const [symbolCategoryId, setSymbolCategoryId] = useState(SYMBOL_CATEGORIES[0]?.id ?? "");
  const [symbolQuery, setSymbolQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const variants = useMemo(() => {
    const source = styleFilter === "all"
      ? UNICODE_STYLES
      : UNICODE_STYLES.filter((style) => style.level === styleFilter);
    return generateTextVariants(text.trim(), source);
  }, [styleFilter, text]);

  const activeCategory = useMemo(
    () =>
      SYMBOL_CATEGORIES.find((category) => category.id === symbolCategoryId) ??
      SYMBOL_CATEGORIES[0],
    [symbolCategoryId]
  );

  const visibleSymbols = useMemo(() => {
    const query = symbolQuery.trim().toLowerCase();
    if (!query) return activeCategory?.symbols ?? [];

    return SYMBOL_CATEGORIES.filter((category) =>
      [category.name, category.description, category.id]
        .join(" ")
        .toLowerCase()
        .includes(query)
    ).flatMap((category) => category.symbols);
  }, [activeCategory, symbolQuery]);

  async function copyValue(value: string, id: string, label: string) {
    if (!value) return;

    try {
      await writeClipboard(value);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1200);
      toast.push({
        tone: "success",
        title: "Copiado",
        message: `${label} pronto para colar.`,
      });
    } catch {
      toast.push({
        tone: "error",
        title: "Não foi possível copiar",
        message: "Selecione o texto manualmente e copie pelo sistema.",
      });
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            className="custom-letters-scrim"
            aria-label="Fechar letras personalizadas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            onClick={onClose}
          />
          <motion.aside
            className="custom-letters-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Letras personalizadas"
            initial={{ opacity: 0, x: 26 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 22 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="custom-letters-header">
              <div>
                <span className="custom-letters-eyebrow">
                  <Sparkles size={13} />
                  Ferramenta MSY
                </span>
                <h2>Letras Personalizadas</h2>
                <p>Fontes Unicode e símbolos para bio, nick, status e redes sociais.</p>
              </div>
              <button
                type="button"
                className="dialog-close"
                aria-label="Fechar letras personalizadas"
                onClick={onClose}
              >
                <X size={18} />
              </button>
            </header>

            <div className="custom-letters-body">
              <section className="custom-tool-section">
                <div className="custom-section-head">
                  <div>
                    <h3>Texto base</h3>
                    <p>{text.length}/{MAX_INPUT_LENGTH} caracteres</p>
                  </div>
                  <button
                    type="button"
                    className="custom-clear-button"
                    disabled={!text}
                    onClick={() => setText("")}
                  >
                    Limpar
                  </button>
                </div>
                <textarea
                  className="custom-textarea"
                  value={text}
                  maxLength={MAX_INPUT_LENGTH}
                  rows={4}
                  placeholder="Digite seu texto aqui..."
                  onChange={(event) => setText(event.target.value)}
                />
              </section>

              <section className="custom-tool-section">
                <div className="custom-section-head">
                  <div>
                    <h3>Estilos prontos</h3>
                    <p>Toque em qualquer opção para copiar.</p>
                  </div>
                </div>

                <div className="custom-filter-row" aria-label="Filtros de estilos">
                  {STYLE_FILTERS.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      className={styleFilter === filter.value ? "active" : ""}
                      onClick={() => setStyleFilter(filter.value)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>

                <div className="custom-style-list">
                  {variants.map((variant) => {
                    const copied = copiedId === `style-${variant.id}`;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        className="custom-style-card"
                        disabled={!variant.text}
                        onClick={() =>
                          copyValue(variant.text, `style-${variant.id}`, variant.name)
                        }
                      >
                        <span className="custom-style-preview">
                          {variant.text || "Digite um texto para gerar"}
                        </span>
                        <span className="custom-style-meta">
                          <span>
                            <strong>{variant.name}</strong>
                            <small>{variant.description}</small>
                          </span>
                          <span className="custom-style-badges">
                            {variant.premium && (
                              <span className="custom-badge premium">
                                <Star size={10} />
                                Premium
                              </span>
                            )}
                            <span
                              className={`custom-badge ${
                                variant.mobileSafe ? "safe" : "warning"
                              }`}
                            >
                              {variant.mobileSafe ? (
                                <Check size={10} />
                              ) : (
                                <AlertTriangle size={10} />
                              )}
                              {variant.mobileSafe ? "Mobile" : "Teste"}
                            </span>
                          </span>
                          <span className="custom-copy-icon" aria-hidden="true">
                            {copied ? <Check size={15} /> : <Copy size={15} />}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="custom-tool-section">
                <div className="custom-section-head">
                  <div>
                    <h3>Símbolos aesthetic</h3>
                    <p>Categoria organizada para compor bios e nomes.</p>
                  </div>
                </div>

                <label className="custom-symbol-search" htmlFor="custom-symbol-search">
                  <Search size={14} />
                  <input
                    id="custom-symbol-search"
                    value={symbolQuery}
                    type="search"
                    placeholder="Buscar categoria"
                    onChange={(event) => setSymbolQuery(event.target.value)}
                  />
                </label>

                <div className="custom-category-row" aria-label="Categorias de símbolos">
                  {SYMBOL_CATEGORIES.map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      className={category.id === activeCategory?.id ? "active" : ""}
                      onClick={() => {
                        setSymbolCategoryId(category.id);
                        setSymbolQuery("");
                      }}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>

                <div className="custom-symbol-grid">
                  {visibleSymbols.map((symbol, index) => {
                    const id = `symbol-${symbol}-${index}`;
                    const copied = copiedId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        className="custom-symbol-button"
                        title="Copiar símbolo"
                        aria-label={`Copiar ${symbol}`}
                        onClick={() => copyValue(symbol, id, "Símbolo")}
                      >
                        <span>{symbol}</span>
                        {copied && <Check size={12} />}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

async function writeClipboard(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  if (!ok) throw new Error("Clipboard copy failed.");
}
