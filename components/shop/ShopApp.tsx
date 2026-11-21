"use client";

import { BarChart3, Bot, Boxes, CloudOff, Globe, LayoutDashboard, Loader2, Menu, Package, Receipt, RefreshCw, Settings2, ShoppingBag, ShoppingCart, Truck, Users, Wallet, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { useToast } from "@/components/Toaster";
import { NotificationBell } from "@/components/espace/NotificationBell";
import { has, type Permission } from "@/lib/team";
import { OPEN_ORDER, settingsOf, type Doc, type Order, type Product } from "@/lib/shop/model";
import { ROLE_LABELS } from "@/lib/spec";
import { Ctx, type Page, type ShopCtx } from "./context";
import { useShop } from "./useShop";
import { Dashboard } from "./pages/Dashboard";
import { Pos } from "./pages/Pos";
import { Sales } from "./pages/Sales";
import { Products } from "./pages/Products";
import { Stock } from "./pages/Stock";
import { Orders } from "./pages/Orders";
import { Customers } from "./pages/Customers";
import { Suppliers } from "./pages/Suppliers";
import { Expenses } from "./pages/Expenses";
import { Reports } from "./pages/Reports";
import { Online } from "./pages/Online";
import { SettingsPage } from "./pages/Settings";
import { Assistant } from "./pages/Assistant";

type NavItem = { id: Page; label: string; icon: LucideIcon; need?: Permission[]; badge?: number };

/**
 * MiniSoft Shop : interface du commerçant. Chaque page n'affiche que ce que le poste permet ;
 * le serveur revérifie chaque action et ne renvoie que les données autorisées.
 */
export function ShopApp({ projectId, mode }: { projectId: string; mode: "demo" | "live" }) {
  const shop = useShop(projectId, mode);
  const notify = useToast();
  const [page, setPage] = useState<Page>("dashboard");
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const s = shop.state;

  const may = useCallback((p: Permission | Permission[]) => has(s?.perms ?? null, p), [s?.perms]);
  const run = useCallback<ShopCtx["run"]>(
    async (name, input, opts = {}) => {
      try {
        const r = await shop.op(name, input, opts);
        if (!opts.quiet || r.queued) notify(r.queued ? "info" : "success", r.message);
        return r;
      } catch (e) {
        notify("error", e instanceof Error ? e.message : "Action impossible.");
        return null;
      }
    },
    [shop, notify],
  );
  const go = useCallback((p: Page, f?: string) => {
    setPage(p);
    setFocus(f ?? null);
    setMenu(false);
    window.scrollTo({ top: 0 });
  }, []);

  const products = useMemo(() => (shop.data.product as Doc<Product>[]).filter((p) => !p.data.archived).sort((a, b) => a.data.name.localeCompare(b.data.name, "fr")), [shop.data.product]);
  const settings = useMemo(() => settingsOf(shop.data.settings[0], s?.projectName), [shop.data.settings, s?.projectName]);
  const memberName = useCallback((id: string | null | undefined) => (id ? (s?.members.find((m) => m.id === id)?.name ?? "Ancien membre") : "Client en ligne"), [s?.members]);

  if (!s) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        {shop.error ? (
          <div className="max-w-sm">
            <p className="font-medium text-slate-900">{shop.error}</p>
            <button className="btn btn-ghost mt-4" onClick={() => void shop.load()}>
              <RefreshCw className="h-4 w-4" /> Réessayer
            </button>
          </div>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Chargement" />
        )}
      </div>
    );
  }

  const pending = (shop.data.order as Doc<Order>[]).filter((o) => OPEN_ORDER.includes(o.data.status)).length;
  const nav: NavItem[] = [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "pos", label: "Caisse", icon: ShoppingCart, need: ["caisse"] },
    { id: "sales", label: "Ventes", icon: Receipt, need: ["caisse", "rapports", "remises", "clients"] },
    { id: "products", label: "Produits", icon: Package },
    { id: "stock", label: "Stock", icon: Boxes, need: ["stock"] },
    { id: "orders", label: "Commandes", icon: ShoppingBag, need: ["commandes"], badge: pending },
    { id: "customers", label: "Clients", icon: Users, need: ["clients", "caisse", "commandes"] },
    { id: "suppliers", label: "Fournisseurs", icon: Truck, need: ["achats"] },
    { id: "expenses", label: "Dépenses", icon: Wallet, need: ["finances"] },
    { id: "reports", label: "Rapports", icon: BarChart3, need: ["rapports", "finances"] },
    { id: "assistant", label: "MiniSoft AI", icon: Bot, need: ["rapports", "stock", "finances"] },
    { id: "online", label: "Boutique en ligne", icon: Globe, need: ["parametres"] },
    { id: "settings", label: "Réglages", icon: Settings2, need: ["parametres"] },
  ];
  const visible = nav.filter((n) => !n.need || may(n.need)).filter((n) => (n.id === "expenses" ? s.can.finances : n.id === "settings" || n.id === "online" ? s.can.settings : true));
  const current = visible.some((n) => n.id === page) ? page : "dashboard";

  const ctx: ShopCtx = { ...shop, s, projectId, mode, settings, notify, may, run, go, focus, products, memberName };
  const style = { "--brand": settings.primary } as React.CSSProperties;
  const quick = visible.filter((n) => ["dashboard", "pos", "products", "orders"].includes(n.id)).slice(0, 4);

  const NavList = (
    <nav aria-label="Menu de la boutique" className="space-y-0.5">
      {visible.map((n) => (
        <button key={n.id} onClick={() => go(n.id)} aria-current={current === n.id ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${current === n.id ? "bg-[var(--brand)] font-medium text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"}`}>
          <n.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-left">{n.label}</span>
          {!!n.badge && <span className={`rounded-full px-1.5 text-xs font-semibold ${current === n.id ? "bg-white/25" : "bg-red-500 text-white"}`}>{n.badge}</span>}
        </button>
      ))}
      {s.can.team && mode === "live" && (
        <Link href={`/projets/${projectId}?onglet=equipe`} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">
          <Users className="h-4 w-4" aria-hidden /> Employés et accès
        </Link>
      )}
    </nav>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div style={style} className="min-h-dvh bg-slate-50 text-slate-900">
        <div className="mx-auto flex max-w-[1500px]">
          <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
            <ShopBrand />
            <div className="mt-6 flex-1 overflow-y-auto">{NavList}</div>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{ROLE_LABELS[s.role]} · MiniSoft Shop</p>
          </aside>
          <div className="min-w-0 flex-1 pb-24 lg:pb-8">
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 lg:hidden" onClick={() => setMenu(true)} aria-label="Ouvrir le menu">
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold lg:text-base">{visible.find((n) => n.id === current)?.label}</p>
                <p className="truncate text-xs text-slate-500 lg:hidden">{settings.name}</p>
              </div>
              {mode === "demo" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Données de test</span>}
              {(shop.offline || shop.stale) && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2.5 py-1 text-xs text-white">
                  <CloudOff className="h-3.5 w-3.5" /> Hors connexion
                </span>
              )}
              {shop.queue.length > 0 && (
                <button onClick={() => void shop.sync()} className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-medium text-white" title="Ventes en attente d'envoi">
                  {shop.queue.length} à synchroniser
                </button>
              )}
              {mode === "live" && <NotificationBell />}
            </header>
            <main className="px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
              {!!s.truncated?.length && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Volume de données très important : l&apos;historique le plus ancien ({s.truncated.join(", ")}) n&apos;est pas affiché, donc les totaux et rapports sur de longues périodes peuvent être incomplets. Contactez MiniSoft RCA pour archiver les anciennes données.</p>}
              {current === "dashboard" && <Dashboard />}
              {current === "pos" && <Pos />}
              {current === "sales" && <Sales />}
              {current === "products" && <Products />}
              {current === "stock" && <Stock />}
              {current === "orders" && <Orders />}
              {current === "customers" && <Customers />}
              {current === "suppliers" && <Suppliers />}
              {current === "expenses" && <Expenses />}
              {current === "reports" && <Reports />}
              {current === "assistant" && <Assistant />}
              {current === "online" && <Online />}
              {current === "settings" && <SettingsPage />}
            </main>
          </div>
        </div>

        {/* Téléphone : barre du bas (accès rapides) + menu complet. */}
        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${quick.length + 1}, minmax(0,1fr))` }} aria-label="Accès rapides">
          {quick.map((n) => (
            <button key={n.id} onClick={() => go(n.id)} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${current === n.id ? "font-semibold text-[var(--brand)]" : "text-slate-600"}`}>
              <n.icon className="h-5 w-5" aria-hidden />
              {n.label === "Tableau de bord" ? "Accueil" : n.label}
              {!!n.badge && <span className="absolute right-[28%] top-1 rounded-full bg-red-500 px-1 text-[10px] text-white">{n.badge}</span>}
            </button>
          ))}
          <button onClick={() => setMenu(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-slate-600">
            <Menu className="h-5 w-5" aria-hidden /> Menu
          </button>
        </nav>
        {menu && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" onClick={() => setMenu(false)}>
            <div className="absolute inset-y-0 left-0 w-[82%] max-w-xs overflow-y-auto bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 flex items-center justify-between">
                <ShopBrand />
                <button className="grid h-9 w-9 place-items-center rounded-full hover:bg-slate-100" onClick={() => setMenu(false)} aria-label="Fermer le menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              {NavList}
            </div>
          </div>
        )}
      </div>
    </Ctx.Provider>
  );

  function ShopBrand() {
    const logo = shop.img(settings.logo_id);
    return (
      <div className="flex min-w-0 items-center gap-2.5">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" className="h-10 w-10 rounded-xl object-cover" />
        ) : (
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white">{settings.name.slice(0, 2).toUpperCase()}</span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{settings.name}</span>
          <span className="block text-xs text-slate-500">MiniSoft Shop</span>
        </span>
      </div>
    );
  }
}
