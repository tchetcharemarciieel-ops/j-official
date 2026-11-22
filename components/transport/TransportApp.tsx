"use client";

import { Bike, Bot, Loader2, LayoutDashboard, Map as MapIcon, Menu, Moon, Package, RefreshCw, Settings2, Sun, Truck, Users, Wallet, X, ClipboardList, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toaster";
import { NotificationBell } from "@/components/espace/NotificationBell";
import { has, type Permission } from "@/lib/team";
import { ROLE_LABELS } from "@/lib/spec";
import { TRANSPORT_TYPES, money, settingsOf, type Courier, type Doc } from "@/lib/transport/model";
import { Ctx, type Page, type TransportCtx } from "./context";
import { useTransport } from "./useTransport";
import { Dashboard } from "./pages/Dashboard";
import { Orders } from "./pages/Orders";
import { Missions } from "./pages/Missions";
import { Couriers } from "./pages/Couriers";
import { Vehicles } from "./pages/Vehicles";
import { MapPage } from "./pages/MapPage";
import { Finances } from "./pages/Finances";
import { Assistant } from "./pages/Assistant";
import { SettingsPage } from "./pages/Settings";

type Nav = { id: Page; label: string; short: string; icon: LucideIcon; show: boolean; badge?: number };
type Theme = "light" | "dark";

/**
 * MiniSoft Transport & Delivery : interface d'administration (dispatch, livreurs, véhicules, carte,
 * finances) et application du livreur. Chaque page n'affiche que ce que le poste permet ; le serveur
 * revérifie chaque action et ne renvoie que les données autorisées.
 */
export function TransportApp({ projectId, mode }: { projectId: string; mode: "demo" | "live" }) {
  const b = useTransport(projectId, mode);
  const notify = useToast();
  const [page, setPage] = useState<Page | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const s = b.state;
  useEffect(() => {
    try {
      const t = localStorage.getItem("mstransport:theme");
      if (t === "dark" || t === "light") setTheme(t);
      else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
    } catch { /* thème clair */ }
  }, []);
  const toggle = () => {
    const n: Theme = theme === "dark" ? "light" : "dark";
    setTheme(n);
    try { localStorage.setItem("mstransport:theme", n); } catch { /* ignoré */ }
  };
  const may = useCallback((p: Permission | Permission[]) => has(s?.perms ?? null, p), [s?.perms]);
  const run = useCallback<TransportCtx["run"]>(async (name, input, opts = {}) => {
    try {
      const r = await b.op(name, input);
      if (!opts.quiet) notify("success", r.message);
      return r;
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Action impossible.");
      return null;
    }
  }, [b, notify]);
  const go = useCallback((p: Page, f?: string) => { setPage(p); setFocus(f ?? null); setMenu(false); window.scrollTo({ top: 0 }); }, []);
  const settings = useMemo(() => settingsOf(b.data.settings[0], s?.projectName), [b.data.settings, s?.projectName]);
  const courierName = useCallback((id: string | null | undefined) => (id ? ((b.data.courier as Doc<Courier>[]).find((c) => c.id === id)?.data.name ?? "Livreur supprimé") : "—"), [b.data.courier]);
  const memberName = useCallback((id: string | null | undefined) => (id ? (s?.members.find((m) => m.id === id)?.name ?? "Ancien membre") : "—"), [s?.members]);
  const me = useMemo(() => (s ? ((b.data.courier as Doc<Courier>[]).find((c) => c.data.user_id === s.me) ?? null) : null), [b.data.courier, s]);

  if (!s) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        {b.error ? (
          <div className="max-w-sm"><p className="font-medium text-slate-900">{b.error}</p><button className="btn btn-ghost mt-4" onClick={() => void b.load()}><RefreshCw className="h-4 w-4" /> Réessayer</button></div>
        ) : <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Chargement" />}
      </div>
    );
  }
  const nav: Nav[] = [
    { id: "missions", label: "Mes missions", short: "Missions", icon: ClipboardList, show: Boolean(me) && may("missions") },
    { id: "dashboard", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard, show: true },
    { id: "commandes", label: "Commandes et colis", short: "Commandes", icon: Package, show: may(["livraisons", "finances", "rapports"]) },
    { id: "livreurs", label: "Livreurs", short: "Livreurs", icon: Bike, show: may(["livreurs", "livraisons"]) },
    { id: "vehicules", label: "Véhicules", short: "Véhicules", icon: Truck, show: may(["vehicules", "livraisons"]) },
    { id: "carte", label: "Carte", short: "Carte", icon: MapIcon, show: may(["livraisons", "livreurs"]) },
    { id: "finances", label: "Finances", short: "Finances", icon: Wallet, show: may(["finances", "rapports"]) },
    { id: "assistant", label: "MiniSoft AI", short: "IA", icon: Bot, show: may(["livraisons", "finances", "rapports", "livreurs"]) },
    { id: "parametres", label: "Réglages", short: "Réglages", icon: Settings2, show: may("parametres") },
  ];
  const visible = nav.filter((n) => n.show);
  const courierOnly = Boolean(me) && !may(["livraisons", "finances", "rapports", "livreurs", "vehicules"]);
  const fallback: Page = courierOnly ? "missions" : "dashboard";
  const current: Page = page && visible.some((n) => n.id === page) ? page : visible.some((n) => n.id === fallback) ? fallback : "dashboard";
  const ctx: TransportCtx = { ...b, s, projectId, mode, settings, notify, may, run, go, focus, fmt: (n) => money(n, settings.currency), courierName, memberName, me };
  const style = { "--brand": settings.primary } as React.CSSProperties;
  const quick = (courierOnly ? visible.filter((n) => ["missions", "dashboard"].includes(n.id)) : visible.filter((n) => ["dashboard", "commandes", "livreurs", "carte"].includes(n.id))).slice(0, 4);
  const logo = b.fileUrl(settings.logo_id);
  const NavList = (
    <nav aria-label="Menu de l'entreprise" className="space-y-0.5">
      {visible.map((n) => (
        <button key={n.id} onClick={() => go(n.id)} aria-current={current === n.id ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${current === n.id ? "bg-[var(--brand)] font-medium text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"}`}>
          <n.icon className="h-4 w-4 shrink-0" aria-hidden /><span className="flex-1 truncate text-left">{n.label}</span>
        </button>
      ))}
      {s.can.team && mode === "live" && <Link href={`/projets/${projectId}?onglet=equipe`} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100"><Users className="h-4 w-4" aria-hidden /> Comptes et accès</Link>}
      {mode === "live" && <a href={`/livraison/${s.slug}`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100"><Package className="h-4 w-4" aria-hidden /> Page publique (client)</a>}
    </nav>
  );
  const Brand = (
    <div className="flex min-w-0 items-center gap-2.5">
      {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white">{settings.name.slice(0, 2).toUpperCase()}</span>}
      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{settings.name}</span><span className="block text-xs text-slate-500">{TRANSPORT_TYPES[settings.transport_type]?.label}</span></span>
    </div>
  );
  return (
    <Ctx.Provider value={ctx}>
      <div style={style} className={`${theme === "dark" ? "bu-dark" : ""} min-h-dvh bg-slate-50 text-slate-900`}>
        <div className="mx-auto flex max-w-[1500px]">
          <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
            {Brand}
            <div className="mt-6 flex-1 overflow-y-auto">{NavList}</div>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{ROLE_LABELS[s.role]} · MiniSoft Transport</p>
          </aside>
          <div className="min-w-0 flex-1 pb-24 lg:pb-8">
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 lg:hidden" onClick={() => setMenu(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold lg:text-base">{visible.find((n) => n.id === current)?.label}</p><p className="truncate text-xs text-slate-500 lg:hidden">{settings.name}</p></div>
              {mode === "demo" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Données de test</span>}
              {b.offline && <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-white">Hors connexion</span>}
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200" onClick={toggle} aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"}>{theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button>
              {mode === "live" && <NotificationBell />}
            </header>
            <main className="px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
              {!!s.truncated?.length && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Volume de données très important : l&apos;historique le plus ancien n&apos;est pas affiché ; les totaux sur de longues périodes peuvent être incomplets.</p>}
              {current === "dashboard" && <Dashboard />}
              {current === "missions" && <Missions />}
              {current === "commandes" && <Orders />}
              {current === "livreurs" && <Couriers />}
              {current === "vehicules" && <Vehicles />}
              {current === "carte" && <MapPage />}
              {current === "finances" && <Finances />}
              {current === "assistant" && <Assistant />}
              {current === "parametres" && <SettingsPage />}
            </main>
          </div>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${quick.length + 1}, minmax(0,1fr))` }} aria-label="Accès rapides">
          {quick.map((n) => (
            <button key={n.id} onClick={() => go(n.id)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${current === n.id ? "font-semibold text-[var(--brand)]" : "text-slate-600"}`}><n.icon className="h-5 w-5" aria-hidden />{n.short}</button>
          ))}
          <button onClick={() => setMenu(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-slate-600"><Menu className="h-5 w-5" aria-hidden /> Menu</button>
        </nav>
        {menu && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" onClick={() => setMenu(false)}>
            <div className="absolute inset-y-0 left-0 w-[82%] max-w-xs overflow-y-auto bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">{Brand}<button className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100" onClick={() => setMenu(false)} aria-label="Fermer le menu"><X className="h-5 w-5" /></button></div>
              {NavList}
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}
