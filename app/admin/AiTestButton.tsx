"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/fetcher";

/** Lance un vrai appel au fournisseur IA et affiche le résultat tel quel. */
export function AiTestButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; message: string } | null>(null);
  async function run() {
    setBusy(true);
    setRes(null);
    try {
      setRes(await api<{ ok: boolean; message: string }>("/api/admin/ai-test", { body: {} }));
      router.refresh();
    } catch (e) {
      setRes({ ok: false, message: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <button type="button" className="btn btn-ghost shrink-0" onClick={run} disabled={busy}>
        {busy && <span className="spinner" />} Tester la connexion IA
      </button>
      {res && <p role="status" className={`text-sm ${res.ok ? "text-green-700" : "text-red-700"}`}>{res.message}</p>}
    </div>
  );
}
