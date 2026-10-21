import Link from "next/link";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { getProfile } from "@/lib/auth";

export const NAV = [
  { href: "/", label: "Accueil" },
  { href: "/#comment", label: "Comment ça marche" },
  { href: "/modeles", label: "Exemples de logiciels" },
  { href: "/#tarifs", label: "Tarifs" },
  { href: "/#faq", label: "FAQ" },
];

export async function SiteHeader() {
  const profile = await getProfile().catch(() => null);
  return (
    <header className="no-print sticky top-0 z-50 border-b border-white/5 bg-night-950/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {profile ? (
            <>
              {profile.is_admin && (
                <Link href="/admin" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white">
                  Administration
                </Link>
              )}
              <Link href="/espace" className="btn btn-ghost">
                Mon espace
              </Link>
            </>
          ) : (
            <Link href="/connexion" className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:text-white">
              Connexion
            </Link>
          )}
          <Link href="/creer" className="btn btn-primary">
            Créer mon logiciel
          </Link>
        </div>
        <MobileNav loggedIn={Boolean(profile)} isAdmin={Boolean(profile?.is_admin)} />
      </div>
    </header>
  );
}
