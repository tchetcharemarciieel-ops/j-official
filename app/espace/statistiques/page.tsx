import { BarChart3, FilePlus, History, Sparkles } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { loadProjects } from "@/lib/espace";
import { fmtDate } from "@/lib/status";
import { StatCard } from "@/components/espace/StatCard";

export const metadata = { title: "Statistiques" };
export const dynamic = "force-dynamic";

/** Statistiques réelles uniquement : visites des logiciels publiés, fiches, versions et consommation IA. */
export default async function Statistiques() {
  const profile = await requireProfile("/espace/statistiques");
  const projects = await loadProjects(profile);
  const ids = projects.map((p) => p.id);
  const managed = projects.filter((p) => p.role === "owner" || p.role === "admin").map((p) => p.id);
  const db = adminClient();
  const days = Array.from({ length: 30 }, (_, i) => new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10));
  const [{ data: views }, { data: records }, { data: versions }, { data: usage }] = await Promise.all([
    ids.length ? db.from("app_views").select("project_id,day,views").in("project_id", ids).gte("day", days[0]!) : Promise.resolve({ data: [] as { project_id: string; day: string; views: number }[] }),
    managed.length ? db.from("records").select("project_id,created_at").in("project_id", managed).eq("is_demo", false).limit(100000) : Promise.resolve({ data: [] as { project_id: string; created_at: string }[] }),
    ids.length ? db.from("project_versions").select("project_id").in("project_id", ids) : Promise.resolve({ data: [] as { project_id: string }[] }),
    db.from("ai_usage").select("engine,credits,status,created_at").eq("user_id", profile.id).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
  ]);
  const perDay = days.map((d) => ({ d, v: (views ?? []).filter((x) => x.day === d).reduce((a, x) => a + x.views, 0) }));
  const max = Math.max(1, ...perDay.map((x) => x.v));
  const total = perDay.reduce((a, x) => a + x.v, 0);
  const newRecords = (records ?? []).filter((r) => r.created_at >= days[0]!).length;
  const credits = (usage ?? []).reduce((a, u) => a + (u.credits ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-bold text-slate-900">Statistiques</h1>
        <p className="mt-1 text-sm text-slate-600">30 derniers jours. Chiffres calculés sur vos vraies données uniquement.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Visites des logiciels" value={total} icon={BarChart3} hint="ouvertures par vos membres" tone="sky" />
        <StatCard label="Nouvelles fiches" value={newRecords} icon={FilePlus} hint={`${(records ?? []).length.toLocaleString("fr-FR")} au total`} delay={80} />
        <StatCard label="Versions créées" value={(versions ?? []).length} icon={History} hint="depuis la création" tone="amber" delay={160} />
        <StatCard label="Crédits IA utilisés" value={credits} icon={Sparkles} hint={`${(usage ?? []).length} opération(s), solde ${profile.credits}`} tone="green" delay={240} />
      </div>

      <section className="glass rounded-2xl p-5 animate-fade-up" aria-labelledby="visites">
        <h2 id="visites" className="font-semibold text-slate-900">Visites par jour</h2>
        {total === 0 ? (
          <p className="mt-4 text-sm text-slate-600">Aucune visite sur cette période. Les visites sont comptées quand un membre ouvre un logiciel publié depuis son lien.</p>
        ) : (
          <>
            <div className="mt-5 flex h-40 items-end gap-1" role="img" aria-label={`Visites sur 30 jours : ${total} au total`}>
              {perDay.map((x) => (
                <div key={x.d} className="group relative flex h-full flex-1 items-end" title={`${fmtDate(x.d)} : ${x.v} visite(s)`}>
                  <div className="w-full rounded-t bg-blue-600 transition-all duration-500 group-hover:brightness-125" style={{ height: `${x.v ? Math.max(4, (x.v / max) * 100) : 1}%`, opacity: x.v ? 1 : 0.2 }} />
                </div>
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[10px] text-slate-500"><span>{fmtDate(days[0])}</span><span>aujourd&apos;hui</span></div>
          </>
        )}
      </section>

      <section className="glass overflow-x-auto rounded-2xl p-5 animate-fade-up">
        <h2 className="font-semibold text-slate-900">Par logiciel</h2>
        {projects.length === 0 ? <p className="mt-3 text-sm text-slate-600">Aucun logiciel.</p> : (
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Logiciel</th><th className="pr-4">Visites (30 j)</th><th className="pr-4">Fiches réelles</th><th className="pr-4">Versions</th><th>Publication</th></tr></thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 text-slate-800">
                  <td className="py-2.5 pr-4">{p.name}</td>
                  <td className="pr-4">{(views ?? []).filter((v) => v.project_id === p.id).reduce((a, v) => a + v.views, 0)}</td>
                  <td className="pr-4">{managed.includes(p.id) ? (records ?? []).filter((r) => r.project_id === p.id).length : "—"}</td>
                  <td className="pr-4">{(versions ?? []).filter((v) => v.project_id === p.id).length}</td>
                  <td className="text-xs text-slate-600">{p.publishedAt ? `v${p.publishedVersion} le ${fmtDate(p.publishedAt)}` : "non publié"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
