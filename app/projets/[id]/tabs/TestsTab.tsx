"use client";

import { Wrench } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/status";
import type { CheckResult } from "@/lib/checks";
import { Panel, type WorkspaceData } from "../Workspace";
import { ChecksList } from "./ChecksList";

export function TestsTab({ data, onChanged }: { data: WorkspaceData; onChanged: () => void }) {
  const toast = useToast();
  const last = data.versions[0]?.test_report ?? null;
  const [checks, setChecks] = useState<CheckResult[] | null>(last?.checks ?? null);
  const [ranAt, setRanAt] = useState(last?.ranAt ?? null);
  const [full, setFull] = useState(Boolean(last?.full));
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const r = await api<{ checks: CheckResult[] }>(`/api/projects/${data.project.id}/tests`, { body: {} });
      setChecks(r.checks);
      setRanAt(new Date().toISOString());
      setFull(true);
      const failed = r.checks.filter((c) => c.status === "fail").length;
      toast(failed ? "error" : "success", failed ? `${failed} test(s) en échec.` : "Tous les tests critiques sont réussis.");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  async function fix() {
    setBusy(true);
    try {
      const r = await api<{ changed: boolean; checks?: CheckResult[] }>(`/api/projects/${data.project.id}/autofix`, { body: {} });
      if (!r.changed) toast("info", "Aucune correction automatique disponible.");
      else {
        setChecks(r.checks ?? null);
        setFull(false);
        toast("success", "Corrections appliquées dans une nouvelle version.");
        onChanged();
      }
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  const failed = checks?.filter((c) => c.status === "fail") ?? [];
  return (
    <Panel
      title="Tests et correction automatique"
      subtitle={ranAt ? `Derniers tests : ${fmtDateTime(ranAt)} sur la version v${data.project.draftVersion}${full ? " (batterie complète, base de données incluse)" : " (tests de structure, lancez la batterie complète)"}.` : "Aucun test exécuté."}
      actions={
        <>
          {failed.some((c) => c.autoFixable) && <button className="btn btn-ghost" disabled={busy} onClick={fix}><Wrench className="h-4 w-4" aria-hidden />Corriger automatiquement</button>}
          <button className="btn btn-primary" disabled={busy} onClick={run}>{busy && <span className="spinner" />}Lancer tous les tests</button>
        </>
      }
    >
      <p className="mb-4 text-xs text-slate-600">Testés : navigation, formulaires et validations, calculs, permissions, ajout/modification/suppression en base, affichage mobile, isolation des données entre clients. Les corrections sont appliquées dans une nouvelle version du brouillon : rien n&apos;est publié sans votre action.</p>
      {checks ? <ChecksList checks={checks} /> : <p className="text-sm text-slate-600">Lancez les tests pour vérifier votre logiciel.</p>}
    </Panel>
  );
}
