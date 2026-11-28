"use client";

import { Activity as ActivityIcon, ArrowDownRight, ArrowUpRight, Plus, TrendingUp, Wallet } from "lucide-react";
import { useMemo } from "react";
import { ago, monthTrend, recentActivity } from "@/lib/dashboard-stats";
import { dashboardFor, sortWidgets } from "@/lib/auto-dashboard";
import { orderEntities, profileFor } from "@/lib/ui-profile";
import { computeWidget, type Row } from "@/lib/stats";
import type { AppSpec, Widget } from "@/lib/spec";

const PALETTE = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];
const fmt = (n: number, unit?: string) => `${n.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`;
const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M` : n >= 10_000 ? `${Math.round(n / 1000).toLocaleString("fr-FR")} k` : n.toLocaleString("fr-FR"));
function monthLabel(k: string) {
  const [y, m] = k.split("-");
  return y && m ? new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", { month: "short" }) : k;
}

/** Tableau de bord 2D : cartes de chiffres avec évolution réelle, courbe mensuelle, répartition, activité récente et actions rapides. */
export function Dashboard2D({ spec, readable, records, loading, onOpen, onNew, canCreate }: { spec: AppSpec; readable: string[]; records: Record<string, Row[]>; loading: boolean; onOpen: (entity: string, id?: string) => void; onNew: (entity: string) => void; canCreate: (entity: string) => boolean }) {
  const ordered = useMemo(() => orderEntities(spec), [spec]);
  // Les modules les plus importants pour le métier passent en premier (cartes, graphiques, actions rapides).
  const widgets = useMemo(() => { const rank = (k: string) => ordered.findIndex((e) => e.key === k); const base = sortWidgets(dashboardFor(spec)).filter((w) => readable.includes(w.entity)); const kind = (t: string) => (t === "count" || t === "sum" ? 0 : t === "monthly" || t === "breakdown" ? 1 : 2); return [...base].sort((a, b) => kind(a.type) - kind(b.type) || rank(a.entity) - rank(b.entity)); }, [spec, readable, ordered]);
  const allNums = widgets.filter((w) => w.type === "count" || w.type === "sum");
  // Grille sans trou : 8, 4 ou 2 cartes (les autres chiffres restent dans les pages et les listes).
  const nums = allNums.slice(0, allNums.length >= 8 ? 8 : allNums.length >= 4 ? 4 : allNums.length >= 2 ? 2 : allNums.length);
  const monthly = widgets.filter((w) => w.type === "monthly");
  const breaks = widgets.filter((w) => w.type === "breakdown");
  const lists = widgets.filter((w) => w.type === "recent" || w.type === "low_stock");
  const activity = useMemo(() => recentActivity(spec, records, 8).filter((a) => readable.includes(a.entity)), [spec, records, readable]);
  const quick = ordered.filter((e) => readable.includes(e.key) && canCreate(e.key)).slice(0, 4);
  const today = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  if (loading) return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-200/70" />)}</div>;
  const rows = (w: Widget) => records[w.entity] ?? [];
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-slate-900 sm:text-2xl">Bonjour 👋 {spec.name}</h2>
          <p className="mt-0.5 text-sm text-slate-500"><span className="capitalize">{today}</span> · {profileFor(spec).tagline}</p>
        </div>
        {quick.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {quick.map((e) => (
              <button key={e.key} onClick={() => onNew(e.key)} className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm hover:border-slate-300">
                <Plus className="h-4 w-4" style={{ color: "var(--app-primary)" }} aria-hidden />{e.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {nums.map((w, i) => {
          const r = computeWidget(spec, w, rows(w));
          if (r.kind !== "number") return null;
          const e = spec.entities.find((x) => x.key === w.entity)!;
          const t = monthTrend(rows(w), { field: w.type === "sum" ? w.field : undefined });
          const color = PALETTE[i % PALETTE.length]!;
          return (
            <button key={`${w.label}-${i}`} onClick={() => onOpen(w.entity)} className="rounded-2xl border border-slate-200 bg-white p-3.5 text-left shadow-sm transition hover:border-slate-300 hover:shadow sm:p-4" aria-label={w.label}>
              <div className="flex items-start justify-between gap-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `${color}1a`, color }}>{w.type === "sum" ? <Wallet className="h-5 w-5" aria-hidden /> : <span aria-hidden>{e.icon}</span>}</span>
                {t.pct !== null && <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.pct >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{t.pct >= 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden /> : <ArrowDownRight className="h-3 w-3" aria-hidden />}{Math.abs(t.pct)}%</span>}
              </div>
              <p className="mt-3 truncate text-xl font-bold text-slate-900 sm:text-2xl">{r.unit ? compact(r.value) : fmt(r.value)}{r.unit && <span className="ml-1 text-xs font-medium text-slate-500">{r.unit}</span>}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 sm:text-sm">{w.label}</p>
              {t.current > 0 && <p className="mt-1 text-[11px] text-slate-400">{w.type === "sum" ? `${fmt(t.current, r.unit)} ce mois-ci` : `+${t.current} ce mois-ci`}</p>}
            </button>
          );
        })}
      </div>

      {(monthly.length > 0 || breaks.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-3">
          {monthly[0] && <ChartCard className="lg:col-span-2" title={monthly[0].label}><AreaChart spec={spec} w={monthly[0]} rows={rows(monthly[0])} color={PALETTE[0]!} /></ChartCard>}
          {breaks[0] && <ChartCard title={breaks[0].label}><Donut spec={spec} w={breaks[0]} rows={rows(breaks[0])} /></ChartCard>}
          {monthly[1] && <ChartCard className="lg:col-span-2" title={monthly[1].label}><AreaChart spec={spec} w={monthly[1]} rows={rows(monthly[1])} color={PALETTE[1]!} /></ChartCard>}
          {breaks[1] && <ChartCard title={breaks[1].label}><Donut spec={spec} w={breaks[1]} rows={rows(breaks[1])} /></ChartCard>}
          {monthly.slice(2).map((w, i) => <ChartCard key={w.label} className="lg:col-span-2" title={w.label}><AreaChart spec={spec} w={w} rows={rows(w)} color={PALETTE[(i + 2) % PALETTE.length]!} /></ChartCard>)}
          {breaks.slice(2).map((w) => <ChartCard key={w.label} title={w.label}><Donut spec={spec} w={w} rows={rows(w)} /></ChartCard>)}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Activité récente" icon={<ActivityIcon className="h-4 w-4" aria-hidden />}>
          {activity.length === 0 ? <p className="text-sm text-slate-600">Rien pour l&apos;instant : les nouvelles fiches apparaîtront ici.</p> : (
            <ul className="divide-y divide-slate-100">
              {activity.map((a) => (
                <li key={`${a.entity}-${a.id}`}>
                  <button onClick={() => onOpen(a.entity, a.id)} className="flex w-full items-center gap-3 py-2.5 text-left hover:bg-slate-50">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-base" aria-hidden>{a.icon}</span>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-900">{a.title}</span><span className="block truncate text-xs text-slate-500">{a.entityLabel}</span></span>
                    <span className="shrink-0 text-xs text-slate-400">{ago(a.at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ChartCard>
        <div className="space-y-4">
          {lists.slice(0, 2).map((w) => {
            const r = computeWidget(spec, w, rows(w));
            if (r.kind !== "list") return null;
            return (
              <ChartCard key={w.label} title={w.label} icon={<TrendingUp className="h-4 w-4" aria-hidden />}>
                {r.items.length === 0 ? <p className="text-sm text-slate-600">{w.type === "low_stock" ? "Aucun élément sous le seuil." : "Aucune fiche pour l'instant."}</p> : (
                  <ul className="divide-y divide-slate-100">{r.items.map((it) => <li key={it.id} className="flex justify-between gap-2 py-2 text-sm"><button className="truncate text-left text-slate-800 hover:underline" onClick={() => onOpen(w.entity, it.id)}>{it.label}</button><span className={w.type === "low_stock" ? "shrink-0 font-medium text-red-600" : "shrink-0 text-slate-500"}>{it.detail}</span></li>)}</ul>
                )}
              </ChartCard>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-400">Tous les chiffres sont calculés sur vos fiches enregistrées.</p>
    </div>
  );
}

function ChartCard({ title, icon, className = "", children }: { title: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900"><span className="text-slate-400">{icon}</span>{title}</h3>
      {children}
    </section>
  );
}

/** Courbe mensuelle en aire (SVG) : un point par mois ayant des fiches. */
function AreaChart({ spec, w, rows, color }: { spec: AppSpec; w: Widget; rows: Row[]; color: string }) {
  const r = computeWidget(spec, w, rows);
  if (r.kind !== "series" || r.points.length === 0) return <p className="py-6 text-sm text-slate-600">Pas encore de données.</p>;
  const pts = r.points;
  const max = Math.max(...pts.map((p) => p.value), 1);
  const W = 320, H = 130, pad = 8;
  const x = (i: number) => (pts.length === 1 ? W / 2 : pad + (i * (W - pad * 2)) / (pts.length - 1));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2 - 6);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - pad} L${x(0).toFixed(1)},${H - pad} Z`;
  const gid = `g${Math.abs([...w.label].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % 100000}`;
  return (
    <div>
      <div className="flex items-end justify-between text-xs text-slate-500"><span>Maximum : <b className="text-slate-800">{fmt(max, r.unit)}</b></span><span>{pts.length} mois</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 h-40 w-full" role="img" aria-label={`${w.label} : ${pts.map((p) => `${monthLabel(p.label)} ${fmt(p.value, r.unit)}`).join(", ")}`}>
        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.28" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {[0.25, 0.5, 0.75].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - pad - f * (H - pad * 2 - 6)} y2={H - pad - f * (H - pad * 2 - 6)} stroke="#e2e8f0" strokeDasharray="3 4" />)}
        {pts.length > 1 && <path d={area} fill={`url(#${gid})`} />}
        {pts.length > 1 && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p, i) => <circle key={p.label} cx={x(i)} cy={y(p.value)} r="3.5" fill="#fff" stroke={color} strokeWidth="2"><title>{`${monthLabel(p.label)} : ${fmt(p.value, r.unit)}`}</title></circle>)}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500">{pts.map((p) => <span key={p.label}>{monthLabel(p.label)}</span>)}</div>
    </div>
  );
}

/** Répartition en anneau (SVG) avec légende chiffrée. */
function Donut({ spec, w, rows }: { spec: AppSpec; w: Widget; rows: Row[] }) {
  const r = computeWidget(spec, w, rows);
  if (r.kind !== "series" || r.points.length === 0) return <p className="py-6 text-sm text-slate-600">Pas encore de données.</p>;
  const pts = r.points.slice(0, 6);
  const total = pts.reduce((a, p) => a + p.value, 0) || 1;
  const R = 42, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <svg viewBox="0 0 120 120" className="h-32 w-32 shrink-0 -rotate-90" role="img" aria-label={`${w.label} : ${pts.map((p) => `${p.label} ${p.value}`).join(", ")}`}>
        <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
        {pts.map((p, i) => { const len = (p.value / total) * C; const el = <circle key={p.label} cx="60" cy="60" r={R} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}><title>{`${p.label} : ${p.value}`}</title></circle>; acc += len; return el; })}
        <text x="60" y="64" textAnchor="middle" transform="rotate(90 60 60)" className="fill-slate-900 text-[18px] font-bold">{total}</text>
      </svg>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {pts.map((p, i) => <li key={p.label} className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PALETTE[i % PALETTE.length] }} /><span className="min-w-0 flex-1 truncate text-slate-700">{p.label}</span><span className="font-medium text-slate-900">{p.value}</span><span className="w-9 text-right text-xs text-slate-400">{Math.round((p.value / total) * 100)}%</span></li>)}
      </ul>
    </div>
  );
}
