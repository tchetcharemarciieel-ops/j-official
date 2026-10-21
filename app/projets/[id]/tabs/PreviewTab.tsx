"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { AppRuntime } from "@/components/runtime/AppRuntime";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import type { AppSpec } from "@/lib/spec";
import type { TabId, WorkspaceData } from "../Workspace";

export function PreviewTab({ data, spec, goTo }: { data: WorkspaceData; spec: AppSpec; goTo: (t: TabId) => void }) {
  const toast = useToast();
  const [key, setKey] = useState(0);
  const [busy, setBusy] = useState(false);
  async function demo(action: "seed" | "clear") {
    setBusy(true);
    try {
      await api(`/api/apps/${data.project.id}/demo`, { body: { action } });
      toast("success", action === "seed" ? "Données de démonstration ajoutées." : "Données de démonstration supprimées.");
      setKey((k) => k + 1);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4 sm:flex-row sm:items-center">
        <p className="text-sm text-amber-800">
          <strong>Aperçu fonctionnel</strong> de la version v{data.project.draftVersion}. Les boutons et formulaires fonctionnent réellement, sur des <strong>données de démonstration séparées</strong> de vos données réelles.
        </p>
        <div className="flex shrink-0 gap-2">
          <button className="btn btn-ghost" disabled={busy} onClick={() => demo("seed")}><Plus className="h-4 w-4" aria-hidden />Données de démo</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => demo("clear")}>Vider</button>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
        <AppRuntime key={key} projectId={data.project.id} spec={spec} mode="demo" role={data.role} compact />
      </div>
      <p className="text-sm text-slate-600">
        Pour changer les couleurs, le logo ou les textes : <button className="text-blue-700 underline" onClick={() => goTo("parametres")}>Paramètres</button>. Pour ajouter ou retirer des fonctions : <button className="text-blue-700 underline" onClick={() => goTo("assistant")}>Modifier avec l&apos;IA</button>.
      </p>
    </div>
  );
}
