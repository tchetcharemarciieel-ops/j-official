"use client";

import { Armchair, Boxes, Briefcase, ConciergeBell, Wrench, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IN_WORKSHOP, LEVEL, type Doc, type Job } from "@/lib/garage/model";
import type { DataMode } from "../useAppData";
import { Btn, GarageCtx, Modal, type ZoneId } from "./ui";
import type { GarageApi } from "./useGarage";
import { Accueil } from "./zones/Accueil";
import { Atelier } from "./zones/Atelier";
import { Bureau } from "./zones/Bureau";
import { Repos } from "./zones/Repos";
import { Stock } from "./zones/Stock";

export const GARAGE_ZONES: Record<ZoneId, { label: string; icon: LucideIcon; description: string }> = {
  accueil: { label: "Accueil", icon: ConciergeBell, description: "Clients, véhicules, interventions, suivi, factures et paiements" },
  atelier: { label: "Atelier", icon: Wrench, description: "Diagnostic, réparations, pièces, temps et contrôle qualité" },
  stock: { label: "Stock des pièces", icon: Boxes, description: "Inventaire, entrées et sorties, alertes, fournisseurs et commandes" },
  bureau: { label: "Bureau", icon: Briefcase, description: "Tableau de bord, finances, mécaniciens et rapports" },
  repos: { label: "Salle de repos", icon: Armchair, description: "Équipements, fournitures, nettoyage et signalements" },
};

type Props = {
  zone: ZoneId;
  onZone: (z: ZoneId) => void;
  onClose: () => void;
  api: GarageApi;
  projectId: string;
  mode: DataMode;
  appName: string;
  notify: (kind: "success" | "error" | "info", message: string) => void;
  /** Dossier à ouvrir depuis le plan (liste des derniers dossiers). */
  jobRequest?: { id: string; n: number } | null;
};

/** Panneau latéral gauche du garage : s'ouvre au clic sur une zone, sans quitter le plan. */
export function GaragePanel({ zone, onZone, onClose, api, projectId, mode, appName, notify, jobRequest }: Props) {
  const [jobs, setJobs] = useState<Partial<Record<ZoneId, string | null>>>({});
  const [confirm, setConfirm] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const meta = GARAGE_ZONES[zone];

  useEffect(() => {
    panel.current?.focus();
  }, [zone]);
  useEffect(() => {
    if (!jobRequest) return;
    const job = (api.state?.data.job as Doc<Job>[] | undefined)?.find((j) => j.id === jobRequest.id);
    const target: ZoneId = job && IN_WORKSHOP.includes(job.data.status) ? "atelier" : "accueil";
    setJobs((s) => ({ ...s, [target]: jobRequest.id }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobRequest?.n]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal]')) onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const ask = useCallback((message: string) => new Promise<boolean>((resolve) => setConfirm({ message, resolve })), []);
  const answer = (ok: boolean) => {
    confirm?.resolve(ok);
    setConfirm(null);
  };

  const g = api.state;
  const ctx = useMemo(() => {
    if (!g) return null;
    return {
      g,
      api,
      mode,
      projectId,
      appName,
      level: LEVEL[g.role],
      name: (id: string | null | undefined) => (id ? (g.members.find((m) => m.id === id)?.name ?? "Ancien membre") : "—"),
      ask,
      act: async (op: string, input: unknown, opts?: { confirm?: string; quiet?: boolean }) => {
        if (opts?.confirm && !(await ask(opts.confirm))) return null;
        try {
          const r = await api.run(op, input);
          if (!opts?.quiet) notify(r.duplicate ? "info" : "success", r.message);
          return r;
        } catch (e) {
          notify("error", e instanceof Error ? e.message : "Opération impossible.");
          return null;
        }
      },
      openJob: (jobId: string) => {
        const job = (g.data.job as Doc<Job>[]).find((j) => j.id === jobId);
        const target: ZoneId = job && IN_WORKSHOP.includes(job.data.status) ? "atelier" : "accueil";
        setJobs((s) => ({ ...s, [target]: jobId }));
        onZone(target);
      },
      goZone: onZone,
    };
  }, [g, api, mode, projectId, appName, ask, notify, onZone]);

  const setJob = (id: string | null) => setJobs((s) => ({ ...s, [zone]: id }));

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label={`Panneau ${meta.label}`}
      className="no-print fixed inset-0 z-50 flex w-full flex-col bg-slate-50 shadow-2xl outline-none sm:inset-y-0 sm:right-auto sm:w-[min(500px,92vw)] sm:border-r sm:border-slate-200"
      style={{ animation: "slide-in .28s cubic-bezier(.2,.7,.2,1) both" }}
    >
      <header className="flex items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: "var(--app-primary)" }}><meta.icon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{meta.label}</h2>
          <p className="truncate text-xs text-slate-500">{meta.description}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer le panneau" className="tab-press rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden /></button>
      </header>
      <nav aria-label="Zones du garage" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
        {(Object.keys(GARAGE_ZONES) as ZoneId[]).map((z) => {
          const Z = GARAGE_ZONES[z];
          const on = z === zone;
          return (
            <button key={z} type="button" onClick={() => onZone(z)} aria-current={on ? "true" : undefined} className={`tab-press inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs ${on ? "font-semibold text-slate-900 ring-2 ring-[var(--app-primary)]" : "text-slate-500 hover:bg-slate-100"}`}>
              <Z.icon className="h-3.5 w-3.5" aria-hidden />{Z.label}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-4">
        {mode !== "live" && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{mode === "local" ? "Démo : les fiches que vous créez restent dans ce navigateur. Aucune donnée d'exemple n'est inventée." : "Aperçu : les fiches sont enregistrées comme données de démonstration, séparées des données réelles."}</p>}
        {api.loading && !g ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : api.error && !g ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{api.error} <button type="button" className="font-medium underline" onClick={() => api.reload()}>Réessayer</button></div>
        ) : ctx ? (
          <GarageCtx.Provider value={ctx}>
            {api.error && <p role="alert" className="mb-2 text-xs text-red-600">Actualisation impossible : {api.error}</p>}
            <div key={zone} style={{ animation: "fade-up .3s ease both" }}>
              {zone === "accueil" && <Accueil jobId={jobs.accueil ?? null} setJobId={setJob} />}
              {zone === "atelier" && <Atelier jobId={jobs.atelier ?? null} setJobId={setJob} />}
              {zone === "stock" && <Stock />}
              {zone === "bureau" && <Bureau />}
              {zone === "repos" && <Repos />}
            </div>
          </GarageCtx.Provider>
        ) : null}
      </div>
      {confirm && (
        <Modal title="Confirmation" onClose={() => answer(false)}>
          <p className="text-sm text-slate-700">{confirm.message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => answer(false)}>Annuler</Btn>
            <Btn onClick={() => answer(true)}>Confirmer</Btn>
          </div>
        </Modal>
      )}
    </aside>
  );
}
