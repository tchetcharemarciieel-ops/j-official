"use client";

import { BarChart3, CalendarCheck, ClipboardList, GraduationCap, Home, LayoutDashboard, Loader2, Megaphone, Menu, Moon, RefreshCw, School, Settings2, Sun, Trophy, Users, Wallet, X, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Toaster";
import { NotificationBell } from "@/components/espace/NotificationBell";
import { has, type Permission } from "@/lib/team";
import { ROLE_LABELS } from "@/lib/spec";
import { CURRENCIES, SCHOOL_TYPES, money, settingsOf } from "@/lib/ecole/model";
import { Ctx, type EcoleCtx, type Page } from "./context";
import { useEcole } from "./useEcole";
import { Dashboard } from "./pages/Dashboard";
import { Students } from "./pages/Students";
import { Structure } from "./pages/Structure";
import { Teachers } from "./pages/Teachers";
import { Grades } from "./pages/Grades";
import { Reports } from "./pages/Reports";
import { Attendance } from "./pages/Attendance";
import { Finances } from "./pages/Finances";
import { Announcements } from "./pages/Announcements";
import { Analyses } from "./pages/Analyses";
import { SettingsPage } from "./pages/Settings";
import { Parent } from "./pages/Parent";

type Nav = { id: Page; label: string; short: string; icon: LucideIcon; show: boolean };
type Theme = "light" | "dark";

/**
 * MiniSoft École : administration (élèves, classes, enseignants), pédagogie (notes, bulletins), présences,
 * finances, annonces et espace parent. Chaque page n'affiche que ce que le poste permet ; le serveur
 * revérifie chaque action et ne renvoie que les données autorisées (un parent ne reçoit que ses enfants).
 */
export function EcoleApp({ projectId, mode }: { projectId: string; mode: "demo" | "live" }) {
  const b = useEcole(projectId, mode);
  const notify = useToast();
  const [page, setPage] = useState<Page | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const s = b.state;
  useEffect(() => {
    try {
      const t = localStorage.getItem("msecole:theme");
      if (t === "dark" || t === "light") setTheme(t);
    } catch { /* thème clair */ }
  }, []);
  const toggle = () => { const n: Theme = theme === "dark" ? "light" : "dark"; setTheme(n); try { localStorage.setItem("msecole:theme", n); } catch { /* ignoré */ } };
  const may = useCallback((p: Permission | Permission[]) => has(s?.perms ?? null, p), [s?.perms]);
  const run = useCallback<EcoleCtx["run"]>(async (name, input, opts = {}) => {
    try { const r = await b.op(name, input); if (!opts.quiet) notify("success", r.message); return r; }
    catch (e) { notify("error", e instanceof Error ? e.message : "Action impossible."); return null; }
  }, [b, notify]);
  const go = useCallback((p: Page, f?: string) => { setPage(p); setFocus(f ?? null); setMenu(false); window.scrollTo({ top: 0 }); }, []);
  const settings = useMemo(() => settingsOf(b.data.settings[0], s?.projectName), [b.data.settings, s?.projectName]);
  if (!s) {
    return (
      <div className="grid min-h-[60vh] place-items-center p-6 text-center">
        {b.error ? <div className="max-w-sm"><p className="font-medium text-slate-900">{b.error}</p><button className="btn btn-ghost mt-4" onClick={() => void b.load()}><RefreshCw className="h-4 w-4" /> Réessayer</button></div> : <Loader2 className="h-6 w-6 animate-spin text-slate-400" aria-label="Chargement" />}
      </div>
    );
  }
  const parent = s.can.parent;
  const nav: Nav[] = [
    { id: "parent", label: "Mes enfants", short: "Enfants", icon: Home, show: parent },
    { id: "dashboard", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard, show: !parent },
    { id: "eleves", label: "Élèves et inscriptions", short: "Élèves", icon: GraduationCap, show: !parent && may(["eleves", "finances", "classes", "rapports"]) },
    { id: "structure", label: "Classes et matières", short: "Classes", icon: School, show: !parent && may(["classes", "notes", "presences", "eleves"]) },
    { id: "enseignants", label: "Enseignants", short: "Équipe", icon: Users, show: !parent && may(["enseignants", "classes"]) },
    { id: "notes", label: "Notes et évaluations", short: "Notes", icon: ClipboardList, show: !parent && may("notes") },
    { id: "bulletins", label: "Bulletins et classements", short: "Bulletins", icon: Trophy, show: !parent && may(["bulletins", "classes", "notes"]) },
    { id: "presences", label: "Présences", short: "Présences", icon: CalendarCheck, show: !parent && may("presences") },
    { id: "finances", label: "Finances", short: "Finances", icon: Wallet, show: !parent && may("finances") },
    { id: "annonces", label: "Annonces", short: "Annonces", icon: Megaphone, show: true },
    { id: "analyses", label: "Analyses", short: "Analyses", icon: BarChart3, show: !parent && may(["classes", "eleves", "rapports"]) },
    { id: "parametres", label: "Réglages", short: "Réglages", icon: Settings2, show: !parent && may("parametres") },
  ];
  const visible = nav.filter((n) => n.show);
  const fallback: Page = parent ? "parent" : "dashboard";
  const current: Page = page && visible.some((n) => n.id === page) ? page : fallback;
  const ctx: EcoleCtx = { ...b, s, projectId, mode, settings, notify, may, run, go, focus, fmt: (n) => money(n, settings.currency), num: (n) => (n === null || n === undefined ? "—" : (CURRENCIES[settings.currency]?.decimals ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString("fr-FR"))), cur: CURRENCIES[settings.currency]?.label ?? "FCFA" };
  const style = { "--brand": settings.primary } as React.CSSProperties;
  const quick = visible.filter((n) => ["parent", "dashboard", "eleves", "notes", "presences", "finances", "annonces"].includes(n.id)).slice(0, 4);
  const logo = b.fileUrl(settings.logo_id);
  const NavList = (
    <nav aria-label="Menu de l'établissement" className="space-y-0.5">
      {visible.map((n) => (
        <button key={n.id} onClick={() => go(n.id)} aria-current={current === n.id ? "page" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${current === n.id ? "bg-[var(--brand)] font-medium text-white shadow-sm" : "text-slate-700 hover:bg-slate-100"}`}>
          <n.icon className="h-4 w-4 shrink-0" aria-hidden /><span className="flex-1 truncate text-left">{n.label}</span>
        </button>
      ))}
      {s.can.team && mode === "live" && <Link href={`/projets/${projectId}?onglet=equipe`} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100"><Users className="h-4 w-4" aria-hidden /> Comptes et accès</Link>}
    </nav>
  );
  const Brand = (
    <div className="flex min-w-0 items-center gap-2.5">
      {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" className="h-10 w-10 rounded-xl object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--brand)] text-sm font-bold text-white">{settings.name.slice(0, 2).toUpperCase()}</span>}
      <span className="min-w-0"><span className="block truncate text-sm font-semibold">{settings.name}</span><span className="block text-xs text-slate-500">{SCHOOL_TYPES[settings.school_type]?.label}</span></span>
    </div>
  );
  return (
    <Ctx.Provider value={ctx}>
      <div style={style} className={`${theme === "dark" ? "bu-dark" : ""} min-h-dvh bg-slate-50 text-slate-900`}>
        <div className="mx-auto flex max-w-[1500px]">
          <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex">
            {Brand}<div className="mt-6 flex-1 overflow-y-auto">{NavList}</div>
            <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{ROLE_LABELS[s.role]} · MiniSoft École</p>
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
              {b.offline && <p className="mb-4 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">Connexion instable : les informations affichées datent de la dernière mise à jour. Les actions (notes, appel, paiements) sont envoyées dès que la connexion revient ; rien n&apos;est perdu tant que cette page reste ouverte.</p>}
              {!!s.truncated?.length && <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">Volume de données très important : l&apos;historique le plus ancien n&apos;est pas affiché.</p>}
              {current === "parent" && <Parent />}
              {current === "dashboard" && <Dashboard />}
              {current === "eleves" && <Students />}
              {current === "structure" && <Structure />}
              {current === "enseignants" && <Teachers />}
              {current === "notes" && <Grades />}
              {current === "bulletins" && <Reports />}
              {current === "presences" && <Attendance />}
              {current === "finances" && <Finances />}
              {current === "annonces" && <Announcements />}
              {current === "analyses" && <Analyses />}
              {current === "parametres" && <SettingsPage />}
            </main>
          </div>
        </div>
        <nav className="fixed inset-x-0 bottom-0 z-30 grid border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden" style={{ gridTemplateColumns: `repeat(${quick.length + 1}, minmax(0,1fr))` }} aria-label="Accès rapides">
          {quick.map((n) => <button key={n.id} onClick={() => go(n.id)} className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${current === n.id ? "font-semibold text-[var(--brand)]" : "text-slate-600"}`}><n.icon className="h-5 w-5" aria-hidden />{n.short}</button>)}
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
