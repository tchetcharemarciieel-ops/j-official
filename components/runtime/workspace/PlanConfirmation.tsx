"use client";

import { CircleAlert, CircleCheck, PencilRuler, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { DataMode } from "../useAppData";

export type PlanSnapshot = Record<string, unknown>;
type Confirmation = { snapshot: PlanSnapshot; confirmed_at: string; confirmed_by_name: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Confirmation du plan : le responsable confirme que le plan (3D et 2D) correspond à son
 * établissement. Le plan validé est conservé avec la date et le nom du responsable ; si le plan
 * change ensuite (zones, dimensions), le statut repasse à « à reconfirmer ».
 */
export function PlanConfirmation({ projectId, mode, snapshot, canConfirm, onEdit }: { projectId: string; mode: DataMode; snapshot: PlanSnapshot; canConfirm: boolean; onEdit?: () => void }) {
  const [c, setC] = useState<Confirmation | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const localKey = `msplan:${projectId}`;

  const load = useCallback(async () => {
    if (mode === "local") {
      try {
        setC(JSON.parse(localStorage.getItem(localKey) ?? "null") as Confirmation | null);
      } catch {
        setC(null);
      }
      return;
    }
    try {
      const r = await fetch(`/api/projects/${projectId}/plan?mode=${mode}`, { cache: "no-store" });
      const b = await r.json().catch(() => ({}));
      setC(r.ok ? ((b.confirmation as Confirmation | null) ?? null) : null);
    } catch {
      setC(null);
    }
  }, [mode, projectId, localKey]);
  useEffect(() => {
    void load();
  }, [load]);

  const confirm = async () => {
    setBusy(true);
    setErr("");
    try {
      if (mode === "local") {
        const v: Confirmation = { snapshot, confirmed_at: new Date().toISOString(), confirmed_by_name: "Vous (démo)" };
        localStorage.setItem(localKey, JSON.stringify(v));
        setC(v);
      } else {
        const r = await fetch(`/api/projects/${projectId}/plan`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, snapshot }) });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "Confirmation impossible. Réessayez.");
        setC(b.confirmation as Confirmation);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Confirmation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const status: "loading" | "none" | "ok" | "changed" = c === undefined ? "loading" : !c ? "none" : same(c.snapshot, snapshot) ? "ok" : "changed";

  return (
    <section aria-labelledby="plan-confirm" className={`rounded-2xl border bg-white p-4 sm:p-5 ${status === "ok" ? "border-green-200" : status === "changed" ? "border-amber-200" : "border-slate-200"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${status === "ok" ? "bg-green-50 text-green-700" : status === "changed" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`} aria-hidden>
          {status === "ok" ? <CircleCheck className="h-6 w-6" /> : status === "changed" ? <CircleAlert className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 id="plan-confirm" className="font-semibold">Confirmation du plan</h3>
          <p className="mt-0.5 text-sm text-slate-600" role="status">
            {status === "loading" && "Vérification du statut…"}
            {status === "none" && "Vérifiez le plan 3D et le plan 2D, puis confirmez qu'ils correspondent à votre établissement."}
            {status === "ok" && c && <>Plan confirmé le {when(c.confirmed_at)} par {c.confirmed_by_name}.</>}
            {status === "changed" && c && <>Le plan a changé depuis sa confirmation du {when(c.confirmed_at)} : vérifiez-le et confirmez-le à nouveau.</>}
          </p>
          {!canConfirm && status !== "ok" && status !== "loading" && <p className="mt-1 text-xs text-slate-500">Seul le responsable de l&apos;établissement peut confirmer le plan.</p>}
          {err && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {canConfirm && status !== "ok" && status !== "loading" && (
            <button type="button" disabled={busy} onClick={confirm} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60" style={{ background: "var(--app-primary)" }}>
              {busy && <span className="spinner" aria-hidden />}
              <CircleCheck className="h-4 w-4" aria-hidden />
              {status === "changed" ? "Confirmer à nouveau" : "Confirmer le plan"}
            </button>
          )}
          {canConfirm && onEdit && (
            <button type="button" onClick={onEdit} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <PencilRuler className="h-4 w-4" aria-hidden />Modifier le plan
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
