"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/fetcher";
import { useToast } from "@/components/Toaster";

/**
 * Bouton d'action administrateur avec confirmation obligatoire pour les opérations sensibles
 * (suspension, suppression…). Si `confirmText` est fourni, il doit être saisi pour valider.
 */
export function Action({
  url,
  method = "POST",
  body,
  label,
  confirm,
  confirmText,
  danger = false,
  done,
  className = "",
}: {
  url: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  label: string;
  confirm?: string;
  confirmText?: string;
  danger?: boolean;
  done?: string;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await api(url, { method, body: body ?? {} });
      toast("success", done ?? "Action effectuée.");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  const base = `rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${danger ? "border-red-200 text-red-700 hover:bg-red-50" : "border-slate-200 text-slate-700 hover:bg-slate-100"} ${className}`;
  return (
    <>
      <button type="button" className={base} disabled={busy} onClick={() => (confirm ? setOpen(true) : run())}>
        {busy && <span className="spinner mr-1 !h-3 !w-3" />}
        {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-900/40 p-4" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 id="confirm-title" className="font-semibold">{label}</h2>
            <p className="mt-2 text-sm text-slate-600">{confirm}</p>
            {confirmText && (
              <label className="mt-3 block text-sm">
                Saisissez <code className="rounded bg-slate-100 px-1">{confirmText}</code> pour confirmer
                <input className="input mt-1" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
              </label>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
              <button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy || (confirmText !== undefined && typed.trim() !== confirmText)} onClick={run}>
                {busy && <span className="spinner" />}Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
