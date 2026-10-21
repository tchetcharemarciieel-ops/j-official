import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { STATUS, fmtDate, fmtDateTime } from "@/lib/status";
import { ROLE_LABELS, type Role } from "@/lib/spec";
import { LOW_CREDIT_THRESHOLD, SITE_URL } from "@/lib/config";
import { CopyButton } from "@/components/CopyButton";

export const metadata = { title: "Mon espace" };
export const dynamic = "force-dynamic";

export default async function Espace() {
  const profile = await requireProfile("/espace");
  const db = adminClient();
  const { data: memberships } = await db.from("project_members").select("role,project_id").eq("user_id", profile.id);
  const ids = (memberships ?? []).map((m) => m.project_id);
  const [{ data: projects }, { data: usage }, { data: plan }, { data: views }] = await Promise.all([
    ids.length ? db.from("projects").select("id,name,slug,status,sector,created_at,updated_at,published_version,draft_version,published_at").in("id", ids).order("updated_at", { ascending: false }) : Promise.resolve({ data: [] }),
    db.from("ai_usage").select("operation,engine,credits,status,created_at,error").eq("user_id", profile.id).order("created_at", { ascending: false }).limit(10),
    db.from("plans").select("name,monthly_credits").eq("id", profile.plan).single(),
    ids.length ? db.from("app_views").select("project_id,views").in("project_id", ids).gte("day", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)) : Promise.resolve({ data: [] }),
  ]);
  const roleOf = (id: string) => (memberships ?? []).find((m) => m.project_id === id)?.role as Role;
  const viewsOf = (id: string) => (views ?? []).filter((v) => v.project_id === id).reduce((a, v) => a + v.views, 0);

  return (
    <AppShell>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Bonjour{profile.full_name ? `, ${profile.full_name}` : ""} 👋</h1>
          <p className="mt-1 text-sm text-slate-400">{profile.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/modeles" className="btn btn-ghost">Partir d&apos;un modèle</Link>
          <Link href="/creer" className="btn btn-primary">+ Nouveau logiciel</Link>
        </div>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="glass rounded-2xl p-5">
          <p className="text-sm text-slate-400">Formule</p>
          <p className="mt-1 text-xl font-semibold text-white">{plan?.name ?? profile.plan}</p>
          <Link href="/espace/abonnement" className="mt-2 inline-block text-sm text-brand-300 hover:underline">Gérer l&apos;abonnement →</Link>
        </div>
        <div className={`glass rounded-2xl p-5 ${profile.credits <= LOW_CREDIT_THRESHOLD ? "border-amber-400/50" : ""}`}>
          <p className="text-sm text-slate-400">Crédits IA disponibles</p>
          <p className="mt-1 text-xl font-semibold text-white">{profile.credits}</p>
          {profile.credits <= LOW_CREDIT_THRESHOLD && <p className="mt-1 text-xs text-amber-300">⚠ Crédits presque épuisés.</p>}
        </div>
        <div className="glass rounded-2xl p-5">
          <p className="text-sm text-slate-400">Mes logiciels</p>
          <p className="mt-1 text-xl font-semibold text-white">{projects?.length ?? 0}</p>
        </div>
      </div>

      <h2 className="mt-10 font-display text-xl font-semibold text-white">Mes mini-logiciels</h2>
      {!projects?.length ? (
        <div className="glass mt-4 rounded-2xl p-10 text-center">
          <p className="text-4xl">🧩</p>
          <p className="mt-3 font-medium text-white">Aucun logiciel pour l&apos;instant</p>
          <p className="mt-1 text-sm text-slate-400">Décrivez votre problème pour créer le premier.</p>
          <Link href="/creer" className="btn btn-primary mt-5">Créer mon premier logiciel</Link>
        </div>
      ) : (
        <ul className="mt-4 grid gap-4 md:grid-cols-2">
          {projects.map((p) => {
            const st = STATUS[p.status] ?? STATUS.preparation!;
            const role = roleOf(p.id);
            const manage = role === "owner" || role === "admin";
            const url = `${SITE_URL}/apps/${p.slug}`;
            return (
              <li key={p.id} className="glass flex flex-col rounded-2xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-white">{p.name}</h3>
                    <p className="text-xs text-slate-400">{p.sector} · {ROLE_LABELS[role]}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${st.cls}`}>{st.label}</span>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-slate-500">Créé le</dt><dd className="text-slate-200">{fmtDate(p.created_at)}</dd></div>
                  <div><dt className="text-slate-500">Version</dt><dd className="text-slate-200">v{p.draft_version}{p.published_version ? ` (en ligne : v${p.published_version})` : ""}</dd></div>
                  <div><dt className="text-slate-500">Visites 30 j</dt><dd className="text-slate-200">{p.published_version ? viewsOf(p.id) : "—"}</dd></div>
                </dl>
                {p.published_version && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl bg-night-950/60 px-3 py-2 text-xs">
                    <span className="truncate text-slate-300">{url}</span>
                    <CopyButton text={url} />
                  </div>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {manage && <Link href={`/projets/${p.id}`} className="btn btn-ghost flex-1">Gérer</Link>}
                  {p.published_version && <a href={`/apps/${p.slug}`} target="_blank" rel="noopener" className="btn btn-primary flex-1">Ouvrir mon logiciel</a>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mt-10 font-display text-xl font-semibold text-white">Consommation récente</h2>
      <div className="glass mt-4 overflow-x-auto rounded-2xl">
        {!usage?.length ? (
          <p className="p-6 text-sm text-slate-400">Aucune opération pour l&apos;instant.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4">Opération</th><th className="px-4">Moteur</th><th className="px-4">Crédits</th><th className="px-4">Statut</th></tr></thead>
            <tbody>
              {usage.map((u, i) => (
                <tr key={i} className="border-t border-white/5 text-slate-300">
                  <td className="px-4 py-2">{fmtDateTime(u.created_at)}</td>
                  <td className="px-4">{{ diagnose: "Diagnostic", modify: "Modification", ask: "Question", generate: "Génération" }[u.operation as string] ?? u.operation}</td>
                  <td className="px-4">{u.engine === "ai" ? "IA" : "Règles"}</td>
                  <td className="px-4">{u.credits}</td>
                  <td className="px-4">{u.status === "success" ? "✓ Réussi" : u.status === "refunded" ? "↩ Échec remboursé" : "✗ Échec"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <form action="/auth/signout" method="post" className="mt-10">
        <button className="text-sm text-slate-400 underline hover:text-white">Se déconnecter</button>
      </form>
    </AppShell>
  );
}
