import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { SupportForm } from "@/components/espace/SupportForm";

export const metadata = { title: "Assistance" };
export const dynamic = "force-dynamic";

const GUIDES = [
  { q: "Modifier mon logiciel", a: "Mes logiciels → Modifier, puis écrivez votre demande (« Ajoute un champ téléphone aux clients »). Vous voyez l'avant/après avant d'appliquer.", href: "/espace/logiciels" },
  { q: "Publier et partager", a: "Publier donne un lien permanent. Invitez ensuite chaque collaborateur depuis Mon équipe : le lien seul ne donne pas accès aux données.", href: "/espace/equipe" },
  { q: "Importer un fichier Excel", a: "Mes données → Importer : vous choisissez la correspondance des colonnes, vérifiez les erreurs, puis confirmez.", href: "/espace/donnees" },
  { q: "Revenir en arrière", a: "Dans un logiciel, onglet Versions → Restaurer. Vos données ne sont jamais effacées par une restauration.", href: "/espace/logiciels" },
];

export default async function Assistance() {
  const p = await requireProfile("/espace/assistance");
  const wa = (process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "").replace(/\D/g, "");
  return (
    <div className="space-y-6">
      <div className="animate-fade-up">
        <h1 className="font-display text-3xl font-bold text-slate-900">Assistance</h1>
        <p className="mt-1 text-sm text-slate-600">Une question, un blocage ? Nous sommes là.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="glass rounded-2xl p-6 animate-fade-up" aria-labelledby="ecrire">
          <h2 id="ecrire" className="font-display text-lg font-semibold text-slate-900">Écrire à l&apos;équipe</h2>
          <div className="mt-4"><SupportForm phone={p.company_phone} /></div>
        </section>
        <div className="space-y-4">
          {wa.length >= 8 && (
            <a href={`https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour, j'ai besoin d'aide sur MiniSoft RCA (compte ${p.email}).`)}`} target="_blank" rel="noopener" className="flex items-center gap-4 rounded-2xl border border-[#25D366]/40 bg-[#25D366]/10 p-5 transition hover:bg-[#25D366]/20 animate-fade-up">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white" aria-hidden><MessageCircle className="h-5 w-5" /></span>
              <span><span className="block font-semibold text-slate-900">Discuter sur WhatsApp</span><span className="text-sm text-slate-700">Réponse directe de l&apos;équipe MiniSoft RCA</span></span>
            </a>
          )}
          <section className="glass rounded-2xl p-5 animate-fade-up" aria-labelledby="guides">
            <h2 id="guides" className="font-semibold text-slate-900">Guides rapides</h2>
            <ul className="mt-3 space-y-3">
              {GUIDES.map((g) => (
                <li key={g.q}>
                  <details className="group rounded-xl border border-slate-200 bg-slate-50 p-3 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium text-slate-900">{g.q}<span className="text-blue-700 transition group-open:rotate-45">+</span></summary>
                    <p className="mt-2 text-sm text-slate-700">{g.a}</p>
                    <Link href={g.href} className="mt-2 inline-block text-xs text-blue-700 hover:underline">Y aller →</Link>
                  </details>
                </li>
              ))}
            </ul>
            <Link href="/#faq" className="mt-4 inline-block text-sm text-blue-700 hover:underline">Toutes les questions fréquentes →</Link>
          </section>
        </div>
      </div>
    </div>
  );
}
