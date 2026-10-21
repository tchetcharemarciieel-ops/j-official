"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/fetcher";
import { useToast } from "@/components/Toaster";

export function UseTemplateButton({ templateId, defaultName, loggedIn }: { templateId: string; defaultName: string; loggedIn: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  if (!loggedIn) return <a href={`/connexion?next=/modeles%23${templateId}`} className="btn btn-primary">Utiliser ce modèle</a>;
  if (!open) return <button className="btn btn-primary" onClick={() => setOpen(true)}>Utiliser ce modèle</button>;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const r = await api<{ id: string }>("/api/projects", { body: { templateId, name } });
          router.push(`/projets/${r.id}`);
        } catch (err) {
          toast("error", err instanceof Error ? err.message : "Erreur");
          setBusy(false);
        }
      }}
    >
      <label htmlFor={`n-${templateId}`} className="sr-only">Nom de votre logiciel</label>
      <input id={`n-${templateId}`} className="input" value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={80} required autoFocus />
      <button className="btn btn-primary shrink-0" disabled={busy}>{busy && <span className="spinner" />}Créer</button>
    </form>
  );
}
