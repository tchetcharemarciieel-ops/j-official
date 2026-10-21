import { SECTOR_PAGES } from "@/lib/marketing";
import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import Link from "next/link";
import { LifeBuoy, MessageCircle } from "lucide-react";
import { Logo } from "./Logo";

/** Numéro affiché lisiblement : +236 74 33 26 19. */
function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("236") && d.length === 11) return `+236 ${d.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
  return raw.trim();
}

export function SiteFooter() {
  const phone = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
  const digits = phone.replace(/\D/g, "");
  return (
    <footer className="no-print border-t border-slate-200 bg-slate-50">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-600">Des mini-logiciels de gestion simples, en français et en FCFA, pour les entreprises de Centrafrique et d&apos;Afrique.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Produit</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
            <li><Link href={siteHref("/creer")} className="hover:text-blue-600">Créer un logiciel</Link></li>
            <li><Link href="/modeles" className="hover:text-blue-600">Modèles de logiciels</Link></li>
            <li><Link href="/demo" className="hover:text-blue-600">Démonstration sans compte</Link></li>
            <li><Link href="/#tarifs" className="hover:text-blue-600">Tarifs</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Compte</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
            {!STATIC_SITE && <li><Link href="/connexion" className="hover:text-blue-600">Connexion</Link></li>}
            {!STATIC_SITE && <li><Link href="/inscription" className="hover:text-blue-600">Inscription</Link></li>}
            {!STATIC_SITE && <li><Link href="/espace" className="hover:text-blue-600">Mon espace</Link></li>}
            <li><Link href="/#faq" className="hover:text-blue-600">Questions fréquentes</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Contact</h2>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
            {digits.length >= 8 && (
              <li>
                <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-blue-600">
                  <MessageCircle className="h-4 w-4 text-slate-500" aria-hidden /> WhatsApp : {formatPhone(phone)}
                </a>
              </li>
            )}
            {!STATIC_SITE && (
              <li>
                <Link href="/#contact" className="inline-flex items-center gap-2 hover:text-blue-600">
                  <LifeBuoy className="h-4 w-4 text-slate-500" aria-hidden /> Présenter votre projet
                </Link>
              </li>
            )}
            <li>République centrafricaine</li>
          </ul>
        </div>
      </div>
      <nav aria-label="Logiciels par secteur" className="mx-auto max-w-7xl border-t border-slate-200 px-4 py-8 sm:px-6">
        <h2 className="text-sm font-semibold text-slate-900">Logiciels par secteur</h2>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          {SECTOR_PAGES.map((p) => <li key={p.slug}><Link href={`/secteurs/${p.slug}`} className="hover:text-blue-600">{p.seoTitle.replace(/ en FCFA$/, "")}</Link></li>)}
        </ul>
      </nav>
      <p className="border-t border-slate-200 px-4 py-6 text-center text-xs text-slate-500">© {new Date().getFullYear()} MiniSoft RCA · Prix en francs CFA (XAF)</p>
    </footer>
  );
}
