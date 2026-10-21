"use client";

import { useMemo, useState } from "react";
import { can } from "@/lib/permissions";
import { api } from "@/lib/fetcher";
import { ROLE_LABELS, type AppSpec, type Role } from "@/lib/spec";
import type { Row } from "@/lib/stats";
import { useToast } from "@/components/Toaster";
import { useAppData } from "./useAppData";
import { WidgetCard } from "./Widgets";
import { EntityView } from "./EntityView";

type Answer = { answer: string; facts: string[]; period: string; basis: string; missing: string[]; mode: string; engine: string };

/**
 * Moteur d'exécution : interprète une AppSpec avec des composants validés.
 * Toutes les actions passent par l'API, qui revérifie le rôle à chaque requête.
 */
export function AppRuntime({ projectId, spec, mode, role, compact = false }: { projectId: string; spec: AppSpec; mode: "demo" | "live"; role: Role; compact?: boolean }) {
  const data = useAppData(projectId, mode);
  const notify = useToast();
  const entities = spec.entities.filter((e) => can(e, role, "read"));
  const [page, setPage] = useState<string>("__dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const current = entities.find((e) => e.key === page);

  const rowsFor = (key: string): Row[] => (data.records[key] ?? []).map((r) => ({ id: r.id, data: r.data, created_at: r.created_at }));
  const style = useMemo(() => ({ "--app-primary": spec.theme.primary, "--app-accent": spec.theme.accent }) as React.CSSProperties, [spec.theme]);

  const nav = (
    <nav aria-label={`Menu de ${spec.name}`} className="space-y-1">
      <NavItem active={page === "__dashboard"} onClick={() => (setPage("__dashboard"), setMenuOpen(false))} icon="📊" label="Tableau de bord" />
      {entities.map((e) => (
        <NavItem key={e.key} active={page === e.key} onClick={() => (setPage(e.key), setMenuOpen(false))} icon={e.icon} label={e.labelPlural} count={data.records[e.key]?.length} />
      ))}
    </nav>
  );

  return (
    <div style={style} className={`flex bg-slate-50 text-slate-900 ${compact ? "min-h-[640px] rounded-2xl" : "min-h-dvh"}`}>
      <aside className={`no-print hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white p-4 lg:flex ${compact ? "rounded-l-2xl" : ""}`}>
        <Brand spec={spec} />
        <div className="mt-6 flex-1">{nav}</div>
        <p className="text-xs text-slate-400">
          Rôle : {ROLE_LABELS[role]}
          <br />
          {mode === "demo" ? "Aperçu — données de démonstration" : "Données réelles"}
        </p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-3 lg:hidden">
            <button className="rounded-lg border border-slate-200 px-3 py-2" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-label="Menu">☰</button>
            <Brand spec={spec} small />
          </div>
          <h1 className="hidden truncate text-sm font-medium text-slate-500 lg:block">{current ? current.labelPlural : "Tableau de bord"}</h1>
          <div className="flex items-center gap-2 text-xs">
            {mode === "demo" && <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">Démo</span>}
            {data.pending > 0 && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{data.pending} en attente d&apos;envoi</span>}
            <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${data.online ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`} role="status">
              <span className={`h-2 w-2 rounded-full ${data.online ? "bg-emerald-500" : "bg-red-500"}`} />
              {data.online ? "En ligne" : "Hors ligne"}
            </span>
          </div>
        </header>
        {menuOpen && <div className="no-print border-b border-slate-200 bg-white p-3 lg:hidden">{nav}</div>}

        <main className="flex-1 p-4 sm:p-6">
          {data.error && (
            <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {data.error}
              <button className="font-medium underline" onClick={() => data.reload()}>Réessayer</button>
            </div>
          )}
          {!data.online && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Vous êtes hors ligne. Les nouvelles fiches seront envoyées au retour du réseau ; la modification, la suppression et l&apos;assistant nécessitent Internet.</p>}
          {current ? (
            <EntityView key={current.key} spec={spec} entity={current} role={role} data={data} notify={notify} />
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold">{spec.name}</h2>
                {spec.welcome && <p className="mt-1 text-sm text-slate-500">{spec.welcome}</p>}
              </div>
              {data.loading ? (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />)}</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {spec.dashboard
                    .filter((w) => entities.some((e) => e.key === w.entity))
                    .map((w, i) => (
                      <WidgetCard key={`${w.label}-${i}`} spec={spec} widget={w} rows={rowsFor(w.entity)} onOpen={setPage} />
                    ))}
                </div>
              )}
              {spec.features.dataAssistant && <DataAssistant projectId={projectId} mode={mode} />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Brand({ spec, small }: { spec: AppSpec; small?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {spec.theme.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={spec.theme.logoUrl} alt="" className={`${small ? "h-8 w-8" : "h-10 w-10"} rounded-xl object-cover`} referrerPolicy="no-referrer" />
      ) : (
        <span className={`grid ${small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"} shrink-0 place-items-center rounded-xl font-bold text-white`} style={{ background: `linear-gradient(135deg, ${spec.theme.primary}, ${spec.theme.accent})` }}>
          {spec.theme.logoText}
        </span>
      )}
      <span className={`truncate font-semibold ${small ? "text-sm" : ""}`}>{spec.name}</span>
    </div>
  );
}

function NavItem({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: string; label: string; count?: number }) {
  return (
    <button onClick={onClick} aria-current={active ? "page" : undefined} className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? "font-semibold text-white" : "text-slate-600 hover:bg-slate-100"}`} style={active ? { background: "var(--app-primary)" } : undefined}>
      <span aria-hidden>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count !== undefined && <span className={`text-xs ${active ? "text-white/80" : "text-slate-400"}`}>{count}</span>}
    </button>
  );
}

function DataAssistant({ projectId, mode }: { projectId: string; mode: "demo" | "live" }) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (q.trim().length < 3) return;
    setLoading(true);
    setError("");
    try {
      setAnswer(await api<Answer>(`/api/apps/${projectId}/ask`, { body: { mode, question: q } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="no-print rounded-2xl border border-slate-200 bg-white p-4" aria-labelledby="assistant-title">
      <h3 id="assistant-title" className="font-semibold">💬 Assistant de données</h3>
      <p className="text-xs text-slate-500">Exemples : « Combien ai-je vendu cette semaine ? », « Quels produits sont presque épuisés ? »</p>
      <form onSubmit={ask} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="ask" className="sr-only">Votre question</label>
        <input id="ask" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} placeholder="Posez une question sur vos données…" className="w-full rounded-xl border border-slate-300 px-3 py-2.5" />
        <button disabled={loading} className="rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-60" style={{ background: "var(--app-primary)" }}>
          {loading ? "Calcul…" : "Demander"}
        </button>
      </form>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {answer && (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm" aria-live="polite">
          <p className="font-medium text-slate-900">{answer.answer}</p>
          <p className="mt-2 text-xs text-slate-500">
            <strong>Période :</strong> {answer.period || "—"} · <strong>Base de calcul :</strong> {answer.basis || "—"} · {answer.mode}
          </p>
          {answer.missing.length > 0 && <p className="mt-1 text-xs text-amber-700">⚠ {answer.missing.join(" ")}</p>}
          <p className="mt-1 text-[11px] text-slate-400">Chiffres calculés directement sur vos données ({answer.engine === "ai" ? "question interprétée par l'IA" : "question interprétée par règles"}).</p>
        </div>
      )}
    </section>
  );
}
