"use client";

import { Armchair, Boxes, Briefcase, Car, ConciergeBell, Wrench } from "lucide-react";
import { GARAGE_PARKING, LAYOUT_STYLE, ROOM, type GarageZoneId } from "@/lib/workspace";
import { KIND_ICONS, ROLE_COLORS } from "./kinds";
import { fmtNumber, stationBadge, type GarageAreaView, type GarageSceneProps, type SceneProps, type SceneStation } from "./types";

/** Plan 2D vu de dessus : même contenu et mêmes actions que la 3D, très léger pour les petits téléphones. */
export function Plan2D({ stations, layout, title, kpis, demo, onOpen, garage }: SceneProps) {
  const style = LAYOUT_STYLE[layout];
  if (garage) return <GaragePlan2D garage={garage} accent={style.accent} floor={style.floor} />;
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

const ZONE_ICONS: Record<GarageZoneId, typeof Wrench> = { accueil: ConciergeBell, atelier: Wrench, stock: Boxes, bureau: Briefcase, repos: Armchair };

/** Plan 2D du garage : mêmes zones et mêmes véhicules que la 3D. */
function GaragePlan2D({ garage, accent, floor }: { garage: GarageSceneProps; accent: string; floor: string }) {
  const pct = (v: number, size: number) => `${((v + size / 2) / size) * 100}%`;
  const P = GARAGE_PARKING;
  return (
    <div className="@container flex flex-col gap-3 p-3">
      <ul className="grid grid-cols-2 gap-2 @lg:hidden">
        {garage.areas.map((a) => (
          <li key={a.id}>
            <ZoneCard a={a} selected={garage.selected === a.id} accent={accent} onZone={garage.onZone} />
          </li>
        ))}
      </ul>
      <div className="relative hidden aspect-[4/3] w-full overflow-hidden rounded-xl border-4 border-slate-300 @lg:block" style={{ background: floor }} aria-label="Plan du garage">
        <button type="button" onClick={() => garage.onZone("accueil")} className="absolute flex flex-wrap content-end items-end gap-1 bg-slate-600/90 p-1.5 text-left" style={{ left: pct(P.x - P.w / 2, ROOM.width), top: pct(P.z - P.d / 2, ROOM.depth), width: `${(P.w / ROOM.width) * 100}%`, height: `${(P.d / ROOM.depth) * 100}%` }}>
          <span className="w-full text-[10px] font-medium text-white/80">Parking clients</span>
          {garage.parked.map((v) => <span key={v.id} className={`rounded px-1 font-mono text-[10px] ${v.ready ? "bg-green-600 text-white" : "bg-white text-slate-900"}`}>{v.plate}</span>)}
          {garage.extraParked > 0 && <span className="text-[10px] text-white">+{garage.extraParked}</span>}
        </button>
        {garage.areas.map((a) => (
          <div key={a.id} className="absolute p-1" style={{ left: pct(a.x - a.w / 2, ROOM.width), top: pct(a.z - a.d / 2, ROOM.depth), width: `${(a.w / ROOM.width) * 100}%`, height: `${(a.d / ROOM.depth) * 100}%` }}>
            <ZoneCard a={a} selected={garage.selected === a.id} accent={accent} onZone={garage.onZone} fill>
              {a.id === "atelier" && (garage.bays.length > 0 || garage.extraInWorkshop > 0) && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {garage.bays.map((v) => <span key={v.id} className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-800"><Car className="h-3 w-3" aria-hidden />{v.plate}</span>)}
                  {garage.extraInWorkshop > 0 && <span className="text-[10px] text-slate-600">+{garage.extraInWorkshop}</span>}
                </span>
              )}
            </ZoneCard>
          </div>
        ))}
      </div>
    </div>
  );
}

function ZoneCard({ a, selected, accent, onZone, fill, children }: { a: GarageAreaView; selected: boolean; accent: string; onZone: (z: GarageZoneId) => void; fill?: boolean; children?: React.ReactNode }) {
  const Icon = ZONE_ICONS[a.id];
  return (
    <button
      type="button"
      onClick={() => onZone(a.id)}
      aria-pressed={selected}
      className={`flex w-full flex-col items-start gap-0.5 rounded-lg border-2 p-2 text-left shadow-sm transition-transform hover:-translate-y-0.5 ${fill ? "h-full" : ""} ${selected ? "bg-white" : "border-white/70 bg-white/90"}`}
      style={selected ? { borderColor: accent, boxShadow: `0 0 0 3px ${accent}33` } : undefined}
    >
      <span className="flex w-full items-center gap-1.5">
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} aria-hidden />
        <span className="truncate text-[12px] font-semibold text-slate-900">{a.label}</span>
      </span>
      {a.badge && <span className={`text-[10px] ${a.badge.tone === "alert" ? "font-medium text-red-600" : a.badge.tone === "active" ? "text-blue-700" : "text-slate-500"}`}>{a.badge.text}</span>}
      {children}
    </button>
  );
}
