import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, Info, X } from "lucide-react";

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

const ICONS = { success: CheckCircle2, error: CircleAlert, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (message, tone = "info", ms = 4500) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-3), { id, message, tone }]);
      if (ms) setTimeout(() => dismiss(id), ms);
      return id;
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      show: push,
      success: (m) => push(m, "success"),
      error: (m) => push(m, "error", 7000),
      info: (m) => push(m, "info"),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live so screen readers announce feedback */}
      <div className="toasts" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => {
          const Icon = ICONS[t.tone] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
              <Icon size={18} aria-hidden="true" />
              <span>{t.message}</span>
              <button className="toast-x" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
                <X size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
