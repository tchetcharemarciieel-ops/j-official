"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import type { AppSpec } from "@/lib/spec";
import { Panel, type WorkspaceData } from "../Workspace";

export function SettingsTab({ data, spec, onChanged }: { data: WorkspaceData; spec: AppSpec; onChanged: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState(spec.name);
  const [welcome, setWelcome] = useState(spec.welcome);
  const [primary, setPrimary] = useState(spec.theme.primary);
  const [accent, setAccent] = useState(spec.theme.accent);
  const [logoText, setLogoText] = useState(spec.theme.logoText);
  const [logoUrl, setLogoUrl] = useState(spec.theme.logoUrl ?? "");
  const [confirmSlug, setConfirmSlug] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ version: number }>(`/api/projects/${data.project.id}`, { method: "PATCH", body: { name, welcome, theme: { primary, accent, logoText, logoUrl } } });
      toast("success", `Personnalisation enregistrée (v${r.version}).${data.project.publishedVersion ? " Republiez pour la mettre en ligne." : ""}`);
      onChanged();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    setBusy(true);
    try {
      await api(`/api/projects/${data.project.id}`, { method: "DELETE", body: { confirm: confirmSlug } });
      toast("success", "Logiciel supprimé.");
      router.replace("/espace");
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Identité visuelle et textes">
        <form onSubmit={save} className="space-y-4">
          <label className="block"><span className="label">Nom du logiciel</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required /></label>
          <label className="block"><span className="label">Texte d&apos;accueil</span><textarea className="input" rows={2} value={welcome} onChange={(e) => setWelcome(e.target.value)} maxLength={300} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Couleur principale</span><input type="color" className="h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-transparent" value={primary} onChange={(e) => setPrimary(e.target.value)} /></label>
            <label><span className="label">Couleur secondaire</span><input type="color" className="h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-transparent" value={accent} onChange={(e) => setAccent(e.target.value)} /></label>
          </div>
          <div className="grid grid-cols-[1fr_2fr] gap-3">
            <label><span className="label">Initiales du logo</span><input className="input" value={logoText} onChange={(e) => setLogoText(e.target.value.toUpperCase())} maxLength={4} /></label>
            <label><span className="label">Logo (adresse https d&apos;une image)</span><input className="input" type="url" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…/logo.png" /></label>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white p-3 text-slate-900">
            <span className="grid h-10 w-10 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${accent})` }}>{logoText}</span>
            <span className="font-semibold">{name}</span>
            <span className="ml-auto rounded-lg px-3 py-1.5 text-sm text-white" style={{ background: primary }}>Bouton</span>
          </div>
          <button className="btn btn-primary w-full" disabled={busy}>Enregistrer (nouvelle version)</button>
        </form>
      </Panel>
      <div className="space-y-6">
        <Panel title="Cahier des charges initial">
          <p className="text-sm text-slate-700">{data.project.problem || "—"}</p>
          {data.diagnosis && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-600">
              {data.diagnosis.features.filter((f) => f.selected).map((f) => <li key={f.id}>{f.title}</li>)}
            </ul>
          )}
        </Panel>
        {data.role === "owner" && (
          <Panel title="Zone dangereuse" subtitle="La suppression efface définitivement le logiciel, ses versions, ses sauvegardes et toutes ses données.">
            <label className="block"><span className="label">Saisissez « {data.project.slug} » pour confirmer</span><input className="input" value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} /></label>
            <button className="btn btn-danger mt-3 w-full" disabled={busy || confirmSlug !== data.project.slug} onClick={del}>Supprimer définitivement</button>
          </Panel>
        )}
      </div>
    </div>
  );
}
