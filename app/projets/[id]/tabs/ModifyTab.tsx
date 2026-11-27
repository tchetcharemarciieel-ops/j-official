"use client";

import Link from "next/link";
import { Building2, History, Palette, Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { AppRuntime } from "@/components/runtime/AppRuntime";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { autoFix, runChecks } from "@/lib/checks";
import { diffSpecs } from "@/lib/diff";
import { MODULES } from "@/lib/modules";
import { adaptModule } from "@/lib/module-variants";
import { withModule, withoutEntity } from "@/lib/modify-manual";
import type { AppSpec } from "@/lib/spec";
import { Panel, type TabId, type WorkspaceData } from "../Workspace";
import { AssistantTab } from "./AssistantTab";
import { ChecksList } from "./ChecksList";

export function ModifyTab({ data, spec, onChanged, goTo }: { data: WorkspaceData; spec: AppSpec; onChanged: () => void; goTo: (t: TabId) => void }) {
  const toast = useToast();
  const [candidate, setCandidate] = useState<AppSpec | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<"before" | "after">("after");
  const current = candidate ?? spec;
  const custom = !spec.module;

  const available = useMemo(() => MODULES.filter((m) => !current.entities.some((e) => e.key === m.entity.key)).map((m) => adaptModule(m, data.diagnosis?.sector)), [current, data.diagnosis?.sector]);
  const shown = useMemo(() => {
    if (!candidate) return null;
    let c = candidate;
    let checks = runChecks(c, spec);
    if (checks.some((x) => x.status === "fail" && x.autoFixable)) { c = autoFix(c); checks = runChecks(c, spec); }
    return { spec: c, checks, changes: diffSpecs(spec, c) };
  }, [candidate, spec]);

  function add(id: string) {
    const m = available.find((x) => x.id === id);
    if (!m) return;
    setNote(`Ajout de « ${m.title} ».`);
    setCandidate(withModule(current, m));
    setCompare("after");
  }
  function remove(key: string) {
    const e = current.entities.find((x) => x.key === key);
    if (!e || current.entities.length <= 1) return toast("error", "Un logiciel doit garder au moins une fonctionnalité.");
    setNote(`Retrait de « ${e.labelPlural} » de l'affichage (données conservées).`);
    setCandidate(withoutEntity(current, key));
    setCompare("after");
  }
  async function save() {
    if (!shown) return;
    if (shown.checks.some((c) => c.status === "fail")) return toast("error", "Cette modification ne passe pas les tests : elle ne peut pas être enregistrée.");
    setBusy(true);
    try {
      const r = await api<{ version: number }>(`/api/projects/${data.project.id}/versions`, { body: { spec: shown.spec, summary: note || "Modification des fonctionnalités", source: "manual", baseVersion: data.project.draftVersion } });
      toast("success", `Modifications enregistrées (v${r.version}). Vos données, vos accès et votre lien public sont conservés.${data.project.publishedVersion ? " Republiez pour mettre la nouvelle version en ligne." : ""}`);
      setCandidate(null);
      onChanged();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  const shortcut = "flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-300";
  return (
    <div className="space-y-6">
      <Panel title="Faire évoluer mon logiciel" subtitle="Tout se modifie ici, sans recréer le logiciel : vos données, vos utilisateurs et leurs accès, et votre lien public sont conservés. Rien n'est supprimé automatiquement, et chaque enregistrement crée une version à laquelle vous pouvez revenir.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button className={shortcut} onClick={() => goTo("parametres")}><Palette className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden /><span><b className="block text-sm text-slate-900">Nom, logo et couleurs</b><span className="text-xs text-slate-600">Apparence, texte d&apos;accueil, règles de fonctionnement.</span></span></button>
          <Link href="/espace/parametres" className={shortcut}><Building2 className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden /><span><b className="block text-sm text-slate-900">Informations de l&apos;entreprise</b><span className="text-xs text-slate-600">Nom, adresse, téléphone : reprises sur vos documents.</span></span></Link>
          <button className={shortcut} onClick={() => goTo("equipe")}><Users className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden /><span><b className="block text-sm text-slate-900">Équipe et accès</b><span className="text-xs text-slate-600">Postes et droits de chaque personne.</span></span></button>
          <button className={shortcut} onClick={() => goTo("versions")}><History className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" aria-hidden /><span><b className="block text-sm text-slate-900">Versions et retour arrière</b><span className="text-xs text-slate-600">Revenir à une version précédente.</span></span></button>
        </div>
      </Panel>

      {!custom && (
        <Panel title="Logiciel prêt à l'emploi" subtitle="Les fonctions de ce logiciel sont déjà complètes. Modifiez ici le nom, le logo et les couleurs (Paramètres), l'équipe et les accès, et réglez son fonctionnement depuis ses propres Paramètres.">
          <button className="btn btn-primary" onClick={() => goTo("parametres")}>Ouvrir les paramètres</button>
        </Panel>
      )}

      {custom && (
        <>
          <Panel title="Fonctionnalités" subtitle="Ajoutez ou retirez des fonctionnalités, puis vérifiez le résultat avant d'enregistrer.">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="label">Dans votre logiciel</p>
                <ul className="space-y-2">
                  {current.entities.map((e) => (
                    <li key={e.key} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{e.icon} {e.labelPlural}</span>
                      <button className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-red-700 hover:bg-red-50" onClick={() => remove(e.key)} disabled={busy} aria-label={`Retirer ${e.labelPlural}`}><Trash2 className="h-3.5 w-3.5" aria-hidden />Retirer</button>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="label">Que vous pouvez ajouter</p>
                {available.length === 0 ? <p className="text-sm text-slate-600">Toutes les fonctionnalités proposées sont déjà présentes.</p> : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {available.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                        <span className="min-w-0"><b className="block truncate text-slate-900">{m.entity.icon} {m.title}</b><span className="block truncate text-xs text-slate-600">{m.description}</span></span>
                        <button className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100" onClick={() => add(m.id)} disabled={busy}><Plus className="h-3.5 w-3.5" aria-hidden />Ajouter</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </Panel>

          {shown && (
            <Panel title="Prévisualisation avant enregistrement" subtitle={note}>
              <ul className="space-y-1 text-sm">
                {shown.changes.map((c, k) => <li key={k}><span className={c.kind === "added" ? "text-green-700" : c.kind === "removed" ? "text-red-700" : "text-amber-800"}>{c.kind === "added" ? "+ " : c.kind === "removed" ? "− " : "~ "}</span>{c.target} — {c.detail}</li>)}
              </ul>
              {shown.changes.some((c) => c.kind === "removed") && <p className="mt-2 text-xs text-amber-800">Les éléments retirés disparaissent de l&apos;affichage, mais leurs données restent stockées et réapparaissent si vous restaurez une version précédente.</p>}
              {shown.checks.some((c) => c.status !== "pass") && <div className="mt-3"><ChecksList checks={shown.checks.filter((c) => c.status !== "pass")} /></div>}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <button className="btn btn-primary flex-1" disabled={busy || shown.checks.some((c) => c.status === "fail")} onClick={() => void save()}>Enregistrer les modifications</button>
                <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => setCandidate(null)}>Annuler</button>
              </div>
              <div role="group" aria-label="Comparer" className="mt-4 inline-flex rounded-xl border border-slate-200 p-1 text-sm">
                <button className={`rounded-lg px-3 py-1.5 ${compare === "before" ? "bg-slate-100 text-slate-900" : "text-slate-600"}`} onClick={() => setCompare("before")} aria-pressed={compare === "before"}>Avant</button>
                <button className={`rounded-lg px-3 py-1.5 ${compare === "after" ? "bg-blue-100 text-slate-900" : "text-slate-600"}`} onClick={() => setCompare("after")} aria-pressed={compare === "after"}>Après</button>
              </div>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200">
                <AppRuntime key={compare} projectId={data.project.id} spec={compare === "after" ? shown.spec : spec} mode="demo" role={data.role} compact />
              </div>
            </Panel>
          )}

          {!candidate && <AssistantTab data={data} spec={spec} onApplied={onChanged} />}
        </>
      )}
    </div>
  );
}
