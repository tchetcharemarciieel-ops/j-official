"use client";

import { useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { fmtDate, fmtDateTime } from "@/lib/status";
import { ROLE_LABELS, type Role } from "@/lib/spec";
import { Panel, type WorkspaceData } from "../Workspace";

const ROLE_HELP: Record<string, string> = {
  admin: "Tout gérer sauf la suppression du logiciel",
  manager: "Ajouter, modifier, supprimer, importer",
  employee: "Consulter, ajouter, modifier (sans supprimer)",
  viewer: "Consultation uniquement",
};

export function TeamTab({ data, onChanged }: { data: WorkspaceData; onChanged: () => void }) {
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("employee");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const isOwner = data.role === "owner";

  async function call(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast("success", ok);
      onChanged();
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ link: string }>(`/api/projects/${data.project.id}/invitations`, { body: { email, role } });
      setLink(r.link);
      setEmail("");
      onChanged();
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Panel title="Membres" subtitle="Chaque permission est vérifiée par le serveur à chaque action.">
        <ul className="divide-y divide-slate-200">
          {data.members.map((m) => (
            <li key={m.userId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-slate-900">{m.name}{m.userId === data.meId && " (vous)"}</p>
                <p className="text-xs text-slate-500">Depuis le {fmtDate(m.since)}</p>
              </div>
              {m.role === "owner" || m.userId === data.meId ? (
                <span className="text-sm text-slate-700">{ROLE_LABELS[m.role as Role]}</span>
              ) : (
                <div className="flex gap-2">
                  <select aria-label={`Rôle de ${m.name}`} className="input !min-h-0 py-1.5 text-sm" value={m.role} disabled={busy || (!isOwner && m.role === "admin")} onChange={(e) => call(() => api(`/api/projects/${data.project.id}/members/${m.userId}`, { method: "PATCH", body: { role: e.target.value } }), "Rôle modifié.")}>
                    {(["admin", "manager", "employee", "viewer"] as const).filter((r) => isOwner || r !== "admin").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button className="btn btn-danger !min-h-0 px-3 py-1.5 text-xs" disabled={busy || (!isOwner && m.role === "admin")} onClick={() => confirm(`Révoquer l'accès de ${m.name} ?`) && call(() => api(`/api/projects/${data.project.id}/members/${m.userId}`, { method: "DELETE" }), "Accès révoqué.")}>Révoquer</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Inviter un collaborateur" subtitle="Lien sécurisé, à usage unique, valable 7 jours, réservé à l'adresse indiquée.">
        <form onSubmit={invite} className="space-y-3">
          <div>
            <label htmlFor="inv-email" className="label">Adresse e-mail</label>
            <input id="inv-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="inv-role" className="label">Rôle</label>
            <select id="inv-role" className="input" value={role} onChange={(e) => setRole(e.target.value)}>
              {(["admin", "manager", "employee", "viewer"] as const).filter((r) => isOwner || r !== "admin").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]} — {ROLE_HELP[r]}</option>)}
            </select>
          </div>
          <button className="btn btn-primary w-full" disabled={busy}>Créer l&apos;invitation</button>
        </form>
        {link && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm">
            <p className="text-green-700">Invitation créée. L&apos;envoi d&apos;e-mails n&apos;est pas configuré : transmettez ce lien à la personne (WhatsApp, SMS, e-mail…).</p>
            <div className="mt-2 flex items-center gap-2"><code className="flex-1 truncate text-xs text-slate-900">{link}</code><CopyButton text={link} /></div>
          </div>
        )}
        {data.invitations.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase text-slate-500">Invitations en attente</h3>
            <ul className="mt-2 space-y-2">
              {data.invitations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-slate-800">{i.email} · {ROLE_LABELS[i.role as Role]} · expire le {fmtDate(i.expires_at)}</span>
                  <button className="text-xs text-red-700 underline" disabled={busy} onClick={() => call(() => api(`/api/projects/${data.project.id}/invitations`, { method: "DELETE", body: { invitationId: i.id } }), "Invitation annulée.")}>Annuler</button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
      <div className="lg:col-span-2">
        <Panel title="Journal des actions importantes">
          {data.logs.length === 0 ? <p className="text-sm text-slate-600">Aucune action enregistrée.</p> : (
            <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {data.logs.map((l, i) => (
                <li key={i} className="flex gap-3 text-slate-700">
                  <span className="shrink-0 text-xs text-slate-500">{fmtDateTime(l.created_at)}</span>
                  <span className={l.level === "error" ? "text-red-700" : l.level === "warning" ? "text-amber-800" : ""}>{l.action}</span>
                  <span className="truncate text-slate-500">{l.actor}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
