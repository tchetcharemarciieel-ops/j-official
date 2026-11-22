"use client";

import { ExternalLink, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { ACTIVE, ORDER_STATUS, VEHICLE_KINDS, type Courier, type Doc, type Order, type Vehicle } from "@/lib/transport/model";
import { useCtx } from "../context";
import { Card, fmtDT, mapsUrl, osmUrl } from "../ui";

type Pt = { id: string; kind: "pickup" | "drop" | "courier"; lat: number; lng: number; label: string; sub: string };
const COLORS = { pickup: "#f59e0b", drop: "#2563eb", courier: "#16a34a" } as const;
const NAMES = { pickup: "Récupération", drop: "Destination", courier: "Livreur (position partagée)" } as const;

/**
 * Carte : plan schématique des points dont on connaît les coordonnées (saisies ou partagées par les
 * livreurs avec leur accord) et fond de carte OpenStreetMap sur le point choisi. Aucune position n'est
 * inventée ni estimée à partir d'une adresse (le géocodage automatique demande un service externe).
 */
export function MapPage() {
  const c = useCtx();
  const [sel, setSel] = useState<string | null>(null);
  const orders = (c.data.order as Doc<Order>[]).filter((o) => ACTIVE.includes(o.data.status));
  const couriers = c.data.courier as Doc<Courier>[];
  const vehicles = c.data.vehicle as Doc<Vehicle>[];
  const { pts, missing } = useMemo(() => {
    const pts: Pt[] = [];
    const missing: Doc<Order>[] = [];
    for (const o of orders) {
      const p = o.data.pickup, d = o.data.dropoff;
      if (p.lat !== null && p.lng !== null) pts.push({ id: `${o.id}:p`, kind: "pickup", lat: p.lat, lng: p.lng, label: `${o.data.number} · récupération`, sub: p.address });
      if (d.lat !== null && d.lng !== null) pts.push({ id: `${o.id}:d`, kind: "drop", lat: d.lat, lng: d.lng, label: `${o.data.number} · livraison`, sub: d.address });
      if (!(p.lat !== null && d.lat !== null)) missing.push(o);
    }
    for (const x of couriers) if (x.data.sharing && x.data.pos) {
      const v = vehicles.find((y) => y.id === x.data.vehicle_id);
      pts.push({ id: `c:${x.id}`, kind: "courier", lat: x.data.pos.lat, lng: x.data.pos.lng, label: x.data.name, sub: `position du ${fmtDT(x.data.pos.at)}${v ? ` · ${VEHICLE_KINDS[v.data.kind]} ${v.data.plate}` : ""}` });
    }
    return { pts, missing };
  }, [orders, couriers, vehicles]);
  const s = pts.find((p) => p.id === sel) ?? pts[0] ?? null;
  const box = useMemo(() => {
    if (!pts.length) return null;
    const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
    const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLo = Math.min(...lngs), maxLo = Math.max(...lngs);
    const dLa = Math.max(maxLa - minLa, 0.01), dLo = Math.max(maxLo - minLo, 0.01);
    return { minLa: minLa - dLa * 0.15, minLo: minLo - dLo * 0.15, dLa: dLa * 1.3, dLo: dLo * 1.3 };
  }, [pts]);
  const xy = (p: Pt) => box ? { x: ((p.lng - box.minLo) / box.dLo) * 100, y: 100 - ((p.lat - box.minLa) / box.dLa) * 100 } : { x: 0, y: 0 };
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-700">Les points apparaissent lorsque les coordonnées sont renseignées sur la commande (« Utiliser ma position ») ou partagées par un livreur avec son accord. Le placement automatique des adresses demande un service de géocodage avec clé (non configuré) : aucune position n&apos;est inventée.</p>
      {pts.length === 0 ? (
        <Card title="Aucun point localisé">
          <p className="text-sm text-slate-600">Aucune commande active n&apos;a de coordonnées et aucun livreur ne partage sa position.</p>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <Card title="Plan des points" subtitle="Schéma proportionnel (nord en haut), sans fond de carte.">
            <svg viewBox="0 0 100 100" className="aspect-square w-full rounded-xl bg-slate-50" role="img" aria-label="Plan des commandes et des livreurs">
              <rect width="100" height="100" fill="none" stroke="#e2e8f0" />
              {[25, 50, 75].map((g) => <g key={g}><line x1={g} x2={g} y1="0" y2="100" stroke="#e2e8f0" strokeWidth="0.3" /><line y1={g} y2={g} x1="0" x2="100" stroke="#e2e8f0" strokeWidth="0.3" /></g>)}
              {pts.map((p) => { const { x, y } = xy(p); const on = s?.id === p.id; return (
                <g key={p.id} onClick={() => setSel(p.id)} className="cursor-pointer" role="button" tabIndex={0} aria-label={p.label} onKeyDown={(e) => e.key === "Enter" && setSel(p.id)}>
                  <circle cx={x} cy={y} r={on ? 3.4 : 2.4} fill={COLORS[p.kind]} stroke="#fff" strokeWidth="0.6" />
                  {on && <text x={x < 30 ? x + 4 : x > 70 ? x - 4 : x} y={y - 4.5} fontSize="3" textAnchor={x < 30 ? "start" : x > 70 ? "end" : "middle"} fill="#0f172a">{p.label.slice(0, 26)}</text>}
                </g>); })}
            </svg>
            <p className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">{(Object.keys(COLORS) as (keyof typeof COLORS)[]).map((k) => <span key={k}><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k] }} />{NAMES[k]}</span>)}</p>
          </Card>
          <Card title={s ? s.label : "Détail"}>
            {s && (
              <div className="space-y-2 text-sm">
                <p className="text-slate-600">{NAMES[s.kind]} — {s.sub}</p>
                <p className="font-mono text-xs">{s.lat.toFixed(5)}, {s.lng.toFixed(5)}</p>
                <iframe title="Fond de carte OpenStreetMap" className="h-56 w-full rounded-xl border border-slate-200" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${s.lng - 0.01},${s.lat - 0.007},${s.lng + 0.01},${s.lat + 0.007}&layer=mapnik&marker=${s.lat},${s.lng}`} />
                <a className="btn btn-ghost" href={osmUrl(s.lat, s.lng)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Ouvrir dans OpenStreetMap</a>
              </div>
            )}
          </Card>
        </div>
      )}
      <Card title={`Commandes sans coordonnées complètes (${missing.length})`} subtitle="Ouvrez l'adresse dans une application de cartes.">
        {missing.length === 0 ? <p className="text-sm text-slate-500">Toutes les commandes actives sont localisées.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">{missing.slice(0, 20).map((o) => <li key={o.id} className="flex flex-wrap items-center gap-2 py-2"><span className="min-w-0 flex-1"><b>{o.data.number}</b> · {ORDER_STATUS[o.data.status]}<span className="block truncate text-xs text-slate-500">{o.data.pickup.address} → {o.data.dropoff.address}</span></span><a className="text-[var(--brand)] underline" href={mapsUrl(o.data.pickup.address)} target="_blank" rel="noreferrer"><MapPin className="mr-0.5 inline h-3 w-3" />Départ</a><a className="text-[var(--brand)] underline" href={mapsUrl(o.data.dropoff.address)} target="_blank" rel="noreferrer"><MapPin className="mr-0.5 inline h-3 w-3" />Arrivée</a></li>)}</ul>
        )}
      </Card>
    </div>
  );
}
