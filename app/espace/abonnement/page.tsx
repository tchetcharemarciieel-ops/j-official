import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { getPlans, PLAN_PAYMENT_LINKS, xaf } from "@/lib/plans";
import { billingEnabled, reconcilePending } from "@/lib/billing";
import { PaymentWatcher } from "@/components/espace/PaymentWatcher";
import { CREDIT_COSTS, MAX_PROJECTS_PER_ACCOUNT } from "@/lib/config";

export const metadata = { title: "Abonnement" };
export const dynamic = "force-dynamic";

export default async function Abonnement({ searchParams }: { searchParams: Promise<{ logiciel?: string; paiement?: string; erreur?: string }> }) {
  let profile = await requireProfile("/espace/abonnement");
  const { logiciel, paiement, erreur } = await searchParams;
  const online = billingEnabled();
  // Paiements SasPay en attente : vérifiés auprès de SasPay à chaque ouverture de la page.
  const check = online ? await reconcilePending({ userId: profile.id, limit: 5 }).catch(() => ({ activated: 0, pending: 0 })) : { activated: 0, pending: 0 };
  if (check.activated) {
    const { data } = await adminClient().from("profiles").select("plan,credits").eq("id", profile.id).maybeSingle();
    if (data) profile = { ...profile, plan: data.plan as string, credits: data.credits as number };
  }
  const { data: locked } = logiciel && /^[0-9a-f-]{36}$/i.test(logiciel) ? await adminClient().from("projects").select("name").eq("id", logiciel).eq("owner_id", profile.id).maybeSingle() : { data: null };
  const plans = await getPlans();
  const curPlan = plans.find((p) => p.id === profile.plan);
  const pro = plans.find((p) => p.id === "pro");
  const PayButton = ({ planId, label, className }: { planId: string; label: string; className: string }) =>
    online ? (
      <form action="/api/billing/checkout" method="post" className="contents">
        <input type="hidden" name="plan" value={planId} />
        <button type="submit" className={className}>{label}</button>
      </form>
    ) : PLAN_PAYMENT_LINKS[planId] ? (
      <a href={PLAN_PAYMENT_LINKS[planId]} target="_blank" rel="noopener noreferrer" className={className}>{label}</a>
    ) : null;
  return (
    <div>
      <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Abonnement et crédits</h1>
      <p className="mt-2 text-sm text-slate-600">Solde actuel : <strong className="text-slate-900">{profile.credits} crédits</strong>. Coûts : diagnostic {CREDIT_COSTS.diagnose}, modification {CREDIT_COSTS.modify}, question {CREDIT_COSTS.ask}. Une opération IA échouée est remboursée automatiquement ; l&apos;analyse par règles est gratuite.</p>
      {(check.activated > 0 || paiement === "ok") && curPlan?.can_publish && (
        <p role="status" className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Paiement confirmé par SasPay : votre formule <strong>{curPlan.name}</strong> est active. <Link href="/espace" className="font-semibold underline">Ouvrir mon logiciel</Link>
        </p>
      )}
      {erreur && <p role="alert" className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erreur.slice(0, 200)}</p>}
      {online && check.pending > 0 && !check.activated && <PaymentWatcher />}
      {locked && !curPlan?.can_publish && (
        <div className="mt-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-amber-50 px-5 py-4">
          <p className="font-semibold text-slate-900">Débloquez « {locked.name} »</p>
          <p className="mt-1 text-sm text-slate-700">Votre logiciel est généré et conservé. Choisissez une formule avec publication (à partir de la formule Pro) : il s&apos;ouvrira aussitôt, avec vos réponses et votre plan.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <PayButton planId="pro" label={`Payer la formule Pro · ${xaf(pro?.price_xaf ?? 15000)}`} className="btn btn-primary" />
            {!online && <Link href="/espace/assistance" className="btn btn-ghost">J&apos;ai payé : envoyer mon reçu</Link>}
          </div>
        </div>
      )}
      {online ? (
        <p className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
          Paiement sécurisé par SasPay (Mobile Money ou carte). Votre formule s&apos;active automatiquement dès que SasPay confirme le paiement.
        </p>
      ) : (
        <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-800">
          Payez votre formule avec le bouton « Payer » (page de paiement sécurisée). Après le paiement, envoyez votre reçu depuis « Assistance » : l&apos;équipe MiniSoft RCA vérifie et active votre formule.
        </p>
      )}
      <div className="stagger mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const current = p.id === profile.plan;
          return (
            <div key={p.id} className={`glass flex flex-col rounded-2xl p-6 ${current ? "glow-ring" : ""}`}>
              <h2 className="font-display text-xl font-semibold text-slate-900">{p.name}</h2>
              <p className="mt-1 text-sm text-slate-600">{p.description}</p>
              <p className="mt-4 text-2xl font-bold text-slate-900">{p.price_xaf ? `${xaf(p.price_xaf)} / mois` : "Gratuit"}</p>
              <ul className="mt-4 flex-1 space-y-1 text-sm text-slate-700">
                <li>{p.monthly_credits} crédits / mois</li>
                <li>{Math.min(p.max_projects, MAX_PROJECTS_PER_ACCOUNT)} logiciel, {p.max_members} utilisateur(s)</li>
                <li>{p.can_publish ? "Publication incluse" : "Sans publication"}</li>
              </ul>
              {current ? (
                <button className="btn btn-ghost mt-6" disabled>Formule actuelle</button>
              ) : p.price_xaf && (online || PLAN_PAYMENT_LINKS[p.id]) ? (
                <PayButton planId={p.id} label={`Payer ${xaf(p.price_xaf)}`} className="btn btn-primary mt-6" />
              ) : p.price_xaf ? (
                <Link href="/espace/assistance" className="btn btn-ghost mt-6">Demander cette formule</Link>
              ) : (
                <button className="btn btn-ghost mt-6" disabled>Gratuit</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
