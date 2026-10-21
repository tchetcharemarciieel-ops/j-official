import { requireProfile } from "@/lib/auth";
import { getPlans, paymentsConfigured, xaf } from "@/lib/plans";
import { CREDIT_COSTS } from "@/lib/config";

export const metadata = { title: "Abonnement" };
export const dynamic = "force-dynamic";

export default async function Abonnement() {
  const profile = await requireProfile("/espace/abonnement");
  const plans = await getPlans();
  const payments = paymentsConfigured();
  return (
    <div>
      <h1 className="mt-2 font-display text-3xl font-bold text-white">Abonnement et crédits</h1>
      <p className="mt-2 text-sm text-slate-400">Solde actuel : <strong className="text-white">{profile.credits} crédits</strong>. Coûts : diagnostic {CREDIT_COSTS.diagnose}, modification {CREDIT_COSTS.modify}, question {CREDIT_COSTS.ask}. Une opération IA échouée est remboursée automatiquement ; l&apos;analyse par règles est gratuite.</p>
      {!payments && (
        <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          Le paiement en ligne (Mobile Money, carte) n&apos;est pas encore activé sur la plateforme. Aucun montant ne peut être prélevé. Pour changer de formule, contactez l&apos;équipe MiniSoft RCA : l&apos;administrateur activera votre formule après accord.
        </p>
      )}
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const current = p.id === profile.plan;
          return (
            <div key={p.id} className={`glass flex flex-col rounded-2xl p-6 ${current ? "glow-ring" : ""}`}>
              <h2 className="font-display text-xl font-semibold text-white">{p.name}</h2>
              <p className="mt-1 text-sm text-slate-400">{p.description}</p>
              <p className="mt-4 text-2xl font-bold text-white">{p.price_xaf ? `${xaf(p.price_xaf)} / mois` : "Gratuit"}</p>
              <ul className="mt-4 flex-1 space-y-1 text-sm text-slate-300">
                <li>{p.monthly_credits} crédits / mois</li>
                <li>{p.max_projects} logiciel(s), {p.max_members} utilisateur(s)</li>
                <li>{p.can_publish ? "Publication incluse" : "Sans publication"}</li>
              </ul>
              <button className={`btn mt-6 ${current ? "btn-ghost" : "btn-primary"}`} disabled title={current ? "" : "Paiement non configuré"}>
                {current ? "Formule actuelle" : payments ? "Choisir" : "Paiement non disponible"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
