import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { CompanyForm } from "@/components/espace/CompanyForm";
import { PasswordForm } from "@/components/espace/PasswordForm";

export const metadata = { title: "Paramètres" };
export const dynamic = "force-dynamic";

export default async function Parametres() {
  const p = await requireProfile("/espace/parametres");
  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-bold text-slate-900">Paramètres</h1>
        <p className="mt-1 text-sm text-slate-600">Profil de votre entreprise et sécurité de votre compte.</p>
      </div>
      <section className="glass rounded-2xl p-6 animate-fade-up" aria-labelledby="entreprise">
        <h2 id="entreprise" className="font-display text-lg font-semibold text-slate-900">Profil de l&apos;entreprise</h2>
        <p className="mb-5 mt-1 text-sm text-slate-600">Affiché dans votre espace et utilisé par l&apos;équipe MiniSoft RCA pour vous recontacter.</p>
        <CompanyForm initial={{ full_name: p.full_name, company_name: p.company_name, company_logo_url: p.company_logo_url, company_sector: p.company_sector, company_phone: p.company_phone, company_email: p.company_email, company_address: p.company_address }} />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="glass rounded-2xl p-6 animate-fade-up" aria-labelledby="compte">
          <h2 id="compte" className="font-display text-lg font-semibold text-slate-900">Compte</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-slate-600">E-mail de connexion</dt><dd className="truncate text-slate-900">{p.email}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-slate-600">Crédits IA</dt><dd className="text-slate-900">{p.credits}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/espace/abonnement" className="btn btn-ghost">Formule et crédits</Link>
            <form action="/auth/signout" method="post"><button className="btn btn-ghost">Se déconnecter</button></form>
          </div>
        </section>
        <section className="glass rounded-2xl p-6 animate-fade-up" aria-labelledby="mdp">
          <h2 id="mdp" className="font-display text-lg font-semibold text-slate-900">Mot de passe</h2>
          <div className="mt-4"><PasswordForm /></div>
        </section>
      </div>
    </div>
  );
}
