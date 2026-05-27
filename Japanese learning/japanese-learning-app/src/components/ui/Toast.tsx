"use client";

import * as React from "react";

type ToastMsg = { id: number; msg: string; tone?: "info" | "success" | "warn" };
type Ctx = { push: (msg: string, tone?: ToastMsg["tone"]) => void };

const ToastContext = React.createContext<Ctx>({ push: () => {} });

export function useToast() {
  return React.useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastMsg[]>([]);
  const push = React.useCallback(
    (msg: string, tone: ToastMsg["tone"] = "info") => {
      const id = Date.now() + Math.random();
      setItems((cur) => [...cur, { id, msg, tone }]);
      setTimeout(
        () => setItems((cur) => cur.filter((t) => t.id !== id)),
        2800
      );
    },
    []
  );

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-md border px-4 py-2 text-sm shadow-md ${
              t.tone === "success"
                ? "bg-moss/15 text-moss border-moss/40"
                : t.tone === "warn"
                ? "bg-gold/15 text-gold border-gold/40"
                : "bg-paper border-ink-3/40 text-ink"
            }`}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
