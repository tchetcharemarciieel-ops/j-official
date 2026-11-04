"use client";

import { CalendarPlus, Camera, Check, ChefHat, Clock, FlaskConical, Hand, LogOut, Move, Pause, Play, Plus, ShoppingBag, Sparkles, UserPlus, Users, VideoOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ORDER_STATUS_LABELS, PAY_STATUS_LABELS, fmtMoney, type Doc, type Order, type Table, type TableZone } from "@/lib/venue/model";
import { ALERT_KIND_LABELS, SEAT_SOURCE_LABELS, TABLE_STATUS_COLORS, TABLE_STATUS_HINTS, TABLE_STATUS_LABELS, TABLE_STATUSES, autoLayout, cameraOnline, countByStatus, fmtMinutes, liveTables, type Camera as Cam, type Seat, type TableLive, type TableStatus, type VisionAlert, type VisionSettings } from "@/lib/venue/vision";
import { BookingsView, TablesView } from "../m-space";
import { OrderComposer } from "../m-sales";
import { Btn, Card, Empty, Field, inp, isMgr, Modal, useIdem, useV } from "../ui";

export const ZONE_LABELS: Record<TableZone, string> = { salle: "Salle", terrasse: "Terrasse", restaurant: "Restaurant" };
export const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");
/** Statuts affichés dans les compteurs (« À nettoyer » apparaît dans la légende). */
const COUNTED: TableStatus[] = ["libre", "occupee", "reservee", "attente", "attente_plat", "plat_pret"];

/** Zones de tables : salle (+ terrasse si déclarée) au restaurant, salle du restaurant à l'hôtel. */
export function useTableZones(): TableZone[] {
  const { kind, settings } = useV();
  return kind === "hotel" ? ["restaurant"] : settings.terrace ? ["salle", "terrasse"] : ["salle"];
}

export function useLive(zone: TableZone | "all", vs: VisionSettings, now: number) {
  const { v } = useV();
  return useMemo(() => {
    const tables = (v.data.table as Doc<Table>[]).filter((t) => zone === "all" || t.data.zone === zone);
    return liveTables(tables, v.data.vseat as Doc<Seat>[], v.data.booking as never, v.data.valert as Doc<VisionAlert>[], vs, new Date(now), v.data.order as Doc<Order>[]);
  }, [v, zone, vs, now]);
}

export function ZonePicker({ zones, value, onChange }: { zones: TableZone[]; value: TableZone; onChange: (z: TableZone) => void }) {
  if (zones.length < 2) return null;
  return (
    <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5" role="group" aria-label="Zone">
      {zones.map((z) => (
        <button key={z} type="button" onClick={() => onChange(z)} aria-pressed={value === z} className={`rounded-lg px-3 py-1.5 text-sm ${value === z ? "font-semibold text-white" : "text-slate-600"}`} style={value === z ? { background: "var(--app-primary)" } : undefined}>
          {ZONE_LABELS[z]}
        </button>
      ))}
    </div>
  );
}

export function StatusCounters({ live }: { live: TableLive[] }) {
  const c = countByStatus(live);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {COUNTED.map((s) => (
        <div key={s} className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2" style={{ borderColor: TABLE_STATUS_COLORS[s].ring }} title={TABLE_STATUS_HINTS[s]}>
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: TABLE_STATUS_COLORS[s].ring }} aria-hidden />
          <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{TABLE_STATUS_LABELS[s]}</span>
          <span className="text-lg font-bold" style={{ color: TABLE_STATUS_COLORS[s].text }}>{c[s]}</span>
        </div>
      ))}
    </div>
  );
}

/** Cône du champ de vision (SVG, coordonnées en % du plan). */
function fovPath(x: number, y: number, angle: number, fov: number, range: number) {
  const a0 = ((angle - fov / 2) * Math.PI) / 180;
  const a1 = ((angle + fov / 2) * Math.PI) / 180;
  const p = (a: number) => `${x + Math.cos(a) * range},${y + Math.sin(a) * range * (4 / 3)}`;
  return `M${x},${y} L${p(a0)} A${range},${range * (4 / 3)} 0 ${fov > 180 ? 1 : 0} 1 ${p(a1)} Z`;
}

/**
 * Plan 2D interactif : tables colorées selon leur statut, chronomètres, caméras et leur champ de
 * vision. Les gérants peuvent glisser les tables et les caméras à leur place.
 */
export function LivePlan({ vs, now, selected, onSelect }: { vs: VisionSettings; now: number; selected: string | null; onSelect: (id: string | null) => void }) {
  const { v, level, act } = useV();
  const zones = useTableZones();
  const [zone, setZone] = useState<TableZone>(zones[0]!);
  useEffect(() => {
    if (!zones.includes(zone)) setZone(zones[0]!);
  }, [zones, zone]);
  const live = useLive(zone, vs, now);
  const cams = (v.data.vcam as Doc<Cam>[]).filter((c) => c.data.active && c.data.zone === zone);
  const [editing, setEditing] = useState(false);
  const [drag, setDrag] = useState<{ kind: "table" | "cam"; id: string; x: number; y: number } | null>(null);
  const [manage, setManage] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pos = useMemo(() => autoLayout(live.map((l) => l.table)), [live]);

  const pointTo = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(97, Math.max(3, ((e.clientX - r.left) / r.width) * 100)), y: Math.min(96, Math.max(4, ((e.clientY - r.top) / r.height) * 100)) };
  };
  const startDrag = (kind: "table" | "cam", id: string) => (e: React.PointerEvent) => {
    if (!editing) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ kind, id, ...pointTo(e) });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ZonePicker zones={zones} value={zone} onChange={setZone} />
        {isMgr(level) && (
          <div className="flex flex-wrap gap-1.5">
            <Btn small kind={editing ? "primary" : "ghost"} onClick={() => setEditing((e) => !e)}><Move className="h-3.5 w-3.5" aria-hidden />{editing ? "Terminer la disposition" : "Disposer tables et caméras"}</Btn>
            <Btn small kind="ghost" onClick={() => setManage(true)}><Plus className="h-3.5 w-3.5" aria-hidden />Tables</Btn>
          </div>
        )}
      </div>
      <StatusCounters live={live} />
      {live.length === 0 ? (
        <Empty text={`Aucune table enregistrée en ${ZONE_LABELS[zone].toLowerCase()}. Ajoutez vos tables avec leur numéro et leur nombre de places pour afficher le plan.`}>
          {isMgr(level) && <Btn small onClick={() => setManage(true)}><Plus className="h-3.5 w-3.5" aria-hidden />Ajouter des tables</Btn>}
        </Empty>
      ) : (
        <div
          ref={box}
          className="relative w-full touch-none select-none overflow-hidden rounded-2xl border border-slate-200"
          style={{ aspectRatio: "4 / 3", backgroundColor: "#f8fafc", backgroundImage: "linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)", backgroundSize: "5% 6.67%" }}
          onPointerMove={(e) => drag && setDrag({ ...drag, ...pointTo(e) })}
          onPointerUp={() => {
            if (!drag) return;
            const d = drag;
            setDrag(null);
            void act(d.kind === "table" ? "vision.place" : "vision.camera.place", d.kind === "table" ? { table_id: d.id, x: d.x, y: d.y } : { id: d.id, x: d.x, y: d.y }, { quiet: true });
          }}
          role="application"
          aria-label={`Plan des tables : ${ZONE_LABELS[zone]}`}
        >
          {/* Champs de vision des caméras (sous les tables). */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {cams.map((c) => {
              const p = drag?.kind === "cam" && drag.id === c.id ? drag : (c.data.pos ?? { x: 8, y: 10 });
              const on = cameraOnline(c.data, now);
              return <path key={c.id} d={fovPath(p.x, p.y, c.data.angle ?? 0, c.data.fov ?? 90, (c.data.range ?? 60) * 0.6)} fill={on ? "rgba(37,99,235,0.12)" : "rgba(100,116,139,0.10)"} stroke={on ? "rgba(37,99,235,0.5)" : "rgba(100,116,139,0.45)"} strokeWidth={0.3} strokeDasharray={on ? undefined : "1.2 1"} vectorEffect="non-scaling-stroke" />;
            })}
          </svg>
          {editing && <p className="absolute left-2 top-2 z-30 rounded-lg bg-white/90 px-2 py-1 text-[11px] text-slate-600 shadow">Faites glisser les tables et les caméras à leur place, puis « Terminer ».</p>}
          {live.map((l) => {
            const p = drag?.kind === "table" && drag.id === l.table.id ? drag : pos.get(l.table.id)!;
            const c = TABLE_STATUS_COLORS[l.status];
            const size = Math.min(19, 9 + l.table.data.seats * 1.1);
            const round = l.table.data.shape === "ronde";
            const wide = l.table.data.shape === "rectangulaire";
            const timer = l.since ?? l.waited;
            return (
              <button
                key={l.table.id}
                type="button"
                onPointerDown={startDrag("table", l.table.id)}
                onClick={() => !editing && onSelect(selected === l.table.id ? null : l.table.id)}
                aria-pressed={selected === l.table.id}
                aria-label={`Table ${l.table.data.number}, ${TABLE_STATUS_LABELS[l.status]}${timer !== null ? `, depuis ${fmtMinutes(timer)}` : ""}`}
                className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center border-[3px] text-center shadow-sm transition-[box-shadow,transform] ${round ? "rounded-full" : "rounded-xl"} ${selected === l.table.id ? "z-20 scale-110 shadow-lg" : "z-10 hover:scale-105"} ${l.late ? "vision-late" : ""}`}
                style={{ left: `${p.x}%`, top: `${p.y}%`, width: `${wide ? size * 1.5 : size}%`, aspectRatio: wide ? "1.5 / 1" : "1 / 1", background: c.fill, borderColor: l.late ? "#dc2626" : c.ring, color: c.text, cursor: editing ? "grab" : "pointer" }}
              >
                <span className="text-sm font-bold leading-none sm:text-base">{l.table.data.number}</span>
                {timer !== null && l.seat && l.status !== "nettoyage" ? (
                  <span className={`mt-0.5 text-[10px] font-semibold leading-none sm:text-xs ${l.late ? "text-red-700" : ""}`}>{fmtMinutes(timer)}</span>
                ) : (
                  <span className="mt-0.5 text-[9px] leading-none opacity-80 sm:text-[10px]">{l.status === "reservee" && l.booking ? l.booking.data.start : l.status === "nettoyage" ? "à nettoyer" : `${l.table.data.seats} pl.`}</span>
                )}
                {l.status === "plat_pret" && <ChefHat className="absolute -left-1 -top-1 h-4 w-4 rounded-full bg-white p-0.5 text-purple-700 shadow" aria-hidden />}
                {l.seat?.data.source === "camera" && <Camera className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-white p-0.5 text-slate-700 shadow" aria-hidden />}
                {l.seat?.data.source === "demo" && <FlaskConical className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-amber-100 p-0.5 text-amber-700 shadow" aria-hidden />}
              </button>
            );
          })}
          {cams.map((c) => {
            const p = drag?.kind === "cam" && drag.id === c.id ? drag : (c.data.pos ?? { x: 8, y: 10 });
            const on = cameraOnline(c.data, now);
            return (
              <div key={c.id} onPointerDown={startDrag("cam", c.id)} className={`absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-full border bg-white py-0.5 pl-1 pr-2 text-[10px] font-medium shadow ${on ? "border-blue-500 text-blue-800" : "border-slate-300 text-slate-500"} ${editing ? "cursor-grab" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }} title={on ? `${c.data.name} : connectée` : `${c.data.name} : caméra non connectée`}>
                {on ? <Camera className="h-3.5 w-3.5" aria-hidden /> : <VideoOff className="h-3.5 w-3.5" aria-hidden />}
                <span className="max-w-[90px] truncate">{on ? c.data.name : "Non connectée"}</span>
              </div>
            );
          })}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Légende">
        {TABLE_STATUSES.map((s) => <li key={s} className="flex items-center gap-1.5" title={TABLE_STATUS_HINTS[s]}><span className="h-3 w-3 rounded border-2" style={{ background: TABLE_STATUS_COLORS[s].fill, borderColor: TABLE_STATUS_COLORS[s].ring }} aria-hidden />{TABLE_STATUS_LABELS[s]}</li>)}
        <li className="flex items-center gap-1.5"><span className="h-3 w-3 rounded border-2 border-red-600 bg-white" aria-hidden />Délai dépassé (clignote)</li>
        <li className="flex items-center gap-1.5"><Camera className="h-3.5 w-3.5" aria-hidden />Caméra et champ de vision</li>
      </ul>
      {manage && (
        <Modal title={`Tables · ${ZONE_LABELS[zone]}`} onClose={() => setManage(false)} wide>
          <TablesView zone={zone} />
        </Modal>
      )}
    </div>
  );
}

const PAY_TONE: Record<string, string> = { non_paye: "bg-slate-100 text-slate-700", partiel: "bg-amber-50 text-amber-800", paye: "bg-green-50 text-green-700", chambre: "bg-blue-50 text-blue-700" };

/** Fiche d'une table : état, commande, temps d'attente, actions (et changement d'état manuel). */
export function TableSheet({ live, onClose }: { live: TableLive; onClose: () => void }) {
  const { level, act, name } = useV();
  const [guests, setGuests] = useState(String(live.booking?.data.guests ?? Math.min(2, live.table.data.seats)));
  const [key, renew] = useIdem();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"book" | "order" | null>(null);
  const t = live.table.data;
  const c = TABLE_STATUS_COLORS[live.status];
  const seat = live.seat;
  const active = seat && !seat.data.ended_at;
  const run = async (op: string, input: unknown, opts?: { confirm?: string }) => {
    setBusy(true);
    const r = await act(op, input, opts);
    setBusy(false);
    if (r) renew();
  };
  const orderStep = async (o: Doc<Order>, to: Order["status"]) => run("order.status", { id: o.id, to });
  return (
    <Card
      className="h-fit"
      title={<span className="flex flex-wrap items-center gap-2">Table {t.number}<span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: c.fill, color: c.text, border: `1px solid ${c.ring}` }}>{TABLE_STATUS_LABELS[live.status]}</span></span>}
      actions={<button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">Fermer</button>}
    >
      <p className="text-xs text-slate-500">{ZONE_LABELS[t.zone]} · {t.seats} place(s){t.location ? ` · ${t.location}` : ""} · {TABLE_STATUS_HINTS[live.status]}</p>

      {active ? (
        <div className="mt-3 space-y-3">
          <div className={`rounded-xl p-3 ${live.late ? "bg-red-50 ring-2 ring-red-500" : "bg-slate-50"}`}>
            <p className="flex items-center gap-1.5 text-2xl font-bold tabular-nums text-slate-900"><Clock className="h-5 w-5 text-slate-500" aria-hidden />{fmtMinutes(live.waited)}</p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <dt className="text-slate-500">Arrivée</dt><dd className="font-medium">{hhmm(seat.data.arrived_at)}</dd>
              <dt className="text-slate-500">Client servi</dt><dd className="font-medium">{seat.data.served_at ? `${hhmm(seat.data.served_at)} (${name(seat.data.served_by)})` : "Pas encore"}</dd>
              <dt className="text-slate-500">Personnes</dt><dd className="font-medium">{seat.data.guests}</dd>
              <dt className="text-slate-500">Occupation</dt><dd className="font-medium">{SEAT_SOURCE_LABELS[seat.data.source]}</dd>
              {live.booking && <><dt className="text-slate-500">Réservation</dt><dd className="font-medium">{live.booking.data.name} ({live.booking.data.start})</dd></>}
            </dl>
            {live.alerts.length > 0 && (
              <ul className="mt-2 space-y-1">
                {live.alerts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2 text-xs font-semibold text-red-700">
                    <span className="flex-1">{ALERT_KIND_LABELS[a.data.kind ?? "service"]} : seuil de {a.data.threshold_min} min dépassé{a.data.ack_at ? ` · pris en charge par ${name(a.data.ack_by)}` : ""}</span>
                    {level >= 1 && !a.data.ack_at && <button type="button" onClick={() => run("vision.ack", { alert_id: a.id })} className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2 py-1 text-red-700 hover:bg-red-50"><Hand className="h-3 w-3" aria-hidden />Je m&apos;en occupe</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <section aria-label="Commandes de la table" className="space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-semibold">Commandes</h5>
              {level >= 1 && <Btn small kind="ghost" onClick={() => setModal("order")}><ShoppingBag className="h-3.5 w-3.5" aria-hidden />Nouvelle commande</Btn>}
            </div>
            {live.orders.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Aucune commande enregistrée pour ces clients.</p>
            ) : (
              <ul className="space-y-1.5">
                {live.orders.map((o) => (
                  <li key={o.id} className="rounded-xl border border-slate-200 p-2.5 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-slate-900">{o.data.number}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{ORDER_STATUS_LABELS[o.data.status]}</span>
                      <span className={`rounded-full px-2 py-0.5 font-medium ${PAY_TONE[o.data.pay_status] ?? ""}`}>{PAY_STATUS_LABELS[o.data.pay_status]}</span>
                      <span className="ml-auto font-semibold">{fmtMoney(o.data.total)}</span>
                    </div>
                    <p className="mt-1 text-slate-500">{o.data.lines.map((l) => `${l.qty} × ${l.label}`).join(", ")} · envoyée à {hhmm(o.created_at)}</p>
                    {level >= 1 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {o.data.status === "prete" && <Btn small onClick={() => orderStep(o, "servie")} className="!bg-green-600 hover:!bg-green-700"><Check className="h-3.5 w-3.5" aria-hidden />Plat servi</Btn>}
                        {(o.data.status === "en_attente" || o.data.status === "en_preparation") && <span className="text-slate-500">La cuisine indiquera quand le plat est prêt.</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[11px] text-slate-500">Le statut des commandes vient de la cuisine et le paiement des encaissements confirmés : la caméra n&apos;en déduit jamais rien.</p>
          </section>

          {level >= 1 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {!seat.data.served_at && <Btn busy={busy} onClick={() => run("vision.served", { seat_id: seat.id })} className="!bg-green-600 hover:!bg-green-700"><Check className="h-4 w-4" aria-hidden />Client servi</Btn>}
              <Btn kind="ghost" busy={busy} onClick={() => run("vision.release", { seat_id: seat.id }, { confirm: seat.data.served_at || live.orders.length ? `Les clients de la table ${t.number} sont partis ?` : `Les clients de la table ${t.number} n'ont été ni servis ni commandé. Libérer quand même la table ?` })}><LogOut className="h-4 w-4" aria-hidden />Clients partis</Btn>
            </div>
          )}
        </div>
      ) : live.status === "nettoyage" && seat ? (
        <div className="mt-3 space-y-2">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Clients partis à {hhmm(seat.data.ended_at)}. Débarrassez et nettoyez la table, puis remettez-la en « Libre ».</p>
          {level >= 1 && <Btn busy={busy} onClick={() => run("vision.clean", { seat_id: seat.id })}><Sparkles className="h-4 w-4" aria-hidden />Table nettoyée : remettre en Libre</Btn>}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {live.booking && <p className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">Réservée à {live.booking.data.start} : {live.booking.data.name}, {live.booking.data.guests} pers. À l&apos;installation, la réservation sera marquée « Clients installés ».</p>}
          {!live.booking && live.next && <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">Prochaine réservation aujourd&apos;hui : {live.next.data.start} ({live.next.data.name}).</p>}
          {level >= 1 && (
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run("vision.seat", { table_id: live.table.id, guests: Number(guests), booking_id: live.booking?.id ?? null, idem: key });
              }}
            >
              <Field label="Personnes" className="w-28"><input type="number" min={1} max={t.seats} className={inp} value={guests} onChange={(e) => setGuests(e.target.value)} required /></Field>
              <Btn type="submit" busy={busy} className="flex-1"><UserPlus className="h-4 w-4" aria-hidden />Marquer « Occupée »</Btn>
            </form>
          )}
          {level >= 1 && <Btn kind="ghost" onClick={() => setModal("book")}><CalendarPlus className="h-4 w-4" aria-hidden />Réserver / voir les réservations</Btn>}
        </div>
      )}
      {modal === "book" && (
        <Modal title={`Réservations · ${ZONE_LABELS[t.zone]}`} onClose={() => setModal(null)} wide>
          <BookingsView zone={t.zone} />
        </Modal>
      )}
      {modal === "order" && (
        <Modal title={`Nouvelle commande · table ${t.number}`} onClose={() => setModal(null)} wide>
          <OrderComposer source={t.zone === "terrasse" ? "terrasse" : t.zone === "restaurant" ? "restaurant" : "salle"} tableZone={t.zone} defaultTable={live.table.id} onCreated={() => setModal(null)} />
        </Modal>
      )}
    </Card>
  );
}

/** Tables occupées, triées par urgence : pratique pour les serveurs sur téléphone. */
export function ServiceList({ vs, now, onSelect }: { vs: VisionSettings; now: number; onSelect: (id: string) => void }) {
  const rank: Partial<Record<TableStatus, number>> = { plat_pret: 0, attente: 1, attente_plat: 2, occupee: 3, nettoyage: 4 };
  const live = useLive("all", vs, now)
    .filter((l) => l.seat)
    .sort((a, b) => Number(b.late) - Number(a.late) || (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || (b.since ?? b.waited ?? 0) - (a.since ?? a.waited ?? 0));
  const { level, act } = useV();
  if (!live.length) return <Empty text="Aucun client installé pour le moment." icon={Users} />;
  return (
    <ul className="space-y-2">
      {live.map((l) => {
        const c = TABLE_STATUS_COLORS[l.status];
        const ready = l.orders.find((o) => o.data.status === "prete");
        return (
          <li key={l.table.id} className={`flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-3 ${l.late ? "border-red-500 ring-2 ring-red-200" : "border-slate-200"}`}>
            <button type="button" onClick={() => onSelect(l.table.id)} className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-[3px] text-base font-bold" style={{ background: c.fill, borderColor: l.late ? "#dc2626" : c.ring, color: c.text }} aria-label={`Ouvrir la table ${l.table.data.number}`}>{l.table.data.number}</button>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{TABLE_STATUS_LABELS[l.status]}{l.status !== "nettoyage" ? ` · ${l.seat!.data.guests} pers.` : ""}</p>
              <p className={`text-sm tabular-nums ${l.late ? "font-semibold text-red-700" : "text-slate-600"}`}>{l.status === "nettoyage" ? `Partis à ${hhmm(l.seat!.data.ended_at)}` : `Arrivés à ${hhmm(l.seat!.data.arrived_at)} · ${fmtMinutes(l.waited)}${l.since !== null && l.since !== l.waited ? ` · ${fmtMinutes(l.since)} dans cet état` : ""}`}</p>
            </div>
            {level >= 1 &&
              (l.status === "nettoyage" ? (
                <Btn small kind="ghost" onClick={() => act("vision.clean", { seat_id: l.seat!.id })}><Sparkles className="h-3.5 w-3.5" aria-hidden />Remettre en Libre</Btn>
              ) : ready ? (
                <Btn small onClick={() => act("order.status", { id: ready.id, to: "servie" })} className="!bg-green-600 hover:!bg-green-700"><Check className="h-3.5 w-3.5" aria-hidden />Plat servi</Btn>
              ) : !l.seat!.data.served_at ? (
                <Btn small onClick={() => act("vision.served", { seat_id: l.seat!.id })} className="!bg-green-600 hover:!bg-green-700"><Check className="h-3.5 w-3.5" aria-hidden />Client servi</Btn>
              ) : (
                <Btn small kind="ghost" onClick={() => act("vision.release", { seat_id: l.seat!.id })}><LogOut className="h-3.5 w-3.5" aria-hidden />Clients partis</Btn>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Simulateur de démonstration : reproduit ce que ferait une caméra (arrivées et départs) pour
 * découvrir le module. Toujours signalé comme simulation ; jamais appliqué aux données réelles.
 */
export function DemoSimulator({ vs, now }: { vs: VisionSettings; now: number }) {
  const { mode, act, level } = useV();
  const live = useLive("all", vs, now);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const liveRef = useRef(live);
  liveRef.current = live;

  const step = async (kind: "arrivee" | "depart" | "hasard") => {
    const l = liveRef.current;
    const free = l.filter((x) => x.status === "libre" || x.status === "reservee");
    const simulated = l.filter((x) => x.seat && !x.seat.data.ended_at && x.seat.data.source === "demo");
    const k = kind === "hasard" ? (simulated.length && (Math.random() < 0.4 || !free.length) ? "depart" : "arrivee") : kind;
    const pick = (k === "arrivee" ? free : simulated)[Math.floor(Math.random() * (k === "arrivee" ? free : simulated).length)];
    if (!pick) return;
    setBusy(true);
    await act("vision.detect", { source: "demo", observations: [{ table_id: pick.table.id, occupied: k === "arrivee", people: 1 + Math.floor(Math.random() * pick.table.data.seats) }], idem: crypto.randomUUID() }, { quiet: kind === "hasard" });
    setBusy(false);
  };
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => void stepRef.current("hasard"), 9000);
    return () => clearInterval(t);
  }, [auto]);

  if (mode === "live")
    return (
      <Card title={<span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-amber-600" aria-hidden />Mode démonstration</span>}>
        <p className="text-sm text-slate-600">La simulation n&apos;est jamais appliquée aux données réelles du restaurant. Pour l&apos;essayer, ouvrez l&apos;aperçu du logiciel (données de démonstration).</p>
      </Card>
    );
  return (
    <section className="rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-3.5" aria-labelledby="vision-demo">
      <h4 id="vision-demo" className="flex items-center gap-2 text-sm font-bold text-amber-900"><FlaskConical className="h-4 w-4" aria-hidden />MODE DÉMONSTRATION · aucune caméra réelle</h4>
      <p className="mt-1 text-xs text-amber-900">Les arrivées et départs ci-dessous sont simulés pour montrer le fonctionnement d&apos;une caméra intelligente. Ils sont marqués « Simulation » et restent dans les données de démonstration. Les commandes et le service se gèrent comme d&apos;habitude.</p>
      {level >= 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Btn small busy={busy} onClick={() => step("arrivee")}><UserPlus className="h-3.5 w-3.5" aria-hidden />Simuler une arrivée</Btn>
          <Btn small kind="ghost" busy={busy} onClick={() => step("depart")}><LogOut className="h-3.5 w-3.5" aria-hidden />Simuler un départ</Btn>
          <Btn small kind={auto ? "danger" : "soft"} onClick={() => setAuto((a) => !a)}>{auto ? <Pause className="h-3.5 w-3.5" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}{auto ? "Arrêter la simulation" : "Simulation automatique"}</Btn>
        </div>
      )}
      <p className="mt-2 text-[11px] text-amber-800">Astuce : réglez des délais courts (1 ou 2 min) dans Paramètres pour voir les alertes se déclencher.</p>
    </section>
  );
}
