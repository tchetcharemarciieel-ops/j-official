"use client";

import { useState } from "react";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { fmtDateTime } from "@/lib/status";
import type { AppSpec, Automation } from "@/lib/spec";
import { Panel, type WorkspaceData } from "../Workspace";

const PLANNED = [
  ["💬", "Messagerie (WhatsApp, SMS)"],
  ["💳", "Paiement (Mobile Money, carte)"],
  ["📒", "Comptabilité"],
  ["✉️", "Courriel"],
  ["📅", "Calendrier"],
  ["🗂", "Stockage de fichiers"],
];

export function IntegrationsTab({ data, spec, onChanged }: { data: WorkspaceData; spec: AppSpec; onChanged: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [autos, setAutos] = useState<Automation[]>(spec.automations);
  const connected = data.integrations.filter((i) => i.status === "connected");

  async function call<T>(fn: () => Promise<T>, ok?: string) {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast("success", ok);
      onChanged();
      return r;
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function test(id: string) {
    const r = await call(() => api<{ ok: boolean; error?: string }>(`/api/projects/${data.project.id}/integrations/${id}`, { body: {} }));
    if (r) toast(r.ok ? "success" : "error", r.ok ? "Connexion vérifiée : le service a répondu." : `Échec : ${r.error}`);
  }

  function addAuto() {
    setAutos((a) => [...a, { id: crypto.randomUUID().slice(0, 8), label: `Nouvelle fiche ${spec.entities[0]!.label.toLowerCase()}`, trigger: { entity: spec.entities[0]!.key, event: "created" }, action: { type: connected[0] ? "webhook" : "journal", integrationId: connected[0]?.id }, enabled: false }]);
  }
  const upd = (i: number, patch: Partial<Automation>) => setAutos((a) => a.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  return (
    <div className="space-y-6">
      <Panel title="Intégrations" subtitle="Une intégration n'est affichée « connectée » qu'après un test de connexion réussi.">
        {data.integrations.length > 0 && (
          <ul className="mb-6 divide-y divide-white/5">
            {data.integrations.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-white">🔗 {i.label} <span className="text-xs text-slate-500">({i.host})</span></p>
                  <p className={`text-xs ${i.status === "connected" ? "text-emerald-300" : i.status === "error" ? "text-red-300" : "text-slate-400"}`}>
                    {i.status === "connected" ? "● Connecté" : i.status === "error" ? `● Erreur : ${i.lastError}` : "● Non testé"}
                    {i.lastTestedAt && ` · testé le ${fmtDateTime(i.lastTestedAt)}`}
                  </p>
                  <p className="text-xs text-slate-500">Autorisations : reçoit les fiches des automatisations qui l&apos;utilisent (contenu de la fiche).</p>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost" disabled={busy} onClick={() => test(i.id)}>Tester la connexion</button>
                  <button className="btn btn-danger" disabled={busy} onClick={() => confirm("Déconnecter et supprimer cette intégration ?") && call(() => api(`/api/projects/${data.project.id}/integrations/${i.id}`, { method: "DELETE" }), "Intégration supprimée.")}>Déconnecter</button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <form className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]" onSubmit={(e) => { e.preventDefault(); void call(() => api(`/api/projects/${data.project.id}/integrations`, { body: { label, url } }), "Webhook ajouté. Testez la connexion.").then(() => { setLabel(""); setUrl(""); }); }}>
          <label><span className="label">Nom</span><input className="input" required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : Make / Zapier" maxLength={60} /></label>
          <label><span className="label">Adresse du webhook (https://)</span><input className="input" required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hook.exemple.com/…" /></label>
          <button className="btn btn-primary self-end" disabled={busy}>Ajouter</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Paramètres nécessaires : une adresse https publique qui accepte des requêtes POST en JSON. Le webhook permet de relier le logiciel à des services comme Make ou Zapier.</p>
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Connecteurs prévus (non disponibles)</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {PLANNED.map(([icon, name]) => <li key={name} className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-400">{icon} {name} — <span className="text-xs">non configuré</span></li>)}
          </ul>
        </div>
      </Panel>

      <Panel title="Automatisations" subtitle="Ex. : lorsqu'une commande est enregistrée, prévenir le responsable via un webhook. Désactivées par défaut : activez-les explicitement." actions={<button className="btn btn-ghost" onClick={addAuto} disabled={autos.length >= 20}>+ Ajouter</button>}>
        {autos.length === 0 ? <p className="text-sm text-slate-400">Aucune automatisation.</p> : (
          <ul className="space-y-3">
            {autos.map((a, i) => (
              <li key={a.id} className="grid gap-2 rounded-xl border border-white/10 p-3 lg:grid-cols-[2fr_1fr_1fr_1.5fr_auto_auto] lg:items-end">
                <label><span className="label">Nom</span><input className="input" value={a.label} maxLength={120} onChange={(e) => upd(i, { label: e.target.value })} /></label>
                <label><span className="label">Lorsqu&apos;une fiche</span>
                  <select className="input" value={a.trigger.entity} onChange={(e) => upd(i, { trigger: { ...a.trigger, entity: e.target.value } })}>{spec.entities.map((e) => <option key={e.key} value={e.key}>{e.labelPlural}</option>)}</select>
                </label>
                <label><span className="label">est</span>
                  <select className="input" value={a.trigger.event} onChange={(e) => upd(i, { trigger: { ...a.trigger, event: e.target.value as Automation["trigger"]["event"] } })}><option value="created">ajoutée</option><option value="updated">modifiée</option><option value="deleted">supprimée</option></select>
                </label>
                <label><span className="label">Action</span>
                  <select className="input" value={a.action.type === "webhook" ? a.action.integrationId : "journal"} onChange={(e) => upd(i, { action: e.target.value === "journal" ? { type: "journal" } : { type: "webhook", integrationId: e.target.value } })}>
                    <option value="journal">Noter dans le journal</option>
                    {connected.map((c) => <option key={c.id} value={c.id}>Envoyer à {c.label}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-2 pb-3 text-sm text-slate-200"><input type="checkbox" checked={a.enabled} onChange={(e) => upd(i, { enabled: e.target.checked })} /> Active</label>
                <button className="btn btn-danger" onClick={() => setAutos((x) => x.filter((_, k) => k !== i))} aria-label={`Supprimer ${a.label}`}>✕</button>
              </li>
            ))}
          </ul>
        )}
        <button className="btn btn-primary mt-4" disabled={busy} onClick={() => call(() => api(`/api/projects/${data.project.id}/automations`, { body: { automations: autos } }), "Automatisations enregistrées dans une nouvelle version. Republiez pour les activer en ligne.")}>Enregistrer les automatisations</button>
      </Panel>
    </div>
  );
}
