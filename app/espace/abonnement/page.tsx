import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { getPlans, paymentsConfigured, xaf } from "@/lib/plans";
import { CREDIT_COSTS } from "@/lib/config";

export const metadata = { title: "Abonnement" };
export const dynamic = "force-dynamic";

export default async function Abonnement({ searchParams }: { searchParams: Promise<{ logiciel?: string }> }) {
  const profile = await requireProfile("/espace/abonnement");
  const { logiciel } = await searchParams;
  const { data: locked } = logiciel && /^[0-9a-f-]{36}$/i.test(logiciel) ? await adminClient().from("projects").select("name").eq("id", logiciel).eq("owner_id", profile.id).maybeSingle() : { data: null };
  const plans = await getPlans();
  const payments = paymentsConfigured();
  return (
    <div>
      <h1 className="mt-2 font-display text-3xl font-bold text-slate-900">Abonnement et crédits</h1>
      <p className="mt-2 text-sm text-slate-600">Solde actuel : <strong className="text-slate-900">{profile.credits} crédits</strong>. Coûts : diagnostic {CREDIT_COSTS.diagnose}, modification {CREDIT_COSTS.modify}, question {CREDIT_COSTS.ask}. Une opération IA échouée est remboursée automatiquement ; l&apos;analyse par règles est gratuite.</p>
      {locked && (
        <div className="mt-6 rounded-2xl border border-fuchsia-300 bg-gradient-to-r from-blue-50 to-fuchsia-50 px-5 py-4">
          <p className="font-semibold text-slate-900">Débloquez « {locked.name} »</p>
          <p className="mt-1 text-sm text-slate-700">Votre logiciel est généré et conservé. Choisissez une formule avec publication (à partir de la formule Pro) : il s&apos;ouvrira aussitôt, avec vos réponses et votre plan.</p>
          {!payments && <Link href="/espace/assistance" className="btn btn-primary mt-3">Demander l&apos;activation de ma formule</Link>}
        </div>
      )}
      {!payments && (
        <p className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-800">
          Le paiement en ligne (Mobile Money, carte) n&apos;est pas encore activé sur la plateforme. Aucun montant ne peut être prélevé. Pour changer de formule, contactez l&apos;équipe MiniSoft RCA : l&apos;administrateur activera votre formule après accord.
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
