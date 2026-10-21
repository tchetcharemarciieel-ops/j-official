"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/fetcher";
import { useToast } from "@/components/Toaster";

type U = { id: string; email: string; full_name: string; plan: string; credits: number; is_admin: boolean; suspended: boolean; created: string };

export function AdminUsers({ users, plans }: { users: U[]; plans: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(true);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", body });
      toast("success", "Compte mis à jour.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  const list = users.filter((u) => !q || u.email.includes(q.toLowerCase()) || u.full_name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="glass mt-4 rounded-2xl p-4">
      <input className="input mb-3 sm:max-w-xs" placeholder="Rechercher un compte…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Rechercher un compte" />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Compte</th><th>Inscrit</th><th>Formule</th><th>Crédits</th><th>État</th></tr></thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-t border-white/5 text-slate-200">
                <td className="py-2 pr-3">{u.email}{u.is_admin && <span className="ml-1 text-xs text-brand-300">admin</span>}<span className="block text-xs text-slate-500">{u.full_name}</span></td>
                <td className="pr-3 text-xs">{u.created}</td>
                <td className="pr-3">
                  <select aria-label={`Formule de ${u.email}`} className="input !min-h-0 py-1 text-sm" defaultValue={u.plan} disabled={busy} onChange={(e) => patch(u.id, { plan: e.target.value })}>
                    {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </td>
                <td className="pr-3">
                  <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const v = Number(new FormData(e.currentTarget).get("c")); patch(u.id, { credits: v }); }}>
                    <input name="c" type="number" min={0} defaultValue={u.credits} className="input !min-h-0 w-24 py-1 text-sm" aria-label={`Crédits de ${u.email}`} />
                    <button className="rounded-lg bg-white/10 px-2 text-xs" disabled={busy}>OK</button>
                  </form>
                </td>
                <td>
                  <button className={`rounded-lg px-2.5 py-1 text-xs ${u.suspended ? "bg-red-500/20 text-red-200" : "bg-white/10"}`} disabled={busy} onClick={() => { const reason = u.suspended ? undefined : prompt("Raison de la suspension ?") ?? undefined; if (!u.suspended && reason === undefined) return; patch(u.id, { suspended: !u.suspended, reason }); }}>
                    {u.suspended ? "Suspendu — réactiver" : "Suspendre"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type P = { id: string; name: string; slug: string; status: string; statusLabel: string; owner: string; created: string; published: boolean };

export function AdminProjects({ projects }: { projects: P[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  async function act(id: string, action: "suspend" | "resume") {
    setBusy(true);
    try {
      await api(`/api/admin/projects/${id}`, { method: "PATCH", body: { action } });
      toast("success", action === "suspend" ? "Publication suspendue." : "Publication réactivée.");
      router.refresh();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="glass mt-4 overflow-x-auto rounded-2xl p-4">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2">Logiciel</th><th>Propriétaire</th><th>Créé</th><th>Statut</th><th /></tr></thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id} className="border-t border-white/5 text-slate-200">
              <td className="py-2 pr-3">{p.name}<span className="block text-xs text-slate-500">/apps/{p.slug}</span></td>
              <td className="pr-3 text-xs">{p.owner}</td>
              <td className="pr-3 text-xs">{p.created}</td>
              <td className="pr-3 text-xs">{p.statusLabel}</td>
              <td className="text-right">
                {p.status === "published" && <button className="rounded-lg bg-red-500/20 px-2.5 py-1 text-xs text-red-200" disabled={busy} onClick={() => confirm(`Suspendre « ${p.name} » ?`) && act(p.id, "suspend")}>Suspendre</button>}
                {p.status === "suspended" && p.published && <button className="rounded-lg bg-white/10 px-2.5 py-1 text-xs" disabled={busy} onClick={() => act(p.id, "resume")}>Réactiver</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
