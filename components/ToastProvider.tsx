"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

type ToastTone = "success" | "error" | "warning" | "info";

type Toast = {
  id: string;
  tone: ToastTone;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastInput = Omit<Toast, "id"> & {
  duration?: number;
};

type ToastContextValue = {
  push: (toast: ToastInput) => string;
  remove: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const duration = toast.duration ?? (toast.tone === "error" ? 6500 : 3800);

      setToasts((current) => [
        { id, ...toast },
        ...current.filter(
          (item) => item.title !== toast.title || item.message !== toast.message
        ),
      ].slice(0, 4));

      if (duration > 0) {
        window.setTimeout(() => remove(id), duration);
      }

      return id;
    },
    [remove]
  );

  const value = useMemo(() => ({ push, remove }), [push, remove]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-label="Avisos">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              className={`toast-card ${toast.tone}`}
              layout
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <span className="toast-icon" aria-hidden="true">
                {toast.tone === "success" ? (
                  <CheckCircle2 size={17} />
                ) : toast.tone === "error" ? (
                  <AlertTriangle size={17} />
                ) : toast.tone === "warning" ? (
                  <AlertTriangle size={17} />
                ) : (
                  <Info size={17} />
                )}
              </span>
              <span className="toast-copy">
                <strong>{toast.title}</strong>
                {toast.message && <small>{toast.message}</small>}
              </span>
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    toast.onAction?.();
                    remove(toast.id);
                  }}
                >
                  {toast.actionLabel}
                </button>
              )}
              <button
                type="button"
                className="toast-close"
                aria-label="Dispensar aviso"
                onClick={() => remove(toast.id)}
              >
                <X size={14} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast deve ser usado dentro de ToastProvider.");
  }
  return context;
}
