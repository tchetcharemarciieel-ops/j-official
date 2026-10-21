import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import Link from "next/link";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { getProfile } from "@/lib/auth";
import { SITE_NAV } from "@/lib/nav";

export async function SiteHeader() {
  const profile = await getProfile().catch(() => null);
  return (
    <header className="no-print sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {SITE_NAV.map((n) => (
            <Link key={n.href} href={n.href} className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          {profile ? (
            <>
              {profile.is_admin && (
                <Link href="/admin" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
                  Administration
                </Link>
              )}
              <Link href="/espace" className="btn btn-ghost">
                Mon espace
              </Link>
            </>
          ) : STATIC_SITE ? null : (
            <Link href="/connexion" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
              Connexion
            </Link>
          )}
          <Link href={siteHref("/creer")} className="btn btn-primary">
            Créer mon logiciel
          </Link>
        </div>
        <MobileNav loggedIn={Boolean(profile)} isAdmin={Boolean(profile?.is_admin)} />
      </div>
    </header>
  );
}
