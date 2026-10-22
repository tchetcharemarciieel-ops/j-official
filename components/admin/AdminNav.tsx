"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bot, Building2, CreditCard, LayoutDashboard, LayoutTemplate, LifeBuoy, Menu, Settings, ShieldCheck, SquareStack, Users, X, type LucideIcon } from "lucide-react";

export const ADMIN_NAV: { href: string; label: string; icon: LucideIcon; badge?: "support" }[] = [
  { href: "/admin", label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users },
  { href: "/admin/entreprises", label: "Entreprises", icon: Building2 },
  { href: "/admin/logiciels", label: "Mini-logiciels", icon: SquareStack },
  { href: "/admin/ia", label: "Intelligence artificielle", icon: Bot },
  { href: "/admin/abonnements", label: "Abonnements et paiements", icon: CreditCard },
  { href: "/admin/modeles", label: "Modèles", icon: LayoutTemplate },
  { href: "/admin/support", label: "Support", icon: LifeBuoy, badge: "support" },
  { href: "/admin/activite", label: "Activité et sécurité", icon: ShieldCheck },
  { href: "/admin/parametres", label: "Paramètres", icon: Settings },
];

function Links({ pathname, pending, onNavigate }: { pathname: string; pending: number; onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {ADMIN_NAV.map((n) => {
        const active = n.href === "/admin" ? pathname === "/admin" : pathname.startsWith(n.href);
        return (
          <li key={n.href}>
            <Link href={n.href} onClick={onNavigate} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}>
              <n.icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{n.label}</span>
              {n.badge === "support" && pending > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] font-semibold text-white">{pending}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Menu de l'administration : colonne fixe sur ordinateur, tiroir sur téléphone. */
export function AdminNav({ pending, sidebarOnly = false }: { pending: number; sidebarOnly?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setOpen(false), [pathname]);
  if (sidebarOnly)
    return (
      <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-white p-3 lg:block" aria-label="Menu d'administration">
        <Links pathname={pathname} pending={pending} />
      </aside>
    );
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg border border-slate-200 p-2 lg:hidden" aria-label="Ouvrir le menu" aria-expanded={open}>
        <Menu className="h-4 w-4" aria-hidden />
      </button>
      {open &&
        mounted &&
        createPortal(
          <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu d'administration">
            <button className="absolute inset-0 bg-slate-900/40" aria-label="Fermer le menu" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-[82%] max-w-xs overflow-y-auto bg-white p-3 shadow-xl">
              <div className="mb-3 flex items-center justify-between px-2">
                <span className="font-semibold">Administration</span>
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Fermer"><X className="h-4 w-4" aria-hidden /></button>
              </div>
              <Links pathname={pathname} pending={pending} onNavigate={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
