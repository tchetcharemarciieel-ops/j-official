import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { loadProjects } from "@/lib/espace";
import { fmtDateTime } from "@/lib/status";

export const metadata = { title: "Mes données" };
export const dynamic = "force-dynamic";

export default async function MesDonnees() {
  const profile = await requireProfile("/espace/donnees");
  const projects = (await loadProjects(profile)).filter((p) => p.role === "owner" || p.role === "admin");
  const ids = projects.map((p) => p.id);
  const db = adminClient();
  const [{ data: records }, { data: backups }] = await Promise.all([
    ids.length ? db.from("records").select("project_id,entity,is_demo").in("project_id", ids).limit(100000) : Promise.resolve({ data: [] as { project_id: string; entity: string; is_demo: boolean }[] }),
    ids.length ? db.from("backups").select("project_id,created_at,record_count").in("project_id", ids).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as { project_id: string; created_at: string; record_count: number }[] }),
  ]);
  const count = (pid: string, entity?: string, demo = false) => (records ?? []).filter((r) => r.project_id === pid && r.is_demo === demo && (!entity || r.entity === entity)).length;

  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-bold text-white">Mes données</h1>
        <p className="mt-1 text-sm text-slate-400">Les fiches enregistrées dans vos logiciels. Vos données réelles sont séparées des données de démonstration et ne sont visibles que par vos membres.</p>
      </div>
      {projects.length === 0 ? (
        <div className="glass rounded-2xl p-8 text-center text-sm text-slate-400">Aucun logiciel dont vous êtes propriétaire ou administrateur. <Link href="/creer" className="text-brand-300 underline">Créer un logiciel</Link></div>
      ) : (
        <div className="space-y-4">
          {projects.map((p, i) => {
            const last = (backups ?? []).find((b) => b.project_id === p.id);
            const real = count(p.id);
            return (
              <section key={p.id} className="glass rounded-2xl p-5 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }} aria-labelledby={`d-${p.id}`}>
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl text-xs font-bold text-white" style={{ background: p.primary }}>{p.logoText}</span>
                    <div>
                      <h2 id={`d-${p.id}`} className="font-semibold text-white">{p.name}</h2>
                      <p className="text-xs text-slate-500">{real.toLocaleString("fr-FR")} fiche(s) réelle(s) · {count(p.id, undefined, true)} de démonstration · {last ? `dernière sauvegarde ${fmtDateTime(last.created_at)}` : "aucune sauvegarde"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a href={`/api/projects/${p.id}/export`} className="btn btn-ghost !min-h-0 py-2 text-xs" download>⬇ Tout exporter (JSON)</a>
                    <Link href={`/projets/${p.id}?onglet=donnees`} className="btn btn-ghost !min-h-0 py-2 text-xs">📥 Importer · 💾 Sauvegarder</Link>
                  </div>
                </div>
                {p.entities.length > 0 && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-xs uppercase text-slate-500"><tr><th className="py-2 pr-4">Table</th><th className="pr-4">Fiches réelles</th><th className="text-right">Export</th></tr></thead>
                      <tbody>
                        {p.entities.map((e) => {
                          const n = count(p.id, e.key);
                          return (
                            <tr key={e.key} className="border-t border-white/5 text-slate-200">
                              <td className="py-2.5 pr-4">{e.icon} {e.label}</td>
                              <td className="pr-4">{n.toLocaleString("fr-FR")}</td>
                              <td className="text-right">{n > 0 ? <a href={`/api/projects/${p.id}/export?table=${e.key}`} className="text-brand-300 hover:underline" download>CSV (Excel)</a> : <span className="text-slate-600">—</span>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {real === 0 && <p className="mt-3 text-xs text-slate-500">Les fiches réelles apparaissent une fois le logiciel publié et utilisé, ou après un import de fichier Excel/CSV.</p>}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
