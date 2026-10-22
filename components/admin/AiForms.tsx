"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/fetcher";
import { useToast } from "@/components/Toaster";

type AiValues = { enabled: boolean; provider: "auto" | "openai" | "anthropic" | "gemini"; model: string; fallbackModels: string; userHourly: number; userDaily: number; globalDaily: number };

/** Réglages de l'IA : activation, fournisseur, modèle (liste réelle du fournisseur), quotas. */
export function AiSettingsForm({ initial }: { initial: AiValues }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (p: Partial<AiValues>) => setV((x) => ({ ...x, ...p }));

  async function loadModels() {
    if (v.provider === "auto") return toast("info", "Choisissez d'abord un fournisseur précis.");
    setLoading(true);
    try {
      const r = await api<{ models: string[] }>(`/api/admin/ai/models?provider=${v.provider}`);
      setModels(r.models);
      if (!r.models.length) toast("info", "Aucun modèle renvoyé par le fournisseur.");
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/admin/ai", { method: "PUT", body: v });
      toast("success", "Réglages de l'IA enregistrés.");
      router.refresh();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={v.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Génération par IA activée
      </label>
      {!v.enabled && <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">IA désactivée : toutes les analyses et modifications utiliseront les règles prédéfinies (gratuites).</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="label">Fournisseur</span>
          <select className="input" value={v.provider} onChange={(e) => (set({ provider: e.target.value as AiValues["provider"], model: "" }), setModels([]))}>
            <option value="auto">Automatique (première clé disponible)</option>
            <option value="gemini">Google Gemini</option>
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="label">Modèle</span>
          {models.length ? (
            <select className="input" value={v.model} onChange={(e) => set({ model: e.target.value })}>
              <option value="">Modèle par défaut</option>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          ) : (
            <input className="input" value={v.model} placeholder="Modèle par défaut" maxLength={80} onChange={(e) => set({ model: e.target.value })} disabled={v.provider === "auto"} />
          )}
        </label>
      </div>
      <button type="button" className="btn btn-ghost" onClick={loadModels} disabled={loading || v.provider === "auto"}>{loading && <span className="spinner" />}Charger les modèles disponibles</button>
      <label className="block text-sm">
        <span className="label">Modèles de secours (si la limite est atteinte)</span>
        <input className="input" value={v.fallbackModels} maxLength={400} placeholder="Vide = modèles gratuits par défaut. Ex. : gemini:gemini-3.5-flash,gemini:gemini-3.5-flash-lite" onChange={(e) => set({ fallbackModels: e.target.value })} />
      </label>
      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="label">Quotas d&apos;analyses IA</legend>
        <label className="block text-sm"><span className="text-xs text-slate-500">Par utilisateur et par heure</span><input className="input" type="number" min={0} max={1000} value={v.userHourly} onChange={(e) => set({ userHourly: Number(e.target.value) })} /></label>
        <label className="block text-sm"><span className="text-xs text-slate-500">Par utilisateur et par jour</span><input className="input" type="number" min={0} max={10000} value={v.userDaily} onChange={(e) => set({ userDaily: Number(e.target.value) })} /></label>
        <label className="block text-sm"><span className="text-xs text-slate-500">Toute la plateforme par jour</span><input className="input" type="number" min={0} max={100000} value={v.globalDaily} onChange={(e) => set({ globalDaily: Number(e.target.value) })} /></label>
      </fieldset>
      <button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner" />}Enregistrer</button>
    </form>
  );
}

/** Clé d'un fournisseur : saisie, remplacement, suppression. La clé complète n'est jamais réaffichée. */
export function ApiKeyRow({ provider, label, masked, source, savedAt, canStore }: { provider: string; label: string; masked: string; source: "admin" | "env" | null; savedAt?: string; canStore: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  async function call(method: "PUT" | "DELETE") {
    setBusy(true);
    try {
      await api("/api/admin/ai/keys", { method, body: method === "PUT" ? { provider, key } : { provider } });
      toast("success", method === "PUT" ? "Clé enregistrée (chiffrée)." : "Clé supprimée.");
      setKey("");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-slate-500">
          {source === "admin" ? `Enregistrée ici : ${masked}${savedAt ? ` (le ${new Date(savedAt).toLocaleDateString("fr-FR")})` : ""}` : source === "env" ? "Définie dans les variables du serveur (Render)" : "Aucune clé"}
        </p>
      </div>
      <form
        className="mt-2 flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (key.trim()) void call("PUT");
        }}
      >
        <label className="sr-only" htmlFor={`k-${provider}`}>Nouvelle clé {label}</label>
        <input id={`k-${provider}`} type="password" autoComplete="off" className="input" placeholder={canStore ? "Coller une nouvelle clé" : "Chiffrement indisponible"} value={key} onChange={(e) => setKey(e.target.value)} disabled={!canStore} />
        <button className="btn btn-primary shrink-0" disabled={busy || !key.trim() || !canStore}>Enregistrer</button>
        {source === "admin" && <button type="button" className="btn btn-danger shrink-0" disabled={busy} onClick={() => call("DELETE")}>Supprimer</button>}
      </form>
    </div>
  );
}
