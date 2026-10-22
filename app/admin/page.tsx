import { requireAdmin } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { STATUS, fmtDate, fmtDateTime } from "@/lib/status";
import { TEMPLATES } from "@/lib/templates";
import { aiChain, aiConfig } from "@/lib/ai";
import { lastAiSuccess } from "@/lib/ai-quota";
import { AiTestButton } from "./AiTestButton";
import { getPlans, xaf } from "@/lib/plans";
import { AdminUsers, AdminProjects, AdminLeads } from "./AdminTables";

export const metadata = { title: "Administration" };
export const dynamic = "force-dynamic";

/** Espace réservé aux administrateurs de la plateforme (vérifié côté serveur). */
export default async function Admin() {
  await requireAdmin();
  const db = adminClient();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [users, projects, usage, errors, records, plans, views, leads] = await Promise.all([
    db.from("profiles").select("id,email,full_name,plan,credits,is_admin,suspended,created_at").order("created_at", { ascending: false }).limit(200),
    db.from("projects").select("id,name,slug,status,owner_id,template_id,created_at,published_version").order("created_at", { ascending: false }).limit(200),
    db.from("ai_usage").select("operation,engine,model,input_tokens,output_tokens,cost_xaf,credits,status,error,created_at,user_id").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("audit_logs").select("action,level,details,created_at,project_id").in("level", ["error", "warning"]).order("created_at", { ascending: false }).limit(50),
    db.from("records").select("id", { count: "exact", head: true }).eq("is_demo", false),
    getPlans(),
    db.from("app_views").select("views").gte("day", since.slice(0, 10)),
    db.from("leads").select("id,name,company,sector,phone,email,message,source,status,created_at").order("created_at", { ascending: false }).limit(200),
  ]);
  const cfg = aiConfig();
  const lastOk = cfg ? await lastAiSuccess().catch(() => null) : null;
  const u = usage.data ?? [];
  const totalCost = u.reduce((a, x) => a + (x.cost_xaf ?? 0), 0);
  const generations = u.filter((x) => x.operation === "diagnose").length;
  const failed = u.filter((x) => x.status !== "success").length;
  const emails = Object.fromEntries((users.data ?? []).map((x) => [x.id, x.email]));
  const perTemplate = (id: string) => (projects.data ?? []).filter((p) => p.template_id === id).length;

  const tiles = [
    ["Comptes", users.data?.length ?? 0],
    ["Logiciels", projects.data?.length ?? 0],
    ["Publiés", (projects.data ?? []).filter((p) => p.status === "published").length],
    ["Diagnostics (30 j)", generations],
    ["Opérations IA échouées (30 j)", failed],
    ["Coût IA estimé (30 j)", xaf(totalCost)],
    ["Fiches réelles stockées", records.count ?? 0],
    ["Visites des logiciels (30 j)", (views.data ?? []).reduce((a, v) => a + v.views, 0)],
  ];

  return (
    <AppShell wide>
      <h1 className="font-display text-3xl font-bold text-slate-900">Administration MiniSoft RCA</h1>
      <p className="mt-1 text-sm text-slate-600">Paiement : non configuré</p>
      <section className="glass mt-6 rounded-xl p-5" aria-labelledby="ia">
        <h2 id="ia" className="font-semibold text-slate-900">Fournisseur IA</h2>
        <p className="mt-1 text-sm text-slate-700">
          {cfg ? `Configuré : ${cfg.label} · modèle ${cfg.model}.` : "Non configuré : toutes les analyses passent par le système de secours (mots-clés)."}{" "}
          {cfg && aiChain().length > 1 && `Modèles de secours si la limite est atteinte : ${aiChain().slice(1).map((c) => `${c.label} ${c.model}`).join(" → ")}.`}{" "}
          {cfg && (lastOk ? `Dernière réponse réelle réussie : ${fmtDateTime(lastOk.at)}${lastOk.model ? ` (${lastOk.model})` : ""}.` : "Aucune requête IA réussie pour l'instant : la connexion n'est pas encore vérifiée.")}
        </p>
        {cfg && <div className="mt-3"><AiTestButton /></div>}
      </section>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map(([l, v]) => (
          <div key={String(l)} className="glass rounded-2xl p-4"><p className="text-xs text-slate-600">{l}</p><p className="mt-1 text-xl font-semibold text-slate-900">{v}</p></div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-slate-900">Demandes de démonstration ({(leads.data ?? []).filter((l) => l.status === "nouveau").length} nouvelle(s))</h2>
        <AdminLeads leads={(leads.data ?? []).map((l) => ({ ...l, created: fmtDateTime(l.created_at) }))} />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-slate-900">Comptes, abonnements et quotas</h2>
        <AdminUsers users={(users.data ?? []).map((x) => ({ ...x, created: fmtDate(x.created_at) }))} plans={plans.map((p) => ({ id: p.id, name: p.name }))} />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold text-slate-900">Projets et publications</h2>
        <AdminProjects projects={(projects.data ?? []).map((p) => ({ id: p.id, name: p.name, slug: p.slug, status: p.status, statusLabel: STATUS[p.status]?.label ?? p.status, owner: emails[p.owner_id] ?? "—", created: fmtDate(p.created_at), published: Boolean(p.published_version) }))} />
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold text-slate-900">Suivi des générations et coûts IA</h2>
          <div className="mt-3 max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500"><tr><th className="py-1">Date</th><th>Compte</th><th>Opération</th><th>Jetons</th><th>Coût</th><th>Statut</th></tr></thead>
              <tbody>
                {u.slice(0, 100).map((x, i) => (
                  <tr key={i} className="border-t border-slate-100 text-slate-700">
                    <td className="py-1 pr-2">{fmtDateTime(x.created_at)}</td>
                    <td className="max-w-32 truncate pr-2">{emails[x.user_id] ?? "—"}</td>
                    <td className="pr-2">{x.operation} ({x.engine})</td>
                    <td className="pr-2">{x.input_tokens + x.output_tokens}</td>
                    <td className="pr-2">{xaf(x.cost_xaf)}</td>
                    <td title={x.error ?? ""}>{x.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="glass rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold text-slate-900">Erreurs techniques et alertes</h2>
          <ul className="mt-3 max-h-96 space-y-2 overflow-auto text-xs">
            {(errors.data ?? []).length === 0 && <li className="text-slate-600">Aucune erreur.</li>}
            {(errors.data ?? []).map((e, i) => (
              <li key={i} className={e.level === "error" ? "text-red-700" : "text-amber-800"}>
                {fmtDateTime(e.created_at)} · {e.action} · <span className="text-slate-600">{JSON.stringify(e.details).slice(0, 160)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="glass mt-10 rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold text-slate-900">Modèles disponibles</h2>
        <p className="mt-1 text-xs text-slate-600">Les modèles sont définis dans le code (lib/templates.ts) et versionnés avec la plateforme.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {TEMPLATES.map((t) => <li key={t.id} className="rounded-xl border border-slate-200 p-3 text-sm text-slate-800">{t.name}<span className="block text-xs text-slate-500">{t.category} · {perTemplate(t.id)} utilisation(s)</span></li>)}
        </ul>
      </section>
    </AppShell>
  );
}
