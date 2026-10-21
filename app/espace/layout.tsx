import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { Logo } from "@/components/Logo";
import { EspaceNav } from "@/components/espace/EspaceNav";
import { NotificationBell } from "@/components/espace/NotificationBell";

/** Mise en page de l'espace client : barre du haut, menu latéral et contenu. */
export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile("/espace");
  const { data: plan } = await adminClient().from("plans").select("name").eq("id", profile.plan).maybeSingle();
  const company = profile.company_name || profile.full_name || profile.email;
  return (
    <div className="bg-aurora min-h-dvh">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/90">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <EspaceNav plan={plan?.name ?? profile.plan} credits={profile.credits} />
          <div className="hidden lg:block"><Logo href="/espace" /></div>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            {profile.is_admin && <Link href="/admin" className="hidden rounded-lg px-3 py-2 text-sm text-slate-700 hover:text-slate-900 sm:block">Administration</Link>}
            <Link href="/" className="hidden rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 md:block">Site public</Link>
            <NotificationBell />
            <Link href="/espace/parametres" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-1 pl-1 pr-3 transition hover:bg-slate-100" aria-label="Profil de l'entreprise">
              {profile.company_logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={profile.company_logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" referrerPolicy="no-referrer" />
              ) : (
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-xs font-bold text-white">{company.slice(0, 2).toUpperCase()}</span>
              )}
              <span className="hidden max-w-36 truncate text-sm text-slate-900 sm:block">{company}</span>
            </Link>
          </div>
        </div>
      </header>
      <div className="flex">
        <EspaceNavSidebar plan={plan?.name ?? profile.plan} credits={profile.credits} />
        <main id="contenu" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}

// Le même composant gère le tiroir (dans la barre du haut) et la colonne fixe (ordinateur) :
// ici on n'affiche que la colonne.
function EspaceNavSidebar(props: { plan: string; credits: number }) {
  return <EspaceNav {...props} sidebarOnly />;
}
