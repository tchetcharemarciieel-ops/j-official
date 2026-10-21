"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Toast = { id: number; kind: "success" | "error" | "info"; message: string };
const Ctx = createContext<(kind: Toast["kind"], message: string) => void>(() => {});

export function useToast() {
  return useContext(Ctx);
}

export function Toaster({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast["kind"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 4000);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto glass max-w-md rounded-xl px-4 py-3 text-sm shadow-2xl ${t.kind === "error" ? "border-red-500/50 text-red-100" : t.kind === "success" ? "border-emerald-500/50 text-emerald-100" : "text-slate-100"}`}
          >
            {t.kind === "error" ? "⚠️ " : t.kind === "success" ? "✅ " : "ℹ️ "}
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
