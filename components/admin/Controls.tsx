"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/fetcher";
import { useToast } from "@/components/Toaster";

function useSubmit() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function submit(url: string, method: "PATCH" | "PUT" | "POST", body: unknown, done = "Enregistré.") {
    setBusy(true);
    try {
      await api(url, { method, body });
      toast("success", done);
      router.refresh();
      return true;
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, submit };
}

/** Formule et crédits d'un utilisateur. */
export function PlanCredits({ userId, plan, credits, plans }: { userId: string; plan: string; credits: number; plans: { id: string; name: string }[] }) {
  const { busy, submit } = useSubmit();
  const [p, setP] = useState(plan);
  const [c, setC] = useState(String(credits));
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(`/api/admin/users/${userId}`, "PATCH", { plan: p, credits: Number(c) }, "Formule et crédits mis à jour.");
      }}
    >
      <label className="block text-sm">
        <span className="label">Formule</span>
        <select className="input" value={p} onChange={(e) => setP(e.target.value)}>
          {plans.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="label">Crédits IA</span>
        <input className="input" type="number" min={0} max={1000000} value={c} onChange={(e) => setC(e.target.value)} />
      </label>
      <button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner" />}Enregistrer</button>
    </form>
  );
}

/** Rôle d'un membre dans un logiciel. */
export function MemberRole({ projectId, userId, role }: { projectId: string; userId: string; role: string }) {
  const { busy, submit } = useSubmit();
  if (role === "owner") return <span className="text-xs text-slate-500">Propriétaire</span>;
  return (
    <select className="rounded-lg border border-slate-200 px-2 py-1 text-xs" defaultValue={role} disabled={busy} aria-label="Rôle dans ce logiciel" onChange={(e) => void submit("/api/admin/members", "PATCH", { projectId, userId, role: e.target.value }, "Rôle modifié.")}>
      <option value="admin">Administrateur</option>
      <option value="manager">Gestionnaire</option>
      <option value="employee">Employé</option>
      <option value="viewer">Lecteur</option>
    </select>
  );
}

/** Formulaire générique : champs simples envoyés tels quels à une route admin. */
export function JsonForm({ url, method = "PUT", initial, fields, submitLabel = "Enregistrer", done }: { url: string; method?: "PUT" | "PATCH" | "POST"; initial: Record<string, string | number | boolean>; fields: { name: string; label: string; type?: "text" | "number" | "textarea" | "checkbox" | "color" | "url" | "select"; options?: { value: string; label: string }[]; hint?: string; max?: number }[]; submitLabel?: string; done?: string }) {
  const { busy, submit } = useSubmit();
  const [v, setV] = useState(initial);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(url, method, v, done);
      }}
    >
      {fields.map((f) =>
        f.type === "checkbox" ? (
          <label key={f.name} className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={Boolean(v[f.name])} onChange={(e) => setV({ ...v, [f.name]: e.target.checked })} />
            {f.label}
          </label>
        ) : (
          <label key={f.name} className="block text-sm">
            <span className="label">{f.label}</span>
            {f.type === "textarea" ? (
              <textarea className="input" rows={3} maxLength={f.max} value={String(v[f.name] ?? "")} onChange={(e) => setV({ ...v, [f.name]: e.target.value })} />
            ) : f.type === "select" ? (
              <select className="input" value={String(v[f.name] ?? "")} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>
                {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                className={f.type === "color" ? "h-11 w-full cursor-pointer rounded-xl border border-slate-300" : "input"}
                type={f.type ?? "text"}
                maxLength={f.max}
                value={String(v[f.name] ?? "")}
                onChange={(e) => setV({ ...v, [f.name]: f.type === "number" ? Number(e.target.value) : e.target.value })}
              />
            )}
            {f.hint && <span className="mt-1 block text-xs text-slate-500">{f.hint}</span>}
          </label>
        ),
      )}
      <button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner" />}{submitLabel}</button>
    </form>
  );
}
