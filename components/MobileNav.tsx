"use client";

import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Accueil" },
  { href: "/#comment", label: "Comment ça marche" },
  { href: "/modeles", label: "Exemples de logiciels" },
  { href: "/demo", label: "Démo" },
  { href: "/#tarifs", label: "Tarifs" },
  { href: "/#faq", label: "FAQ" },
];

export function MobileNav({ loggedIn, isAdmin }: { loggedIn: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  return (
    <div className="lg:hidden">
      <button className="btn btn-ghost px-3" aria-expanded={open} aria-controls="menu-mobile" onClick={() => setOpen((o) => !o)} aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}>
        {open ? "✕" : "☰"}
      </button>
      {open && (
        <div id="menu-mobile" className="fixed inset-x-0 top-16 bottom-0 z-50 overflow-y-auto bg-night-950/95 p-4 backdrop-blur-xl">
          <nav className="flex flex-col gap-1" aria-label="Navigation mobile">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-xl px-4 py-3 text-lg text-slate-200 hover:bg-white/5" onClick={() => setOpen(false)}>
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link href="/admin" className="rounded-xl px-4 py-3 text-lg text-slate-200 hover:bg-white/5">
                Administration
              </Link>
            )}
            {!STATIC_SITE && (
              <Link href={loggedIn ? "/espace" : "/connexion"} className="rounded-xl px-4 py-3 text-lg text-slate-200 hover:bg-white/5">
                {loggedIn ? "Mon espace" : "Connexion"}
              </Link>
            )}
            <Link href={siteHref("/creer")} className="btn btn-primary mt-4 text-base">
              Créer mon logiciel
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
