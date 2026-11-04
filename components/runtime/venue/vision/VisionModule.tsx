"use client";

import { BarChart3, BellRing, CalendarDays, Camera, ConciergeBell, Eye, FlaskConical, LayoutGrid, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type Doc, type TableZone, type VenueKind } from "@/lib/venue/model";
import { cameraOnline, type Camera as Cam } from "@/lib/venue/vision";
import type { DataMode } from "../../useAppData";
import { useVenueContext } from "../context";
import { BookingsView } from "../m-space";
import { isMgr, Tabs, useV, VenueCtx } from "../ui";
import type { VenueApi } from "../useVenue";
import { AdminView, AlertsHistory, CamerasView, VisionSettingsView } from "./admin";
import { DemoSimulator, LivePlan, ServiceList, TableSheet, ZonePicker, useLive, useTableZones } from "./plan";
import type { VisionAlerts } from "./useVisionAlerts";

type Tab = "plan" | "service" | "reservations" | "alertes" | "cameras" | "admin" | "parametres";
type Props = { api: VenueApi; kind: VenueKind; mode: DataMode; projectId: string; appName: string; notify: (k: "success" | "error" | "info", m: string) => void; alerts: VisionAlerts; onClose: () => void };

/** « MiniSoft Vision IA — Restaurant » : plan en direct, service, réservations, alertes, caméras et statistiques. */
export function VisionModule({ api, kind, mode, projectId, appName, notify, alerts, onClose }: Props) {
  const noZone = useCallback(() => undefined, []);
  const { ctx, confirmUi } = useVenueContext({ api, mode, projectId, appName, kind, notify, goZone: noZone });
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[role="dialog"][aria-modal]')) onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div ref={panel} tabIndex={-1} role="dialog" aria-label="MiniSoft Vision IA — Restaurant" className="no-print fixed inset-0 z-50 flex flex-col bg-slate-50 outline-none" style={{ animation: "fade-up .25s ease both" }}>
      {ctx ? (
        <VenueCtx.Provider value={ctx}>
          <Body alerts={alerts} onClose={onClose} />
        </VenueCtx.Provider>
      ) : (
        <div className="grid flex-1 place-items-center text-sm text-slate-500">{api.error || "Chargement…"}</div>
      )}
      {confirmUi}
    </div>
  );
}

function Body({ alerts, onClose }: { alerts: VisionAlerts; onClose: () => void }) {
  const { v, level, mode } = useV();
  const [tab, setTab] = useState<Tab>("plan");
  const [selected, setSelected] = useState<string | null>(null);
  const zones = useTableZones();
  const [bookZone, setBookZone] = useState<TableZone>(zones[0]!);
  const { vs, now } = alerts;
  const live = useLive("all", vs, now);
  const sel = live.find((l) => l.table.id === selected) ?? null;
  const cams = (v.data.vcam as Doc<Cam>[]).filter((c) => c.data.active);
  const online = cams.filter((c) => cameraOnline(c.data, now)).length;
  const mgr = isMgr(level);
  const tabs: { id: Tab; label: string; icon: typeof Eye; count?: number }[] = [
    { id: "plan", label: "Plan en direct", icon: LayoutGrid },
    { id: "service", label: "Service", icon: ConciergeBell, count: live.filter((l) => l.seat && !l.seat.data.ended_at).length },
    { id: "reservations", label: "Réservations", icon: CalendarDays },
    { id: "alertes", label: "Alertes", icon: BellRing, count: alerts.open.length },
    { id: "cameras", label: "Caméras", icon: Camera },
    ...(mgr ? [{ id: "admin" as Tab, label: "Administration", icon: BarChart3 }] : []),
    { id: "parametres", label: "Paramètres", icon: Settings2 },
  ];
  const camChip =
    mode !== "live"
      ? { text: "Mode démonstration · aucune caméra réelle", cls: "bg-amber-100 text-amber-900 border-amber-300", icon: FlaskConical }
      : online
        ? { text: `${online} caméra${online > 1 ? "s" : ""} connectée${online > 1 ? "s" : ""}`, cls: "bg-green-50 text-green-800 border-green-300", icon: Camera }
        : { text: "Caméra non connectée · saisie manuelle", cls: "bg-slate-100 text-slate-700 border-slate-300", icon: Camera };
  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: "var(--app-primary)" }}><Eye className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">MiniSoft Vision IA — Restaurant</h2>
          <p className="truncate text-xs text-slate-500">Occupation des tables, commandes et délais de service en direct</p>
        </div>
        <span className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${camChip.cls}`}><camChip.icon className="h-3.5 w-3.5" aria-hidden />{camChip.text}</span>
        <button type="button" onClick={onClose} aria-label="Fermer Vision IA" className="tab-press rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden /></button>
        <div className="w-full sm:hidden"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${camChip.cls}`}><camChip.icon className="h-3.5 w-3.5" aria-hidden />{camChip.text}</span></div>
      </header>
      <nav className="border-b border-slate-200 bg-white px-3 pt-2"><Tabs tabs={tabs} value={tab} onChange={setTab} label="Sections de Vision IA" /></nav>
      <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-5">
        <div className="mx-auto max-w-6xl">
          {tab === "plan" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <div className="space-y-4">
                <LivePlan vs={vs} now={now} selected={selected} onSelect={setSelected} />
                <DemoSimulator vs={vs} now={now} />
              </div>
              <div className="space-y-4">
                {sel ? <TableSheet key={sel.table.id} live={sel} onClose={() => setSelected(null)} /> : <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Touchez une table du plan pour voir son état, sa commande et son temps d&apos;attente.</p>}
                <OpenAlertsList alerts={alerts} onSelect={(id) => setSelected(id)} />
              </div>
            </div>
          )}
          {tab === "service" && (
            <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
              <ServiceList vs={vs} now={now} onSelect={(id) => setSelected(id)} />
              {sel && <TableSheet key={sel.table.id} live={sel} onClose={() => setSelected(null)} />}
            </div>
          )}
          {tab === "reservations" && (
            <div className="space-y-3">
              <ZonePicker zones={zones} value={bookZone} onChange={setBookZone} />
              <BookingsView zone={bookZone} />
              <p className="text-xs text-slate-500">Les tables réservées apparaissent en bleu sur le plan à partir d&apos;une heure avant l&apos;heure de la réservation.</p>
            </div>
          )}
          {tab === "alertes" && (
            <div className="space-y-4">
              <OpenAlertsList alerts={alerts} onSelect={(id) => (setSelected(id), setTab("plan"))} />
              <AlertsHistory />
            </div>
          )}
          {tab === "cameras" && <CamerasView now={now} />}
          {tab === "admin" && mgr && <AdminView vs={vs} now={now} />}
          {tab === "parametres" && <VisionSettingsView vs={vs} onTest={alerts.test} />}
        </div>
      </div>
    </>
  );
}

function OpenAlertsList({ alerts, onSelect }: { alerts: VisionAlerts; onSelect: (tableId: string) => void }) {
  const { name } = useV();
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-3.5" aria-labelledby="va-open">
      <h4 id="va-open" className="mb-2 flex items-center gap-2 text-sm font-semibold"><BellRing className="h-4 w-4 text-red-600" aria-hidden />Alertes d&apos;attente en cours</h4>
      {alerts.open.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun délai dépassé.</p>
      ) : (
        <ul className="space-y-1.5">
          {alerts.open.map((o) => (
            <li key={o.alert.id}>
              <button type="button" onClick={() => o.table && onSelect(o.table.id)} className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-left hover:bg-red-100">
                <span className="block text-sm font-semibold text-red-800">Table {o.table?.data.number ?? o.alert.data.table_number} · {o.label}</span>
                <span className="block text-xs text-red-700">{o.minutesText}{o.alert.data.ack_at ? ` · pris en charge par ${name(o.alert.data.ack_by)}` : ""}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
