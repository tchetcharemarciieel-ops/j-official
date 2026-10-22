"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Database, LayoutDashboard, LifeBuoy, Menu, Plus, Settings, SquareStack, Users, X, type LucideIcon } from "lucide-react";

export const ESPACE_NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/espace", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/espace/logiciels", label: "Mes logiciels", icon: SquareStack },
  { href: "/creer", label: "Créer un logiciel", icon: Plus },
  { href: "/espace/donnees", label: "Mes données", icon: Database },
  { href: "/espace/equipe", label: "Mon équipe", icon: Users },
  { href: "/espace/statistiques", label: "Statistiques", icon: BarChart3 },
  { href: "/espace/parametres", label: "Paramètres", icon: Settings },
  { href: "/espace/assistance", label: "Assistance", icon: LifeBuoy },
];

function isActive(pathname: string, href: string) {
  return href === "/espace" ? pathname === "/espace" : pathname.startsWith(href);
}

function Links({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="stagger-x space-y-1">
      {ESPACE_NAV.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 hover:translate-x-0.5 ${active ? "nav-active bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
            >
              <n.icon className={`h-4 w-4 shrink-0 ${active ? "text-blue-600" : "text-slate-500"}`} aria-hidden />
              {n.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Menu latéral de l'espace client : fixe sur ordinateur, tiroir sur téléphone et tablette. */
export function EspaceNav({ plan, credits, sidebarOnly = false }: { plan: string; credits: number; sidebarOnly?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  const footer = (
    <Link href="/espace/abonnement" className="mt-6 block rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-blue-300">
      <p className="text-xs text-slate-500">Formule</p>
      <p className="font-semibold text-slate-900">{plan}</p>
      <p className="mt-1 text-xs text-slate-600">{credits} crédit{credits > 1 ? "s" : ""} IA</p>
    </Link>
  );

  if (sidebarOnly)
    return (
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-100 px-4 py-6 lg:block" aria-label="Menu de l'espace client">
        <nav aria-label="Espace client">
          <Links pathname={pathname} />
        </nav>
        {footer}
      </aside>
    );

  return (
    <>

      <button onClick={() => setOpen(true)} className="btn btn-ghost !min-h-0 px-3 py-2 text-sm lg:hidden" aria-expanded={open} aria-controls="espace-menu">
        <Menu className="h-4 w-4" aria-hidden />
        Menu
      </button>
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de l'espace client">
            <button className="absolute inset-0 bg-slate-900/40" aria-label="Fermer le menu" onClick={() => setOpen(false)} />
            <div id="espace-menu" className="absolute inset-y-0 left-0 w-[82%] max-w-xs overflow-y-auto border-r border-slate-200 bg-white p-4 shadow-2xl" style={{ animation: "slide-in 0.25s ease-out" }}>
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display font-semibold text-slate-900">Espace client</span>
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-600 hover:bg-slate-50" aria-label="Fermer"><X className="h-4 w-4" aria-hidden /></button>
              </div>
              <nav aria-label="Espace client">
                <Links pathname={pathname} onNavigate={() => setOpen(false)} />
              </nav>
              {footer}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
