import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { aiConfig, refreshAiSettings } from "@/lib/ai";
import { activePaymentProvider } from "@/lib/payments";
import { monthlySums, sinceDays, weeklyCounts } from "@/lib/admin-stats";
import { fmtDateTime } from "@/lib/status";
import { BarChart, Card, PageHeader, Tile, fmtXaf } from "@/components/admin/ui";

export const metadata = { title: "Vue d'ensemble" };

/** Tableau de bord du propriétaire : uniquement des chiffres issus de la base. */
export default async function Overview() {
  const db = adminClient();
  const since12w = sinceDays(84);
  const [profiles, projects, activeSubs, payments, aiUsage, tickets, recent, sites, zp, push] = await Promise.all([
    db.from("profiles").select("id,created_at,company_name,suspended").limit(10000),
    db.from("projects").select("id,status,created_at,published_version").limit(10000),
    db.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    db.from("payments").select("amount_xaf,status,confirmed_at,created_at").limit(10000),
    db.from("ai_usage").select("engine,status,cost_xaf").gte("created_at", sinceDays(30)).limit(10000),
    db.from("support_tickets").select("id", { count: "exact", head: true }).neq("status", "resolu"),
    db.from("audit_logs").select("action,level,details,created_at").order("created_at", { ascending: false }).limit(8),
    db.from("websites").select("status").limit(5000),
    db.from("payment_providers").select("enabled,mode").eq("provider", "zingopay").limit(5000),
    db.from("records").select("id", { count: "exact", head: true }).eq("entity", "push:order"),
  ]);
  const users = profiles.data ?? [];
  const planOf = (await db.from("profiles").select("plan").limit(10000)).data ?? [];
  const plans = ["decouverte", "pro", "business", "agence"].map((id) => ({ id, n: planOf.filter((x) => x.plan === id).length }));
  const siteList = sites.data ?? [];
  const zpList = zp.data ?? [];
  const sas = { key: /^sk_(test|live)_/.test((process.env.SASPAY_SECRET_KEY || "").trim()), hook: Boolean((process.env.SASPAY_WEBHOOK_SECRET || "").trim()), live: (process.env.SASPAY_SECRET_KEY || "").trim().startsWith("sk_live_") };
  const projs = projects.data ?? [];
  const pays = payments.data ?? [];
  const ai = aiUsage.data ?? [];
  const provider = activePaymentProvider();
  const succeeded = pays.filter((p) => p.status === "succeeded");
  const revenue = succeeded.reduce((a, p) => a + p.amount_xaf, 0);
  await refreshAiSettings();
  const cfg = aiConfig();

  return (
    <div>
      <PageHeader title="Vue d'ensemble" subtitle="Chiffres calculés en direct sur les données de la plateforme." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Utilisateurs inscrits" value={users.length} hint={`${users.filter((u) => u.suspended).length} suspendu(s)`} />
        <Tile label="Entreprises enregistrées" value={users.filter((u) => (u.company_name ?? "").trim()).length} hint="profil entreprise renseigné" />
        <Tile label="Mini-logiciels créés" value={projs.length} />
        <Tile label="Publiés et actifs" value={projs.filter((p) => p.status === "published").length} />
        <Tile label="Nouveaux cette semaine" value={users.filter((u) => u.created_at >= sinceDays(7)).length} hint="inscriptions sur 7 jours" />
        <Tile label="Abonnements actifs" value={activeSubs.count ?? 0} />
        <Tile label="Revenus confirmés" value={provider ? fmtXaf(revenue) : "—"} hint={provider ? `${succeeded.length} paiement(s) réussi(s)` : "aucun fournisseur de paiement configuré"} tone={provider ? "default" : "muted"} />
        <Tile label="Paiements en attente" value={provider ? pays.filter((p) => p.status === "pending").length : "—"} tone={provider ? "default" : "muted"} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <Card title="Paiement des formules (SasPay)" actions={<Link href="/admin/abonnements" className="text-sm text-blue-700 hover:underline">Voir</Link>}>
          <ul className="space-y-1.5 text-sm">
            <li>{sas.key ? "✓" : "✗"} Clé API {sas.key ? (sas.live ? "(réelle)" : "(test)") : "absente de Render"}</li>
            <li>{sas.hook ? "✓" : "✗"} Secret du webhook {sas.hook ? "" : "absent"}</li>
            <li className={sas.key ? "text-green-700" : "text-amber-800"}>{sas.key ? "Activation Pro automatique en service." : "Activation Pro à faire à la main (Utilisateurs)."}</li>
          </ul>
        </Card>
        <Card title="Formules des clients" actions={<Link href="/admin/utilisateurs" className="text-sm text-blue-700 hover:underline">Gérer</Link>}>
          <dl className="grid grid-cols-2 gap-2 text-center text-sm">
            {plans.map((p) => <div key={p.id} className="rounded-lg bg-slate-50 p-2"><dt className="text-xs capitalize text-slate-500">{p.id === "decouverte" ? "Découverte" : p.id}</dt><dd className="font-semibold">{p.n}</dd></div>)}
          </dl>
        </Card>
        <Card title="Sites Internet connectés" actions={<Link href="/admin/sites" className="text-sm text-blue-700 hover:underline">Voir</Link>}>
          <p className="text-3xl font-bold">{siteList.filter((s) => s.status === "connected").length}</p>
          <p className="text-sm text-slate-500">connecté(s) · {siteList.filter((s) => s.status === "pending").length} en attente du code</p>
        </Card>
        <Card title="Restaurants : paiement et suivi">
          <ul className="space-y-1.5 text-sm">
            <li>ZingoPay activé : <b>{zpList.filter((x) => x.enabled).length}</b> restaurant(s){zpList.some((x) => x.mode === "test") ? ` (${zpList.filter((x) => x.mode === "test").length} en test)` : ""}</li>
            <li>Clients abonnés aux notifications de commande : <b>{push.count ?? 0}</b></li>
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Inscriptions" subtitle="par semaine, 12 dernières semaines">
          <BarChart points={weeklyCounts(users.map((u) => u.created_at).filter((d) => d >= since12w))} />
        </Card>
        <Card title="Logiciels créés" subtitle="par semaine, 12 dernières semaines">
          <BarChart points={weeklyCounts(projs.map((p) => p.created_at).filter((d) => d >= since12w))} />
        </Card>
        <Card title="Revenus confirmés" subtitle="par mois, en FCFA">
          {provider ? <BarChart points={monthlySums(succeeded.map((p) => ({ at: p.confirmed_at ?? p.created_at, amount: p.amount_xaf })))} unit="FCFA" /> : <p className="py-8 text-center text-sm text-slate-500">Aucun fournisseur de paiement n&apos;est configuré : aucun revenu ne peut être enregistré.</p>}
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Intelligence artificielle" subtitle="30 derniers jours" actions={<Link href="/admin/ia" className="text-sm text-blue-700 hover:underline">Gérer</Link>}>
          <p className="text-sm">{cfg ? `Configurée : ${cfg.label} · ${cfg.model}` : "Non configurée : règles prédéfinies uniquement."}</p>
          <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Requêtes IA</dt><dd className="font-semibold">{ai.filter((x) => x.engine === "ai").length}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Erreurs</dt><dd className="font-semibold">{ai.filter((x) => x.status !== "success").length}</dd></div>
            <div className="rounded-lg bg-slate-50 p-2"><dt className="text-xs text-slate-500">Coût estimé</dt><dd className="font-semibold">{fmtXaf(ai.reduce((a, x) => a + (x.cost_xaf ?? 0), 0))}</dd></div>
          </dl>
        </Card>
        <Card title="Support" actions={<Link href="/admin/support" className="text-sm text-blue-700 hover:underline">Ouvrir</Link>}>
          <p className="text-3xl font-bold">{tickets.count ?? 0}</p>
          <p className="text-sm text-slate-500">demande(s) non résolue(s)</p>
        </Card>
        <Card title="Dernières activités" actions={<Link href="/admin/activite" className="text-sm text-blue-700 hover:underline">Journal</Link>}>
          <ul className="space-y-1.5 text-xs">
            {(recent.data ?? []).map((e, i) => (
              <li key={i} className={e.level === "error" ? "text-red-700" : e.level === "warning" ? "text-amber-800" : "text-slate-700"}>
                <span className="text-slate-400">{fmtDateTime(e.created_at)}</span> · {e.action}
              </li>
            ))}
            {(recent.data ?? []).length === 0 && <li className="text-slate-500">Aucune activité.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
