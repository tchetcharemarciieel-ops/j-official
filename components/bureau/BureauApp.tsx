"use client";

import { Bot, BriefcaseBusiness, Building2, CalendarDays, Clock, FileText, FolderKanban, Laptop, LayoutDashboard, Loader2, Menu, MessageSquare, Moon, RefreshCw, Settings2, Sun, Users, UserRound, Wallet, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toaster";
import { NotificationBell } from "@/components/espace/NotificationBell";
import { has, type Permission } from "@/lib/team";
import { ROLE_LABELS } from "@/lib/spec";
import { AGENCY_TYPES, enabledSectorKeys, money, moduleOn, settingsOf, type Client, type Doc, type Employee, type Message, type Page } from "@/lib/bureau/model";
import { Ctx, type BureauCtx } from "./context";
import { useBureau } from "./useBureau";
import { Dashboard } from "./pages/Dashboard";
import { Clients } from "./pages/Clients";
import { Projects } from "./pages/Projects";
import { Staff, Presences } from "./pages/Staff";
import { Agenda } from "./pages/Agenda";
import { Documents } from "./pages/Documents";
import { Finances } from "./pages/Finances";
import { Messages } from "./pages/Messages";
import { Equipment } from "./pages/Equipment";
import { Sector } from "./pages/Sector";
import { Workspace } from "./pages/Workspace";
import { Assistant } from "./pages/Assistant";
import { SettingsPage } from "./pages/Settings";

type Nav = { id: Page; label: string; icon: LucideIcon; need?: Permission[]; badge?: number };
type Theme = "light" | "dark";

/**
 * MiniSoft Bureau : interface de gestion de bureau et d'agence. Chaque page n'affiche que ce que le
 * poste permet ; le serveur revérifie chaque action et ne renvoie que les données autorisées.
 */
export function BureauApp({ projectId, mode }: { projectId: string; mode: "demo" | "live" }) {
  const b = useBureau(projectId, mode);
  const notify = useToast();
  const [page, setPage] = useState<Page>("dashboard");
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const s = b.state;
  useEffect(() => {
    try {
      const t = localStorage.getItem("msbureau:theme");
      if (t === "dark" || t === "light") setTheme(t);
      else if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) setTheme("dark");
    } catch {
      /* préférence non lisible : thème clair */
    }
  }, []);
  const toggle = () => {
    const n: Theme = theme === "dark" ? "light" : "dark";
    setTheme(n);
    try {
      localStorage.setItem("msbureau:theme", n);
    } catch {
      /* stockage indisponible */
    }
  };

  const may = useCallback((p: Permission | Permission[]) => has(s?.perms ?? null, p), [s?.perms]);
  const run = useCallback<BureauCtx["run"]>(
    async (name, input, opts = {}) => {
      try {
        const r = await b.op(name, input);
        if (!opts.quiet) notify("success", r.message);
        return r;
      } catch (e) {
        notify("error", e instanceof Error ? e.message : "Action impossible.");
        return null;
      }
    },
    [b, notify],
  );
  const go = useCallback((p: Page, f?: string) => {
    setPage(p);
    setFocus(f ?? null);
    setMenu(false);
    window.scrollTo({ top: 0 });
  }, []);

  const settings = useMemo(() => settingsOf(b.data.settings[0], s?.projectName), [b.data.settings, s?.projectName]);
  const memberName = useCallback((id: string | null | undefined) => (id ? (s?.members.find((m) => m.id === id)?.name ?? "Ancien membre") : "—"), [s?.members]);
  const clientName = useCallback((id: string | null | undefined) => (id ? ((b.data.client as Doc<Client>[]).find((c) => c.id === id)?.data.name ?? "Client supprimé") : "—"), [b.data.client]);
  const empName = useCallback((id: string | null | undefined) => (id ? ((b.data.employee as Doc<Employee>[]).find((e) => e.id === id)?.data.name ?? "Employé supprimé") : "—"), [b.data.employee]);
  const lookup = useCallback(
    (rel: string, id: string) => {
      if (rel === "client") return clientName(id);
      if (rel === "employee") return empName(id);
      const r = b.data.record.find((x) => x.id === id);
      const d = r?.data as { data?: Record<string, unknown> } | undefined;
      return d?.data ? String(d.data.titre ?? d.data.nom ?? d.data.reference ?? d.data.type ?? d.data.produit ?? "Fiche") : "Fiche supprimée";
    },
    [clientName, empName, b.data.record],
  );

  if (!s) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        {b.error ? (
          <div className="max-w-sm">
            <p className="font-medium text-slate-900">{b.error}</p>
            <button className="btn btn-ghost mt-4" onClick={() => void b.load()}><RefreshCw className="h-4 w-4" /> Réessayer</button>
          </div>
        ) : (
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Chargement" />
        )}
      </div>
    );
  }

  const unread = (b.data.message as Doc<Message>[]).filter((m) => m.data.from !== s.me && !m.data.read_by.includes(s.me)).length;
  const hasSector = enabledSectorKeys(settings).length > 0;
  const nav: Nav[] = [
    { id: "dashboard", label: "Tableau de bord", icon: LayoutDashboard },
    { id: "workspace", label: "Bureau virtuel", icon: Building2 },
    { id: "clients", label: "Clients", icon: Users, need: ["clients", "agenda", "documents", "projets"] },
    { id: "projets", label: "Projets et tâches", icon: FolderKanban, need: ["projets"] },
    { id: "agenda", label: "Agenda", icon: CalendarDays, need: ["agenda"] },
    { id: "documents", label: "Documents et facturation", icon: FileText, need: ["documents"] },
    { id: "finances", label: "Finances", icon: Wallet, need: ["finances"] },
    ...(hasSector ? [{ id: "metier" as Page, label: AGENCY_TYPES[settings.agency_type].label.split(" ").slice(0, 2).join(" ") || "Métier", icon: BriefcaseBusiness, need: ["metier"] as Permission[] }] : []),
    { id: "personnel", label: "Personnel", icon: UserRound, need: ["personnel"] },
    ...(moduleOn(settings, "presences") ? [{ id: "presences" as Page, label: "Présences", icon: Clock }] : []),
    ...(moduleOn(settings, "equipements") ? [{ id: "equipements" as Page, label: "Équipements", icon: Laptop, need: ["equipements", "personnel"] as Permission[] }] : []),
    ...(moduleOn(settings, "messagerie") ? [{ id: "messagerie" as Page, label: "Messagerie", icon: MessageSquare, badge: unread }] : []),
    { id: "assistant", label: "MiniSoft AI", icon: Bot, need: ["rapports", "projets", "agenda", "finances", "personnel", "clients"] },
    { id: "parametres", label: "Réglages", icon: Settings2, need: ["parametres"] },
  ];
  const visible = nav.filter((n) => !n.need || may(n.need));
  const current = visible.some((n) => n.id === page) ? page : "dashboard";
  const ctx: BureauCtx = { ...b, s, projectId, mode, settings, notify, may, run, go, focus, fmt: (n) => money(n, settings.currency), memberName, clientName, empName, lookup };
  const style = { "--brand": settings.primary } as React.CSSProperties;
  const quick = visible.filter((n) => ["dashboard", "workspace", "projets", "messagerie", "agenda"].includes(n.id)).slice(0, 4);
  const logo = b.fileUrl(settings.logo_id);

  const NavList = (
    <nav aria-label="Menu de l'entreprise" className="space-y-0.5">
      {visible.map((n) => (
        <button key={n.id} onClick={() => go(n.id)} aria-current={current === n.id ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${current === n.id ? "bg-[var(--brand)] font-medium text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"}`}>
          <n.icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1 truncate text-left">{n.label}</span>
          {!!n.badge && <span className={`rounded-full px-1.5 text-xs font-semibold ${current === n.id ? "bg-white/25" : "bg-red-500 text-white"}`}>{n.badge}</span>}
        </button>
      ))}
      {s.can.team && mode === "live" && (
        <Link href={`/projets/${projectId}?onglet=equipe`} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100">
          <Users className="h-4 w-4" aria-hidden /> Comptes et accès
        </Link>
      )}
    </nav>
  );
  const Brand = (
    <div className="flex min-w-0 items-center gap-2.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-10 w-10 rounded-xl object-cover" />
      ) : (
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white">{settings.name.slice(0, 2).toUpperCase()}</span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{settings.name}</span>
        <span className="block text-xs text-slate-500">{AGENCY_TYPES[settings.agency_type].label}</span>
      </span>
    </div>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div style={style} className={`${theme === "dark" ? "bu-dark" : ""} min-h-dvh bg-slate-50 text-slate-900`}>
        <div className="mx-auto flex max-w-[1500px]">
          <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
            {Brand}
            <div className="mt-6 flex-1 overflow-y-auto">{NavList}</div>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{ROLE_LABELS[s.role]} · MiniSoft Bureau</p>
          </aside>
          <div className="min-w-0 flex-1 pb-24 lg:pb-8">
            <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur lg:px-6">
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 lg:hidden" onClick={() => setMenu(true)} aria-label="Ouvrir le menu"><Menu className="h-5 w-5" /></button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold lg:text-base">{visible.find((n) => n.id === current)?.label}</p>
                <p className="truncate text-xs text-slate-500 lg:hidden">{settings.name}</p>
              </div>
              {mode === "demo" && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Données de test</span>}
              {b.offline && <span className="rounded-full bg-slate-800 px-2.5 py-1 text-xs text-white">Hors connexion</span>}
              <button className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200" onClick={toggle} aria-label={theme === "dark" ? "Passer en mode clair" : "Passer en mode sombre"} title={theme === "dark" ? "Mode clair" : "Mode sombre"}>
                {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
              </button>
              {mode === "live" && <NotificationBell />}
            </header>
            <main className="px-3 py-4 sm:px-4 lg:px-6 lg:py-6">
              {!!s.truncated?.length && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Volume de données très important : l&apos;historique le plus ancien ({s.truncated.join(", ")}) n&apos;est pas affiché ; les totaux sur de longues périodes peuvent être incomplets.</p>}
              {current === "dashboard" && <Dashboard />}
              {current === "workspace" && <Workspace />}
              {current === "clients" && <Clients />}
              {current === "projets" && <Projects />}
              {current === "agenda" && <Agenda />}
              {current === "documents" && <Documents />}
              {current === "finances" && <Finances />}
              {current === "metier" && <Sector />}
              {current === "personnel" && <Staff />}
              {current === "presences" && <Presences />}
              {current === "equipements" && <Equipment />}
              {current === "messagerie" && <Messages />}
              {current === "assistant" && <Assistant />}
              {current === "parametres" && <SettingsPage />}
            </main>
          </div>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${quick.length + 1}, minmax(0,1fr))` }} aria-label="Accès rapides">
          {quick.map((n) => (
            <button key={n.id} onClick={() => go(n.id)} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${current === n.id ? "font-semibold text-[var(--brand)]" : "text-slate-600"}`}>
              <n.icon className="h-5 w-5" aria-hidden />
              {n.id === "dashboard" ? "Accueil" : n.id === "workspace" ? "Bureau" : n.id === "projets" ? "Projets" : n.label}
              {!!n.badge && <span className="absolute right-[28%] top-1 rounded-full bg-red-500 px-1 text-[10px] text-white">{n.badge}</span>}
            </button>
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
