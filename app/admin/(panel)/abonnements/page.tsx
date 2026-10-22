import Link from "next/link";
import { adminClient } from "@/lib/supabase/admin";
import { getPlans, xaf } from "@/lib/plans";
import { activePaymentProvider, PAYMENT_PROVIDERS } from "@/lib/payments";
import { fmtDate, fmtDateTime } from "@/lib/status";
import { Badge, Card, Empty, PageHeader, Table, Tile, fmtXaf } from "@/components/admin/ui";
import { JsonForm } from "@/components/admin/Controls";
import { Action } from "@/components/admin/Action";

export const metadata = { title: "Abonnements et paiements" };

const PAY_LABEL = { succeeded: ["Réussi (confirmé par le prestataire)", "green"], pending: ["En attente de confirmation", "amber"], failed: ["Échoué", "red"], refunded: ["Remboursé", "slate"] } as const;

const PLAN_FIELDS = [
  { name: "name", label: "Nom", max: 40 },
  { name: "price_xaf", label: "Prix mensuel (FCFA)", type: "number" as const },
  { name: "monthly_credits", label: "Crédits IA par mois", type: "number" as const },
  { name: "max_projects", label: "Logiciels maximum", type: "number" as const },
  { name: "max_members", label: "Utilisateurs par logiciel", type: "number" as const },
  { name: "description", label: "Description", max: 200 },
  { name: "sort", label: "Ordre d'affichage", type: "number" as const },
  { name: "can_publish", label: "Publication autorisée", type: "checkbox" as const },
  { name: "ai_modifications", label: "Modifications par IA autorisées", type: "checkbox" as const },
  { name: "active", label: "Proposée aux clients", type: "checkbox" as const },
];

export default async function Billing({ searchParams }: { searchParams: Promise<{ abonnements?: string; paiements?: string }> }) {
  const { abonnements = "active", paiements = "" } = await searchParams;
  const db = adminClient();
  // Suivi : un abonnement dont la date de fin est passée devient « expiré ».
  await db.from("subscriptions").update({ status: "expired" }).eq("status", "active").lt("ends_at", new Date().toISOString());
  const [plans, { data: subs }, { data: pays }, { data: users }] = await Promise.all([
    getPlans({ includeInactive: true }),
    db.from("subscriptions").select("id,user_id,plan_id,status,source,started_at,ends_at").order("created_at", { ascending: false }).limit(2000),
    db.from("payments").select("id,user_id,plan_id,provider,provider_ref,amount_xaf,status,created_at,confirmed_at").order("created_at", { ascending: false }).limit(2000),
    db.from("profiles").select("id,email").limit(10000),
  ]);
  const provider = activePaymentProvider();
  const email = (id: string | null) => users?.find((u) => u.id === id)?.email ?? "—";
  const planName = (id: string | null) => plans.find((p) => p.id === id)?.name ?? id ?? "—";
  const subList = (subs ?? []).filter((s) => !abonnements || s.status === abonnements);
  const payList = (pays ?? []).filter((p) => !paiements || p.status === paiements);
  const succeeded = (pays ?? []).filter((p) => p.status === "succeeded");

  return (
    <div className="space-y-4">
      <PageHeader title="Abonnements et paiements" subtitle="Formules, abonnements et transactions. Un paiement n'est « réussi » qu'après confirmation du prestataire." />

      <Card>
        {provider ? (
          <p className="text-sm"><Badge tone="green">Paiement en ligne actif</Badge> Prestataire : {provider.label}</p>
        ) : (
          <div className="text-sm text-slate-700">
            <p><Badge tone="amber">Aucun prestataire de paiement configuré</Badge></p>
            <p className="mt-2">Aucun paiement en ligne n&apos;est possible pour l&apos;instant ; les formules sont attribuées manuellement depuis la fiche d&apos;un utilisateur (enregistrées comme « manuel », sans paiement). L&apos;architecture (lib/payments.ts) est prête à recevoir un prestataire adapté à la RCA : Mobile Money (Orange Money, Moov Money) via un agrégateur comme CinetPay, ou un autre prestataire disposant de notifications signées.</p>
            {PAYMENT_PROVIDERS.length === 0 && <p className="mt-1 text-xs text-slate-500">Prestataires intégrés : aucun pour l&apos;instant.</p>}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Abonnements actifs" value={(subs ?? []).filter((s) => s.status === "active").length} />
        <Tile label="Abonnements expirés" value={(subs ?? []).filter((s) => s.status === "expired").length} />
        <Tile label="Paiements réussis" value={succeeded.length} hint={succeeded.length ? fmtXaf(succeeded.reduce((a, p) => a + p.amount_xaf, 0)) : undefined} />
        <Tile label="Paiements en attente / échoués" value={`${(pays ?? []).filter((p) => p.status === "pending").length} / ${(pays ?? []).filter((p) => p.status === "failed").length}`} />
      </div>

      <Card title="Formules tarifaires" subtitle="Désactiver une formule la retire des offres ; ses abonnés la conservent. Les formules ne sont jamais supprimées.">
        <div className="grid gap-3 lg:grid-cols-2">
          {plans.map((p) => (
            <details key={p.id} className="rounded-lg border border-slate-200 p-3">
              <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{p.name} <span className="text-xs text-slate-500">({p.id})</span></span>
                <span className="text-sm">{p.price_xaf ? `${xaf(p.price_xaf)} / mois` : "Gratuit"} {p.active === false && <Badge>désactivée</Badge>}</span>
              </summary>
              <div className="mt-3">
                <JsonForm url={`/api/admin/plans/${p.id}`} method="PATCH" initial={{ name: p.name, price_xaf: p.price_xaf, monthly_credits: p.monthly_credits, max_projects: p.max_projects, max_members: p.max_members, description: p.description, sort: p.sort, can_publish: p.can_publish, ai_modifications: p.ai_modifications, active: p.active !== false }} fields={PLAN_FIELDS} done="Formule mise à jour." />
              </div>
            </details>
          ))}
          <details className="rounded-lg border border-dashed border-slate-300 p-3">
            <summary className="cursor-pointer font-medium text-blue-700">+ Nouvelle formule</summary>
            <div className="mt-3">
              <JsonForm url="/api/admin/plans" method="POST" initial={{ id: "", name: "", price_xaf: 0, monthly_credits: 50, max_projects: 1, max_members: 1, description: "", sort: plans.length + 1, can_publish: false, ai_modifications: true, active: true }} fields={[{ name: "id", label: "Identifiant (ex. premium)", max: 30 }, ...PLAN_FIELDS]} submitLabel="Créer la formule" done="Formule créée." />
            </div>
          </details>
        </div>
      </Card>

      <Card title="Abonnements" actions={<form className="flex gap-2"><select name="abonnements" defaultValue={abonnements} className="rounded-lg border border-slate-200 px-2 py-1 text-sm"><option value="">Tous</option><option value="active">Actifs</option><option value="expired">Expirés</option><option value="canceled">Résiliés</option><option value="pending">En attente</option></select><button className="rounded-lg border border-slate-200 px-2 py-1 text-sm">Filtrer</button></form>}>
        {subList.length === 0 ? <Empty>Aucun abonnement.</Empty> : (
          <Table head={["Client", "Formule", "Statut", "Origine", "Début", "Fin"]}>
            {subList.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2"><Link href={`/admin/utilisateurs/${s.user_id}`} className="text-blue-700 hover:underline">{email(s.user_id)}</Link></td>
                <td className="px-3 py-2">{planName(s.plan_id)}</td>
                <td className="px-3 py-2"><Badge tone={s.status === "active" ? "green" : s.status === "expired" ? "amber" : "slate"}>{s.status}</Badge></td>
                <td className="px-3 py-2">{s.source}</td>
                <td className="px-3 py-2">{fmtDate(s.started_at)}</td>
                <td className="px-3 py-2">{s.ends_at ? fmtDate(s.ends_at) : "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Card title="Transactions" actions={<form className="flex gap-2"><select name="paiements" defaultValue={paiements} className="rounded-lg border border-slate-200 px-2 py-1 text-sm"><option value="">Toutes</option><option value="succeeded">Réussies</option><option value="pending">En attente</option><option value="failed">Échouées</option><option value="refunded">Remboursées</option></select><button className="rounded-lg border border-slate-200 px-2 py-1 text-sm">Filtrer</button></form>}>
        {payList.length === 0 ? <Empty>{provider ? "Aucune transaction." : "Aucune transaction : aucun prestataire de paiement n'est branché."}</Empty> : (
          <Table head={["Date", "Client", "Formule", "Montant", "Prestataire", "Statut", ""]}>
            {payList.map((p) => {
              const [label, tone] = PAY_LABEL[p.status as keyof typeof PAY_LABEL] ?? [p.status, "slate"];
              const canRefund = p.status === "succeeded" && Boolean(PAYMENT_PROVIDERS.find((x) => x.id === p.provider)?.refund);
              return (
                <tr key={p.id}>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDateTime(p.created_at)}</td>
                  <td className="px-3 py-2">{email(p.user_id)}</td>
                  <td className="px-3 py-2">{planName(p.plan_id)}</td>
                  <td className="px-3 py-2">{fmtXaf(p.amount_xaf)}</td>
                  <td className="px-3 py-2">{p.provider}<span className="block text-xs text-slate-500">{p.provider_ref ?? ""}</span></td>
                  <td className="px-3 py-2"><Badge tone={tone}>{label}</Badge></td>
                  <td className="px-3 py-2 text-right">{canRefund && <Action url={`/api/admin/payments/${p.id}/refund`} label="Rembourser" confirm={`Rembourser ${fmtXaf(p.amount_xaf)} via ${p.provider} ?`} danger done="Remboursement effectué." />}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
