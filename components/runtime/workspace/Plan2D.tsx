"use client";

import { LAYOUT_STYLE, ROOM } from "@/lib/workspace";
import { KIND_ICONS, ROLE_COLORS } from "./kinds";
import { fmtNumber, stationBadge, type SceneProps, type SceneStation } from "./types";

/** Plan 2D vu de dessus : même contenu et mêmes actions que la 3D, très léger pour les petits téléphones. */
export function Plan2D({ stations, layout, title, kpis, demo, onOpen }: SceneProps) {
  const style = LAYOUT_STYLE[layout];
  const pct = (v: number, size: number) => `${((v + size / 2) / size) * 100}%`;
  const board = stations.find((s) => s.kind === "stats_board");
  return (
    <div className="@container flex flex-col gap-3 p-3">
      {board && (
        <button type="button" onClick={() => onOpen(board.target)} className="rounded-xl bg-slate-900 p-3 text-left text-white">
          <span className="flex items-center justify-between text-[11px] uppercase tracking-wide text-slate-300">
            {title} · {board.label}
            {demo && <span className="rounded bg-amber-400 px-1.5 text-[10px] font-semibold normal-case text-slate-900">Démo</span>}
          </span>
          {kpis.length > 0 ? (
            <span className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {kpis.map((k) => (
                <span key={k.label} className="min-w-0">
                  <span className="block truncate text-[10px] text-slate-400">{k.label}</span>
                  <span className="block truncate font-bold">{fmtNumber(k.value, k.unit)}</span>
                </span>
              ))}
            </span>
          ) : (
            <span className="mt-1 block text-xs text-slate-300">Pas encore d&apos;indicateur.</span>
          )}
        </button>
      )}
      {/* Petit écran : grille de cartes ; écran plus large : plan vu de dessus. */}
      <ul className="grid grid-cols-2 gap-2 @lg:hidden">
        {stations
          .filter((s) => s.kind !== "stats_board")
          .map((s) => (
            <li key={s.id}>
              <Card s={s} accent={style.accent} onOpen={onOpen} />
            </li>
          ))}
      </ul>
      <div className="relative hidden aspect-[4/3] w-full @lg:block overflow-hidden rounded-xl border-4 border-slate-300" style={{ background: style.floor }} aria-label="Plan de l'espace de travail">
        {stations
          .filter((s) => s.kind !== "stats_board")
          .map((s) => {
            return (
              <div key={s.id} className="absolute w-[23%] max-w-[180px] -translate-x-1/2 -translate-y-1/2" style={{ left: pct(s.x, ROOM.width), top: pct(s.z, ROOM.depth) }}>
                <Card s={s} accent={style.accent} onOpen={onOpen} />
              </div>
            );
          })}
      </div>
    </div>
  );
}

function Card({ s, accent, onOpen }: { s: SceneStation; accent: string; onOpen: (target: string) => void }) {
  const Icon = KIND_ICONS[s.kind];
  const badge = stationBadge(s);
  return (
    <button type="button" onClick={() => onOpen(s.target)} className="flex w-full flex-col items-start gap-0.5 rounded-lg border border-white/70 bg-white/90 p-2 text-left shadow-sm transition-transform hover:-translate-y-0.5">
      <span className="flex w-full items-center gap-1.5">
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
        <span className="truncate text-[11px] font-semibold text-slate-900" title={s.label}>{s.label.split(" · ")[0]}</span>
      </span>
      {badge && <span className={`text-[10px] ${badge.tone === "alert" ? "font-medium text-red-600" : badge.tone === "active" ? "text-blue-700" : "text-slate-500"}`}>{badge.text}</span>}
      {s.crew.length > 0 && (
        <span className="flex -space-x-1" aria-label={`Équipe : ${s.crew.map((m) => m.name).join(", ")}`}>
          {s.crew.slice(0, 4).map((m) => (
            <span key={m.id} title={m.name} className="grid h-5 w-5 place-items-center rounded-full border border-white text-[9px] font-bold text-white" style={{ background: ROLE_COLORS[m.role] ?? "#334155" }}>
              {m.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}
