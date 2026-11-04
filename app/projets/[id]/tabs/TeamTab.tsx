"use client";

import { Ban, Check, Mail, MessageCircle, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserCheck, UserPlus, Users, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { useToast } from "@/components/Toaster";
import { api } from "@/lib/fetcher";
import { ROLE_LABELS, type Role } from "@/lib/spec";
import { INVITATION_STATE_LABELS, PERMISSIONS, type Permission, type Position } from "@/lib/team";
import { Panel, type WorkspaceData } from "../Workspace";

type Member = { userId: string; name: string; email: string; phone: string; role: Role; position: string; permissions: Permission[] | null; status: string; since: string; suspendedAt: string | null; me: boolean };
type Invitation = { id: string; email: string; full_name: string; phone: string; role: Role; position: string; permissions: string[]; email_status: string; sent_count: number; last_sent_at: string; expires_at: string; created_at: string; state: keyof typeof INVITATION_STATE_LABELS; invitedBy: string };
type Team = { sector: string; manage: boolean; myRole: Role; members: Member[]; invitations: Invitation[]; positions: Position[]; permissions: Permission[]; seats: { total: number; used: number; pending: number; free: number; full: boolean; plan: string; unlimited: boolean }; company: string };

const fmt = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
const STATE_TONE: Record<string, string> = { en_attente: "bg-amber-100 text-amber-800", acceptee: "bg-green-100 text-green-800", annulee: "bg-slate-100 text-slate-600", expiree: "bg-red-100 text-red-700" };

/** « Gestion des équipes » : employés, postes, permissions, invitations et places. */
export function TeamTab({ data, onChanged }: { data: WorkspaceData; onChanged: () => void }) {
  const toast = useToast();
  const [team, setTeam] = useState<Team | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [pos, setPos] = useState("");
  const [modal, setModal] = useState<{ kind: "add" } | { kind: "edit"; m: Member } | { kind: "seats" } | { kind: "position" } | null>(null);
  const [link, setLink] = useState<{ url: string; email: string; status: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/projects/${data.project.id}`;

  const load = useCallback(async () => {
    try {
      setTeam(await api<Team>(`${base}/team`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  async function call(fn: () => Promise<unknown>, ok: string) {
    setBusy(true);
    try {
      await fn();
      toast("success", ok);
      await load();
      onChanged();
      return true;
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Erreur");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const posLabel = useCallback((key: string) => team?.positions.find((p) => p.key === key)?.label ?? (key ? key : "Sans poste"), [team]);
  const members = useMemo(() => (team?.members ?? []).filter((m) => (!q || `${m.name} ${m.email}`.toLowerCase().includes(q.toLowerCase())) && (!pos || m.position === pos)), [team, q, pos]);

  if (error) return <Panel title="Gestion des équipes"><p role="alert" className="text-sm text-red-700">{error}</p></Panel>;
  if (!team) return <Panel title="Gestion des équipes"><div className="h-40 animate-pulse rounded-xl bg-slate-100" /></Panel>;

  const pending = team.invitations.filter((i) => i.state === "en_attente");
  const active = team.members.filter((m) => m.status !== "suspended").length;
  const suspended = team.members.length - active;
  const s = team.seats;
  const canAct = (m: Member) => team.manage && !m.me && m.role !== "owner" && (m.role !== "admin" || team.myRole === "owner");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="Employés" value={team.members.length} />
        <StatCard icon={UserCheck} label="Actifs" value={active} tone="text-green-700" />
        <StatCard icon={Mail} label="Invitations en attente" value={pending.length} tone="text-amber-700" />
        <StatCard icon={Ban} label="Suspendus" value={suspended} tone={suspended ? "text-red-700" : undefined} />
      </div>

      <Panel
        title="Accès et licences"
        subtitle={s.unlimited ? "Compte administrateur de la plateforme : places illimitées." : `Formule ${s.plan || "actuelle"} : chaque membre et chaque invitation en attente occupe une place.`}
        actions={team.manage && (s.full || s.free <= 1) && !s.unlimited ? <button className="btn btn-ghost" onClick={() => setModal({ kind: "seats" })}><Plus className="h-4 w-4" aria-hidden />Demander un accès supplémentaire</button> : undefined}
      >
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Seat label="Accès autorisés" value={s.unlimited ? "∞" : s.total} />
          <Seat label="Accès utilisés" value={s.used} />
          <Seat label="Invitations en attente" value={s.pending} />
          <Seat label="Places disponibles" value={s.unlimited ? "∞" : s.free} strong={s.full} />
        </div>
        {!s.unlimited && (
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200" role="img" aria-label={`${s.used + s.pending} places occupées sur ${s.total}`}>
            <div className={`h-full ${s.full ? "bg-red-500" : "bg-blue-600"}`} style={{ width: `${Math.min(100, ((s.used + s.pending) / Math.max(1, s.total)) * 100)}%` }} />
          </div>
        )}
        {s.full && !s.unlimited && <p className="mt-2 text-sm text-red-700">Toutes les places sont occupées. Demandez un accès supplémentaire : l&apos;équipe MiniSoft RCA vous répond avec les conditions.</p>}
      </Panel>

      <Panel
        title="Équipe"
        subtitle="Chaque employé a son propre compte et ne voit que les fonctions de son poste. Les autorisations sont vérifiées par le serveur à chaque action."
        actions={team.manage ? <button className="btn btn-primary" onClick={() => setModal({ kind: "add" })} disabled={s.full && !s.unlimited}><UserPlus className="h-4 w-4" aria-hidden />Ajouter un employé</button> : undefined}
      >
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Rechercher par nom</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input className="input !pl-9" placeholder="Rechercher par nom ou e-mail" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="sm:w-56">
            <span className="sr-only">Filtrer par poste</span>
            <select className="input" value={pos} onChange={(e) => setPos(e.target.value)}>
              <option value="">Tous les postes</option>
              {team.positions.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
        </div>
        <ul className="mt-3 divide-y divide-slate-200">
          {members.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Aucun employé ne correspond.</li>}
          {members.map((m) => (
            <li key={m.userId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold text-white ${m.status === "suspended" ? "bg-slate-400" : "bg-blue-600"}`} aria-hidden>{m.name.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-900">{m.name}{m.me && <span className="ml-1 text-xs text-slate-500">(vous)</span>}</p>
                <p className="truncate text-xs text-slate-500">{[m.email, m.phone].filter(Boolean).join(" · ") || "—"} · depuis le {fmt(m.since)}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">{m.role === "owner" ? "Propriétaire" : m.position ? posLabel(m.position) : ROLE_LABELS[m.role]}</span>
                  {m.status === "suspended" ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">Suspendu{m.suspendedAt ? ` le ${fmt(m.suspendedAt)}` : ""}</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">Actif</span>}
                  {m.permissions === null ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{m.role === "owner" || m.role === "admin" ? "Tous les accès" : `Droits du rôle ${ROLE_LABELS[m.role]}`}</span> : m.permissions.map((p) => <span key={p} className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">{PERMISSIONS[p]?.label ?? p}</span>)}
                </div>
              </div>
              {canAct(m) && (
                <div className="flex flex-wrap gap-1.5">
                  <button className="btn btn-ghost !min-h-0 px-3 py-1.5 text-xs" disabled={busy} onClick={() => setModal({ kind: "edit", m })}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</button>
                  {m.status === "suspended" ? (
                    <button className="btn btn-ghost !min-h-0 px-3 py-1.5 text-xs" disabled={busy} onClick={() => call(() => api(`${base}/members/${m.userId}`, { method: "PATCH", body: { status: "active" } }), `Accès de ${m.name} réactivé.`)}><Check className="h-3.5 w-3.5" aria-hidden />Réactiver</button>
                  ) : (
                    <button className="btn btn-ghost !min-h-0 px-3 py-1.5 text-xs" disabled={busy} onClick={() => confirm(`Suspendre l'accès de ${m.name} ? Il est bloqué immédiatement ; ses données restent conservées.`) && call(() => api(`${base}/members/${m.userId}`, { method: "PATCH", body: { status: "suspended" } }), `Accès de ${m.name} suspendu.`)}><Ban className="h-3.5 w-3.5" aria-hidden />Suspendre</button>
                  )}
                  <button className="btn btn-danger !min-h-0 px-3 py-1.5 text-xs" disabled={busy} onClick={() => confirm(`Supprimer ${m.name} de l'équipe ? Son accès est retiré immédiatement (l'historique de ses actions est conservé).`) && call(() => api(`${base}/members/${m.userId}`, { method: "DELETE" }), `${m.name} a été retiré de l'équipe.`)}><Trash2 className="h-3.5 w-3.5" aria-hidden />Supprimer</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Panel>

      {team.manage && (
        <Panel title="Historique des invitations" subtitle="Liens sécurisés, à usage unique, valables 7 jours et réservés à l'adresse invitée.">
          {team.invitations.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Aucune invitation envoyée.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-200">
              {team.invitations.map((i) => (
                <li key={i.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{i.full_name || i.email} <span className="font-normal text-slate-500">· {posLabel(i.position)}</span></p>
                    <p className="text-xs text-slate-500">{i.email} · envoyée le {fmt(i.created_at)}{i.invitedBy ? ` par ${i.invitedBy}` : ""}{i.sent_count > 1 ? ` · renvoyée ${i.sent_count - 1} fois` : ""} · {i.state === "en_attente" ? `expire le ${fmt(i.expires_at)}` : ""} {i.email_status === "envoye" ? "· e-mail envoyé" : i.email_status === "echec" ? "· e-mail non parti (lien à partager)" : ""}</p>
                  </div>
                  <span className={`self-start rounded-full px-2.5 py-0.5 text-xs font-medium sm:self-center ${STATE_TONE[i.state]}`}>{INVITATION_STATE_LABELS[i.state]}</span>
                  {(i.state === "en_attente" || i.state === "expiree") && (
                    <div className="flex gap-1.5">
                      <button className="btn btn-ghost !min-h-0 px-3 py-1.5 text-xs" disabled={busy} onClick={async () => { setBusy(true); try { const r = await api<{ link: string; email: string }>(`${base}/invitations/${i.id}`, { method: "POST" }); setLink({ url: r.link, email: i.email, status: r.email, name: i.full_name }); toast(r.email === "envoye" ? "success" : "info", r.email === "envoye" ? "Invitation renvoyée par e-mail." : "Nouveau lien créé : l'e-mail n'a pas pu partir, partagez le lien."); await load(); } catch (e) { toast("error", e instanceof Error ? e.message : "Erreur"); } finally { setBusy(false); } }}><RefreshCw className="h-3.5 w-3.5" aria-hidden />Renvoyer</button>
                      {i.state === "en_attente" && <button className="btn btn-ghost !min-h-0 px-3 py-1.5 text-xs" disabled={busy} onClick={() => call(() => api(`${base}/invitations`, { method: "DELETE", body: { invitationId: i.id } }), "Invitation annulée.")}><X className="h-3.5 w-3.5" aria-hidden />Annuler</button>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {team.manage && (team.myRole === "owner" || team.myRole === "admin") && (
        <Panel title="Postes" subtitle="Postes prédéfinis pour votre secteur et postes personnalisés." actions={<button className="btn btn-ghost" onClick={() => setModal({ kind: "position" })}><Plus className="h-4 w-4" aria-hidden />Créer un poste</button>}>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {team.positions.map((p) => (
              <li key={p.key} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{p.label}{p.custom && <span className="ml-1 text-xs font-normal text-slate-500">(personnalisé)</span>}</p>
                  {p.custom && <button className="text-xs text-red-600 underline" onClick={() => confirm(`Supprimer le poste « ${p.label} » ?`) && call(() => api(`${base}/positions`, { method: "DELETE", body: { key: p.key } }), "Poste supprimé.")}>Supprimer</button>}
                </div>
                <p className="mt-1 text-xs text-slate-500">{p.permissions.length ? p.permissions.map((x) => PERMISSIONS[x]?.label ?? x).join(", ") : p.role === "admin" ? "Tous les accès, y compris la gestion des équipes" : "Tous les accès du rôle Gestionnaire"}</p>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {modal?.kind === "add" && <MemberForm team={team} base={base} onClose={() => setModal(null)} onDone={async (r) => { setModal(null); setLink(r); await load(); onChanged(); }} />}
      {modal?.kind === "edit" && <MemberForm team={team} base={base} member={modal.m} onClose={() => setModal(null)} onDone={async () => { setModal(null); toast("success", "Employé mis à jour."); await load(); }} />}
      {modal?.kind === "seats" && <SeatsForm base={base} onClose={() => setModal(null)} />}
      {modal?.kind === "position" && <PositionForm team={team} base={base} onClose={() => setModal(null)} onDone={async () => { setModal(null); toast("success", "Poste créé."); await load(); }} />}
      {link && (
        <Dialog title={link.status === "envoye" ? "Invitation envoyée" : "Invitation créée"} onClose={() => setLink(null)}>
          <p className="text-sm text-slate-700">{link.status === "envoye" ? `Un e-mail a été envoyé à ${link.email}. Vous pouvez aussi partager le lien ci-dessous.` : `L'e-mail n'a pas pu partir. Envoyez ce lien à ${link.name || link.email} par WhatsApp ou SMS.`}</p>
          <p className="mt-3 break-all rounded-lg bg-slate-100 p-2 text-xs">{link.url}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={link.url} />
            <a className="btn btn-ghost" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Bonjour${link.name ? ` ${link.name}` : ""}, vous êtes invité(e) à rejoindre l'équipe de ${team.company} sur MiniSoft RCA : ${link.url}`)}`}><MessageCircle className="h-4 w-4" aria-hidden />WhatsApp</a>
          </div>
          <p className="mt-2 text-xs text-slate-500">Lien personnel, valable 7 jours, utilisable une seule fois et uniquement avec l&apos;adresse {link.email}. Aucun mot de passe n&apos;est envoyé.</p>
        </Dialog>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone?: string }) {
  return (
    <div className="glass rounded-2xl p-4">
      <Icon className={`h-5 w-5 ${tone ?? "text-slate-500"}`} aria-hidden />
      <p className={`mt-2 text-2xl font-bold ${tone ?? "text-slate-900"}`}>{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
    </div>
  );
}
function Seat({ label, value, strong }: { label: string; value: number | string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${strong ? "text-red-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal aria-label={title} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">{title}</h3><button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" aria-hidden /></button></div>
        {children}
      </div>
    </div>
  );
}

function PermissionPicker({ allowed, value, onChange, disabled }: { allowed: Permission[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="label">Autorisations</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {allowed.map((p) => (
          <label key={p} className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${value.includes(p) ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}>
            <input type="checkbox" className="mt-0.5" checked={value.includes(p)} onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))} />
            <span><span className="block font-medium">{PERMISSIONS[p].label}</span><span className="block text-xs text-slate-500">{PERMISSIONS[p].hint}</span></span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function MemberForm({ team, base, member, onClose, onDone }: { team: Team; base: string; member?: Member; onClose: () => void; onDone: (r: { url: string; email: string; status: string; name: string }) => void }) {
  const toast = useToast();
  const choosable = team.positions.filter((p) => p.role !== "admin" || team.myRole === "owner");
  const [f, setF] = useState({ fullName: member?.name ?? "", email: member?.email ?? "", phone: member?.phone ?? "", position: member?.position || choosable.find((p) => p.role === "employee")?.key || choosable[0]?.key || "" });
  const current = team.positions.find((p) => p.key === f.position);
  const [perms, setPerms] = useState<string[]>(member?.permissions ?? current?.permissions ?? []);
  const [busy, setBusy] = useState(false);
  const fullAccess = current?.role === "admin" || current?.role === "manager";
  const allowed = team.permissions.filter((p) => p !== "equipe" || team.myRole === "owner" || team.myRole === "admin");
  return (
    <Dialog title={member ? `Modifier ${member.name}` : "Ajouter un employé"} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (member) {
              await api(`${base}/members/${member.userId}`, { method: "PATCH", body: { displayName: f.fullName, phone: f.phone, position: f.position, permissions: fullAccess ? [] : perms } });
              onDone({ url: "", email: "", status: "", name: "" });
            } else {
              const r = await api<{ link: string; email: string; emailError: string | null }>(`${base}/invitations`, { body: { ...f, permissions: fullAccess ? [] : perms } });
              onDone({ url: r.link, email: f.email, status: r.email, name: f.fullName });
            }
          } catch (err) {
            toast("error", err instanceof Error ? err.message : "Erreur");
            setBusy(false);
          }
        }}
      >
        <label className="block"><span className="label">Nom complet</span><input className="input" required minLength={2} maxLength={80} value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} autoComplete="name" /></label>
        {!member && <label className="block"><span className="label">Adresse e-mail</span><input className="input" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoComplete="email" inputMode="email" /></label>}
        <label className="block"><span className="label">Téléphone (facultatif)</span><input className="input" type="tel" maxLength={30} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" placeholder="Ex. : +236 70 00 00 00" /></label>
        <label className="block">
          <span className="label">Poste dans l&apos;entreprise</span>
          <select className="input" value={f.position} onChange={(e) => { const p = team.positions.find((x) => x.key === e.target.value); setF({ ...f, position: e.target.value }); setPerms(p?.permissions ?? []); }}>
            {choosable.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        {fullAccess ? (
          <p className="flex items-start gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{current?.role === "admin" ? "Administrateur : tous les accès, y compris la gestion des équipes." : "Responsable : tous les accès métier (sans la gestion des équipes, sauf autorisation)."}</p>
        ) : (
          <PermissionPicker allowed={allowed} value={perms} onChange={setPerms} />
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button>
          <button className="btn btn-primary" disabled={busy || (!fullAccess && perms.length === 0)}>{busy && <span className="spinner" />}{member ? "Enregistrer" : <><Mail className="h-4 w-4" aria-hidden />Envoyer l&apos;invitation</>}</button>
        </div>
        {!member && <p className="text-xs text-slate-500">L&apos;employé reçoit un e-mail avec un lien sécurisé (7 jours, usage unique). Il crée son propre compte et son mot de passe.</p>}
      </form>
    </Dialog>
  );
}

function PositionForm({ team, base, onClose, onDone }: { team: Team; base: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Créer un poste" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api(`${base}/positions`, { body: { label, permissions: perms } }); onDone(); } catch (err) { toast("error", err instanceof Error ? err.message : "Erreur"); setBusy(false); } }}>
        <label className="block"><span className="label">Nom du poste</span><input className="input" required minLength={2} maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : Livreur, Barman, Vendeur" /></label>
        <PermissionPicker allowed={team.permissions.filter((p) => p !== "equipe")} value={perms} onChange={setPerms} />
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={busy || !perms.length}>{busy && <span className="spinner" />}Créer le poste</button></div>
      </form>
    </Dialog>
  );
}

function SeatsForm({ base, onClose }: { base: string; onClose: () => void }) {
  const toast = useToast();
  const [seats, setSeats] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Demander un accès supplémentaire" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); try { await api(`${base}/seats`, { body: { seats: Number(seats), note } }); toast("success", "Demande envoyée à l'équipe MiniSoft RCA : vous serez contacté avec les conditions."); onClose(); } catch (err) { toast("error", err instanceof Error ? err.message : "Erreur"); setBusy(false); } }}>
        <p className="text-sm text-slate-600">L&apos;équipe MiniSoft RCA vous répond avec les conditions (aucun paiement n&apos;est demandé ici).</p>
        <label className="block"><span className="label">Nombre d&apos;accès en plus</span><input className="input" type="number" min={1} max={100} required value={seats} onChange={(e) => setSeats(e.target.value)} /></label>
        <label className="block"><span className="label">Message (facultatif)</span><textarea className="input" rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={busy}>{busy && <span className="spinner" />}Envoyer la demande</button></div>
      </form>
    </Dialog>
  );
}
