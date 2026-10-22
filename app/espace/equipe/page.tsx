import { ExternalLink, Mail } from "lucide-react";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { loadProjects } from "@/lib/espace";
import { ROLE_LABELS, type Role } from "@/lib/spec";
import { fmtDate } from "@/lib/status";

export const metadata = { title: "Mon équipe" };
export const dynamic = "force-dynamic";

export default async function MonEquipe() {
  const profile = await requireProfile("/espace/equipe");
  const all = await loadProjects(profile);
  const managed = all.filter((p) => p.role === "owner" || p.role === "admin");
  const memberOf = all.filter((p) => p.role !== "owner" && p.role !== "admin");
  const ids = managed.map((p) => p.id);
  const db = adminClient();
  const [{ data: members }, { data: invites }] = await Promise.all([
    ids.length ? db.from("project_members").select("project_id,user_id,role,created_at").in("project_id", ids) : Promise.resolve({ data: [] as { project_id: string; user_id: string; role: string; created_at: string }[] }),
    ids.length ? db.from("invitations").select("project_id,email,role,expires_at").in("project_id", ids).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()) : Promise.resolve({ data: [] as { project_id: string; email: string; role: string; expires_at: string }[] }),
  ]);
  const userIds = Array.from(new Set((members ?? []).map((m) => m.user_id)));
  const { data: people } = userIds.length ? await db.from("profiles").select("id,email,full_name").in("id", userIds) : { data: [] };
  const who = Object.fromEntries((people ?? []).map((x) => [x.id, x]));
  const uniquePeople = userIds.filter((u) => u !== profile.id).length;

  return (
    <div className="stagger space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end animate-fade-up">
        <div>
          <h1 className="font-display text-3xl font-bold text-slate-900">Mon équipe</h1>
          <p className="mt-1 text-sm text-slate-600">{uniquePeople} collaborateur{uniquePeople > 1 ? "s" : ""} sur vos logiciels · {(invites ?? []).length} invitation(s) en attente. Chaque droit est vérifié par le serveur.</p>
        </div>
      </div>
      {managed.length === 0 && <div className="glass rounded-2xl p-8 text-center text-sm text-slate-600">Créez un logiciel pour inviter votre équipe.</div>}
      {managed.map((p, i) => {
        const list = (members ?? []).filter((m) => m.project_id === p.id);
        const pending = (invites ?? []).filter((v) => v.project_id === p.id);
        return (
          <section key={p.id} className="glass rounded-2xl p-5 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="font-semibold text-slate-900">{p.name} <span className="text-sm font-normal text-slate-500">· {list.length} membre(s)</span></h2>
              <Link href={`/projets/${p.id}?onglet=equipe`} className="btn btn-primary !min-h-0 py-2 text-xs">+ Inviter · gérer les rôles</Link>
            </div>
            <ul className="stagger-x mt-4 grid gap-2 sm:grid-cols-2">
              {list.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 transition hover:bg-slate-50">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white">{(who[m.user_id]?.full_name || who[m.user_id]?.email || "?").slice(0, 2).toUpperCase()}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-900">{who[m.user_id]?.full_name || who[m.user_id]?.email || "—"}{m.user_id === profile.id && " (vous)"}</span>
                    <span className="block truncate text-xs text-slate-500">{who[m.user_id]?.email} · depuis le {fmtDate(m.created_at)}</span>
                  </span>
                  <span className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">{ROLE_LABELS[m.role as Role]}</span>
                </li>
              ))}
              {pending.map((v) => (
                <li key={v.email} className="flex items-center gap-3 rounded-xl border border-dashed border-slate-200 px-3 py-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500" aria-hidden><Mail className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-slate-700">{v.email}</span>
                    <span className="block text-xs text-slate-500">Invitation en attente · expire le {fmtDate(v.expires_at)}</span>
                  </span>
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-800">{ROLE_LABELS[v.role as Role]}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {memberOf.length > 0 && (
        <section className="glass rounded-2xl p-5">
          <h2 className="font-semibold text-slate-900">Logiciels auxquels vous participez</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {memberOf.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3">
                <span className="text-slate-800">{p.name} <span className="text-slate-500">· {ROLE_LABELS[p.role]}</span></span>
                {p.publishedVersion ? <a href={`/apps/${p.slug}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">Ouvrir<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : <span className="text-xs text-slate-500">pas encore publié</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
