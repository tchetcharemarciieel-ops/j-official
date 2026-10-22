import Link from "next/link";
import { Bell, LogOut, Search } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/admin";
import { adminClient } from "@/lib/supabase/admin";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Administration", template: "%s · Administration MiniSoft RCA" }, robots: { index: false } };

/** Cadre de l'administration : vérifié côté serveur à chaque page (propriétaire + double authentification). */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  const db = adminClient();
  const [{ count: tickets }, { count: leads }] = await Promise.all([
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "nouveau"),
    db.from("leads").select("id", { count: "exact", head: true }).eq("status", "nouveau"),
  ]);
  const pending = (tickets ?? 0) + (leads ?? 0);
  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-3 sm:px-5">
        <AdminNav pending={pending} />
        <Link href="/admin" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-slate-900 text-xs font-bold text-white">MS</span>
          <span className="hidden sm:inline">Administration</span>
        </Link>
        <form action="/admin/recherche" className="relative ml-auto w-full max-w-sm">
          <label htmlFor="admin-q" className="sr-only">Rechercher un utilisateur ou un logiciel</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input id="admin-q" name="q" placeholder="Utilisateur, e-mail, logiciel…" className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 text-sm outline-none focus:border-blue-500" style={{ paddingLeft: "2.25rem", paddingRight: "0.75rem" }} />
        </form>
        <Link href="/admin/support" className="relative rounded-lg p-2 hover:bg-slate-100" aria-label={`${pending} demande(s) à traiter`}>
          <Bell className="h-5 w-5 text-slate-600" aria-hidden />
          {pending > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{pending > 9 ? "9+" : pending}</span>}
        </Link>
        <span className="hidden max-w-40 truncate text-sm text-slate-500 md:block" title={admin.email}>{admin.email}</span>
        <form action="/auth/signout" method="post">
          <button className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm hover:bg-slate-100" aria-label="Se déconnecter">
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </form>
      </header>
      <div className="flex">
        <AdminNav pending={pending} sidebarOnly />
        <main id="contenu" className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
