import { STATIC_SITE } from "@/lib/site-mode";
import Link from "next/link";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { getProfile } from "@/lib/auth";
import { SITE_NAV } from "@/lib/nav";
import { SignOutButton } from "./SignOutButton";

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
          {profile?.is_admin && (
            <Link href="/admin" className="rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900">
              Administration
            </Link>
          )}
          {STATIC_SITE ? (
            <Link href="/demo" className="btn btn-primary">Essayer la démo</Link>
          ) : (
            profile ? (
              <>
                <Link href="/espace" className="btn btn-primary">Mon espace</Link>
                <SignOutButton />
              </>
            ) : (
              <>
                <Link href="/connexion" className="btn btn-ghost">Se connecter</Link>
                <Link href="/inscription" className="btn btn-primary">S&apos;inscrire</Link>
              </>
            )
          )}
        </div>
        <MobileNav isAdmin={Boolean(profile?.is_admin)} signedIn={Boolean(profile)} />
      </div>
    </header>
  );
}
