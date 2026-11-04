"use client";

import { BellRing, Check, HandHelping, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEVEL, type Doc, type Order, type Table } from "@/lib/venue/model";
import { ALERT_KIND_LABELS, fmtMinutes, lateness, minutesBetween, seatActive, visionSettings, type Seat, type VisionAlert } from "@/lib/venue/vision";
import type { VenueApi } from "../useVenue";

type Notify = (kind: "success" | "error" | "info", message: string) => void;
export type OpenAlert = { alert: Doc<VisionAlert>; seat: Doc<Seat> | null; table: Doc<Table> | null; waited: number; label: string; minutesText: string };

/** Son court à deux tons, produit par le navigateur (aucun fichier à télécharger). */
function beep(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  for (const [i, f] of [880, 660, 880].entries()) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0 + i * 0.22);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.22 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.22 + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start(t0 + i * 0.22);
    o.stop(t0 + i * 0.22 + 0.21);
  }
}

/**
 * Surveillance des délais de service tant que l'espace du restaurant est ouvert :
 * - vérifie régulièrement les tables en attente (une seule alerte par passage, côté serveur) ;
 * - joue un son une seule fois par nouvelle alerte et par appareil ;
 * - expose les alertes en cours (non résolues).
 */
export function useVisionAlerts(api: VenueApi, enabled: boolean, projectId: string) {
  const s = api.state;
  const vs = visionSettings(s?.data.settings[0]?.data as Parameters<typeof visionSettings>[0]);
  const level = s ? LEVEL[s.role] : 0;
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const played = useRef<Set<string>>(new Set());
  const storeKey = `msvision:played:${projectId}`;

  useEffect(() => {
    try {
      played.current = new Set(JSON.parse(sessionStorage.getItem(storeKey) ?? "[]") as string[]);
    } catch {
      /* stockage indisponible */
    }
  }, [storeKey]);

  // Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur : on l'active au premier toucher.
  const unlock = useCallback(() => {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audio.current ??= new Ctor();
      void audio.current.resume().then(() => setSoundOn(audio.current?.state === "running"));
    } catch {
      /* son indisponible : l'alerte visuelle reste affichée */
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const once = () => unlock();
    window.addEventListener("pointerdown", once, { once: true });
    return () => window.removeEventListener("pointerdown", once);
  }, [enabled, unlock]);
  const test = useCallback(() => {
    unlock();
    if (audio.current) beep(audio.current);
  }, [unlock]);

  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [enabled]);

  const seats = useMemo(() => ((s?.data.vseat ?? []) as Doc<Seat>[]).filter((x) => seatActive(x.data)), [s]);
  // Actualisation plus fréquente tant que des clients sont installés.
  const { setFast } = api;
  useEffect(() => setFast(enabled && seats.length > 0), [enabled, seats.length, setFast]);

  // Vérification des délais : dès qu'un passage dépasse le seuil sans alerte, et au plus toutes les 15 s.
  const orders = (s?.data.order ?? []) as Doc<Order>[];
  const openKeys = new Set(((s?.data.valert ?? []) as Doc<VisionAlert>[]).map((a) => a.data.key));
  // Une vérification est utile si un délai est dépassé sans alerte, ou si une alerte en cours peut être clôturée.
  const due =
    seats.some((x) => lateness(x, orders, vs, new Date(now)).some((l) => !openKeys.has(`${l.kind}:${l.order_id ?? x.id}`))) ||
    ((s?.data.valert ?? []) as Doc<VisionAlert>[]).some((a) => !a.data.resolved_at && !seats.some((x) => x.id === a.data.seat_id && lateness(x, orders, vs, new Date(now)).some((l) => `${l.kind}:${l.order_id ?? x.id}` === (a.data.key ?? `service:${x.id}`))));
  const last = useRef(0);
  const { run } = api;
  useEffect(() => {
    if (!enabled || !due || level < 1 || now - last.current < 15_000) return;
    last.current = now;
    run("vision.tick", {}).catch(() => undefined);
  }, [enabled, due, level, now, run]);

  const open: OpenAlert[] = useMemo(() => {
    if (!s) return [];
    const tables = s.data.table as Doc<Table>[];
    return ((s.data.valert ?? []) as Doc<VisionAlert>[])
      .filter((a) => !a.data.resolved_at)
      .map((alert) => {
        const seat = (s.data.vseat as Doc<Seat>[]).find((x) => x.id === alert.data.seat_id) ?? null;
        const kind = alert.data.kind ?? "service";
        const order = alert.data.order_id ? (s.data.order as Doc<Order>[]).find((o) => o.id === alert.data.order_id) : undefined;
        const from = kind === "preparation" ? order?.created_at : kind === "plat" ? (order?.data.ready_at ?? alert.data.raised_at) : seat?.data.arrived_at;
        const waited = from ? minutesBetween(from, new Date(now)) : 0;
        const what = kind === "preparation" ? "en cuisine" : kind === "plat" ? "depuis que le plat est prêt" : "d'attente";
        return { alert, seat, table: tables.find((t) => t.id === alert.data.table_id) ?? null, waited, label: ALERT_KIND_LABELS[kind], minutesText: `${fmtMinutes(waited)} ${what} (seuil ${alert.data.threshold_min} min)` };
      })
      .filter((x) => !x.seat || seatActive(x.seat.data))
      .sort((a, b) => b.waited - a.waited);
  }, [s, now]);

  // Son : une seule fois par nouvelle alerte non prise en charge.
  useEffect(() => {
    if (!enabled) return;
    const fresh = open.filter((o) => !o.alert.data.ack_at && !played.current.has(o.alert.id));
    if (!fresh.length) return;
    for (const o of fresh) played.current.add(o.alert.id);
    try {
      sessionStorage.setItem(storeKey, JSON.stringify([...played.current].slice(-200)));
    } catch {
      /* rien */
    }
    if (vs.sound && audio.current?.state === "running") beep(audio.current);
  }, [open, enabled, vs.sound, storeKey]);

  return { open, now, vs, soundOn, unlock, test };
}

export type VisionAlerts = ReturnType<typeof useVisionAlerts>;

/** Bandeau des alertes en cours : visible sur tout l'espace du restaurant, au-dessus du plan. */
export function AlertsBanner({ alerts, api, notify, onOpen }: { alerts: VisionAlerts; api: VenueApi; notify: Notify; onOpen?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const s = api.state;
  if (!s || alerts.open.length === 0) return null;
  const can = LEVEL[s.role] >= 1;
  const tables = new Set(alerts.open.map((o) => o.alert.data.table_id)).size;
  const name = (id: string | null) => s.members.find((m) => m.id === id)?.name ?? "l'équipe";
  const act = async (key: string, op: string, input: unknown) => {
    setBusy(key);
    try {
      const r = await api.run(op, input);
      notify("success", r.message);
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Opération impossible.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div role="alert" aria-live="assertive" className="no-print fixed inset-x-2 top-2 z-[70] mx-auto max-w-xl sm:inset-x-auto sm:right-4 sm:top-4 sm:w-[420px]">
      <div className="overflow-hidden rounded-2xl border-2 border-red-500 bg-white shadow-2xl" style={{ animation: "fade-up .25s ease both" }}>
        <div className="flex items-center gap-2 bg-red-600 px-3 py-2 text-white">
          <BellRing className="h-5 w-5 animate-pulse" aria-hidden />
          <p className="flex-1 text-sm font-semibold">{tables === 1 ? "1 table : délai dépassé" : `${tables} tables : délais dépassés`}</p>
          <button type="button" onClick={alerts.soundOn ? undefined : alerts.unlock} className="rounded-lg p-1 hover:bg-white/15" title={alerts.soundOn ? (alerts.vs.sound ? "Son activé" : "Son désactivé dans les paramètres") : "Activer le son sur cet appareil"} aria-label={alerts.soundOn ? "Son activé" : "Activer le son"}>
            {alerts.soundOn && alerts.vs.sound ? <Volume2 className="h-4 w-4" aria-hidden /> : <VolumeX className="h-4 w-4" aria-hidden />}
          </button>
          <button type="button" onClick={() => setCollapsed((c) => !c)} className="rounded-lg px-2 py-0.5 text-xs hover:bg-white/15">{collapsed ? "Afficher" : "Réduire"}</button>
        </div>
        {!collapsed && (
          <ul className="max-h-[45vh] divide-y divide-slate-100 overflow-y-auto">
            {alerts.open.map((o) => (
              <li key={o.alert.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900">Table {o.table?.data.number ?? o.alert.data.table_number} · {o.label}</p>
                  <p className="text-xs text-slate-500">{o.minutesText}{o.alert.data.ack_at ? ` · pris en charge par ${name(o.alert.data.ack_by)}` : ""}</p>
                </div>
                {can && !o.alert.data.ack_at && (
                  <button type="button" disabled={busy !== null} onClick={() => act(`a${o.alert.id}`, "vision.ack", { alert_id: o.alert.id })} className="tab-press inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <HandHelping className="h-3.5 w-3.5" aria-hidden />Je m&apos;en occupe
                  </button>
                )}
                {can && o.seat && (o.alert.data.kind ?? "service") !== "preparation" && (
                  <button type="button" disabled={busy !== null} onClick={() => act(`s${o.alert.id}`, o.alert.data.kind === "plat" && o.alert.data.order_id ? "order.status" : "vision.served", o.alert.data.kind === "plat" && o.alert.data.order_id ? { id: o.alert.data.order_id, to: "servie" } : { seat_id: o.seat!.id })} className="tab-press inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                    <Check className="h-3.5 w-3.5" aria-hidden />Client servi
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!collapsed && onOpen && <button type="button" onClick={onOpen} className="block w-full border-t border-slate-100 px-3 py-2 text-center text-xs font-medium text-blue-700 hover:bg-slate-50">Ouvrir Vision IA</button>}
      </div>
    </div>
  );
}
