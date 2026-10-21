"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const ESPACE_NAV = [
  { href: "/espace", label: "Vue d'ensemble", icon: "🏠" },
  { href: "/espace/logiciels", label: "Mes logiciels", icon: "🧩" },
  { href: "/creer", label: "Créer un logiciel", icon: "✨" },
  { href: "/espace/donnees", label: "Mes données", icon: "🗄️" },
  { href: "/espace/equipe", label: "Mon équipe", icon: "👥" },
  { href: "/espace/statistiques", label: "Statistiques", icon: "📈" },
  { href: "/espace/parametres", label: "Paramètres", icon: "⚙️" },
  { href: "/espace/assistance", label: "Assistance", icon: "💬" },
];

function isActive(pathname: string, href: string) {
  return href === "/espace" ? pathname === "/espace" : pathname.startsWith(href);
}

function Links({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <ul className="space-y-1">
      {ESPACE_NAV.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all duration-200 ${active ? "bg-gradient-to-r from-brand-500/30 to-sky-glow/10 font-semibold text-white shadow-inner" : "text-slate-400 hover:translate-x-0.5 hover:bg-white/5 hover:text-white"}`}
            >
              <span className={`text-base transition-transform duration-200 ${active ? "" : "group-hover:scale-110"}`} aria-hidden>{n.icon}</span>
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
    <Link href="/espace/abonnement" className="mt-6 block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-brand-400/40">
      <p className="text-xs text-slate-500">Formule</p>
      <p className="font-semibold text-white">{plan}</p>
      <p className="mt-1 text-xs text-slate-400">{credits} crédit{credits > 1 ? "s" : ""} IA</p>
    </Link>
  );

  if (sidebarOnly)
    return (
      <aside className="sticky top-16 hidden h-[calc(100dvh-4rem)] w-64 shrink-0 overflow-y-auto border-r border-white/5 px-4 py-6 lg:block" aria-label="Menu de l'espace client">
        <nav aria-label="Espace client">
          <Links pathname={pathname} />
        </nav>
        {footer}
      </aside>
    );

  return (
    <>

      <button onClick={() => setOpen(true)} className="btn btn-ghost !min-h-0 px-3 py-2 text-sm lg:hidden" aria-expanded={open} aria-controls="espace-menu">
        ☰ Menu
      </button>
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de l'espace client">
            <button className="absolute inset-0 bg-black/60" aria-label="Fermer le menu" onClick={() => setOpen(false)} />
            <div id="espace-menu" className="absolute inset-y-0 left-0 w-[82%] max-w-xs overflow-y-auto border-r border-white/10 bg-night-950 p-4 shadow-2xl" style={{ animation: "slide-in 0.25s ease-out" }}>
              <div className="mb-4 flex items-center justify-between">
                <span className="font-display font-semibold text-white">Espace client</span>
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5" aria-label="Fermer">✕</button>
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
