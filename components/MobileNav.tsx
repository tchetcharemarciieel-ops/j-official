"use client";

import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { SITE_NAV } from "@/lib/nav";


export function MobileNav({ loggedIn, isAdmin }: { loggedIn: boolean; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>
      {/* Rendu dans <body> : le flou de l'en-tête enfermerait sinon le menu dans la barre du haut. */}
      {open && mounted && createPortal(
        <div id="menu-mobile" className="fixed inset-x-0 top-16 bottom-0 z-[60] overflow-y-auto border-t border-slate-200 bg-white p-4 lg:hidden">
          <nav className="flex flex-col gap-1" aria-label="Navigation mobile">
            {SITE_NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-4 py-3 text-base font-medium text-slate-800 hover:bg-slate-100" onClick={() => setOpen(false)}>
                {n.label}
              </Link>
            ))}
            {isAdmin && (
              <Link href="/admin" className="rounded-lg px-4 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">
                Administration
              </Link>
            )}
            {!STATIC_SITE && (
              <Link href={loggedIn ? "/espace" : "/connexion"} className="rounded-lg px-4 py-3 text-base font-medium text-slate-800 hover:bg-slate-100">
                {loggedIn ? "Mon espace" : "Connexion"}
              </Link>
            )}
            <Link href={siteHref("/creer")} className="btn btn-primary mt-4 text-base">
              Créer mon logiciel
            </Link>
          </nav>
        </div>,
        document.body,
      )}
    </div>
  );
}
