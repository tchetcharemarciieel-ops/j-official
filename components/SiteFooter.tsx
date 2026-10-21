import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="no-print border-t border-white/5 bg-night-950">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm text-slate-400">La plateforme qui transforme les problèmes des entreprises en mini-logiciels, accessibles depuis un simple lien web.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Produit</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li><Link href="/creer" className="hover:text-white">Créer un logiciel</Link></li>
            <li><Link href="/modeles" className="hover:text-white">Bibliothèque de modèles</Link></li>
            <li><Link href="/#tarifs" className="hover:text-white">Tarifs</Link></li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Compte</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-400">
            <li><Link href="/connexion" className="hover:text-white">Connexion</Link></li>
            <li><Link href="/inscription" className="hover:text-white">Inscription</Link></li>
            <li><Link href="/#faq" className="hover:text-white">Questions fréquentes</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-white/5 py-6 text-center text-xs text-slate-500">© {new Date().getFullYear()} MiniSoft RCA. Prix en FCFA (XAF).</p>
    </footer>
  );
}
