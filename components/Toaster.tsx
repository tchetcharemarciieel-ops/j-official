"use client";

import { CircleAlert, CircleCheck, Info } from "lucide-react";
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
            className={`pointer-events-auto glass flex max-w-md items-start gap-2 rounded-xl px-4 py-3 text-sm shadow-lg ${t.kind === "error" ? "border-red-200 text-red-700" : t.kind === "success" ? "border-green-200 text-green-700" : "text-slate-800"}`}
          >
            {t.kind === "error" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden /> : t.kind === "success" ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" aria-hidden /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
