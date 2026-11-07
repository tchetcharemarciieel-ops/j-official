"use client";

import { AlertTriangle, Check, ChefHat, CircleCheck, Clock, Hand, Maximize2, Volume2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Doc, type Order, type Payment, type Staff, type Table, type VenueKind } from "@/lib/venue/model";
import { minutesSince, type FullOrder } from "@/lib/venue/online";
import { canKitchen } from "@/lib/venue/online-ops";
import { visionSettings } from "@/lib/venue/vision";
import type { DataMode } from "../../useAppData";
import { useVenueContext } from "../context";
import { Btn, Field, inp, Modal, useV, VenueCtx } from "../ui";
import type { VenueApi } from "../useVenue";

type Props = { api: VenueApi; kind: VenueKind; mode: DataMode; projectId: string; appName: string; notify: (k: "success" | "error" | "info", m: string) => void; onClose: () => void };
const hhmm = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "—");

function beep() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 988;
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.5);
  } catch {
    /* son indisponible */
  }
}

/** Écran cuisine (KDS) : commandes en temps réel, de « nouvelle » à « prête ». */
export function KdsModule({ api, kind, mode, projectId, appName, notify, onClose }: Props) {
  const noZone = useCallback(() => undefined, []);
  const { ctx, confirmUi } = useVenueContext({ api, mode, projectId, appName, kind, notify, goZone: noZone });
  useEffect(() => {
    api.setFast(true);
    const k = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && !document.querySelector('[role="dialog"][aria-modal]') && onClose();
    window.addEventListener("keydown", k);
    return () => (api.setFast(false), window.removeEventListener("keydown", k));
  }, [api, onClose]);
  return (
    <div role="dialog" aria-label="Écran cuisine" className="no-print fixed inset-0 z-50 flex flex-col bg-slate-900 text-white">
      {ctx ? (
        <VenueCtx.Provider value={ctx}>
          <Board onClose={onClose} />
        </VenueCtx.Provider>
      ) : (
        <div className="grid flex-1 place-items-center text-sm">{api.error || "Chargement…"}</div>
      )}
      {confirmUi}
    </div>
  );
}

type Col = "nouvelles" | "acceptees" | "preparation" | "pretes";
/** Gros boutons faciles à toucher en cuisine, avec un retour visuel immédiat à l'appui. */
const BIG = "!min-h-11 !px-3.5 !py-2.5 !text-sm active:scale-95 transition-transform";
const COLS: { id: Col; label: string; tone: string }[] = [
  { id: "nouvelles", label: "Nouvelles", tone: "border-red-500" },
  { id: "acceptees", label: "Acceptées", tone: "border-amber-400" },
  { id: "preparation", label: "En préparation", tone: "border-orange-500" },
  { id: "pretes", label: "Prêtes", tone: "border-purple-500" },
];

function Board({ onClose }: { onClose: () => void }) {
  const { v, act, settings } = useV();
  const [now, setNow] = useState(Date.now());
  const [problem, setProblem] = useState<Doc<FullOrder> | null>(null);
  const [sound, setSound] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);
  const allowed = canKitchen(v.role, v.me, v.data.staff as Doc<Staff>[]);
  const prep = visionSettings(settings as never).prep_minutes;
  const tables = v.data.table as Doc<Table>[];
  const pays = v.data.payment as Doc<Payment>[];
  const orders = useMemo(() => (v.data.order as Doc<FullOrder>[]).filter((o) => ["en_attente", "en_preparation", "prete"].includes(o.data.status) && o.data.lines.some((l) => l.kitchen)), [v]);
  const visible = orders.filter((o) => !o.data.held).sort((a, b) => (a.data.sent_at ?? a.created_at).localeCompare(b.data.sent_at ?? b.created_at));
  const held = orders.filter((o) => o.data.held).length;
  const realCol = (o: Doc<FullOrder>): Col => (o.data.status === "prete" ? "pretes" : o.data.status === "en_preparation" ? "preparation" : o.data.accepted_at ? "acceptees" : "nouvelles");
  // Boutons fluides : la carte change de colonne tout de suite, l'enregistrement suit en arrière-plan
  // (retour en arrière et message d'erreur si le serveur refuse).
  const [moved, setMoved] = useState<Record<string, Col | "servie">>({});
  const col = (o: Doc<FullOrder>): Col | "servie" => moved[o.id] ?? realCol(o);
  const move = async (o: Doc<FullOrder>, to: Col | "servie", steps: [string, unknown][]) => {
    if (moved[o.id]) return;
    setMoved((m) => ({ ...m, [o.id]: to }));
    navigator.vibrate?.(15);
    let ok = true;
    for (const [i, [op, input]] of steps.entries()) {
      const r = await act(op, input, { quiet: i < steps.length - 1 || to !== "servie" });
      if (!r) {
        ok = false;
        break;
      }
    }
    setMoved((m) => {
      const n = { ...m };
      delete n[o.id];
      return n;
    });
    return ok;
  };

  // Son à l'arrivée d'une nouvelle commande (une fois par commande).
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = new Set(visible.map((o) => o.id));
    if (seen.current && sound && [...ids].some((i) => !seen.current!.has(i))) beep();
    seen.current = ids;
  }, [visible, sound]);

  const payTag = (o: Doc<FullOrder>) => {
    if (o.data.pay_status === "paye") return { text: "Payée", cls: "bg-green-500/20 text-green-200" };
    if (pays.some((p) => p.data.target === "order" && p.data.target_id === o.id && p.data.status === "en_attente")) return { text: "Paiement en attente", cls: "bg-amber-500/20 text-amber-200" };
    return { text: o.data.pay_status === "partiel" ? "Partiellement payée" : "Non payée", cls: "bg-slate-500/30 text-slate-200" };
  };
  const where = (o: Order) => (o.table_id ? `Table ${tables.find((t) => t.id === o.table_id)?.data.number ?? "?"}` : o.stay_id ? "Chambre" : "Comptoir");

  return (
    <>
      <header className="flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-3">
        <ChefHat className="h-6 w-6 text-orange-400" aria-hidden />
        <h2 className="flex-1 text-lg font-bold">Écran cuisine</h2>
        {held > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-xs">{held} commande(s) en attente de paiement (pas encore à préparer)</span>}
        <button type="button" onClick={() => (setSound(true), beep())} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${sound ? "bg-green-600" : "bg-white/10 hover:bg-white/20"}`}><Volume2 className="h-4 w-4" aria-hidden />{sound ? "Son activé" : "Activer le son"}</button>
        <button type="button" onClick={() => document.documentElement.requestFullscreen?.().catch(() => undefined)} className="hidden rounded-lg bg-white/10 p-2 hover:bg-white/20 sm:block" aria-label="Plein écran"><Maximize2 className="h-4 w-4" aria-hidden /></button>
        <button type="button" onClick={onClose} className="rounded-lg bg-white/10 p-2 hover:bg-white/20" aria-label="Fermer l'écran cuisine"><X className="h-5 w-5" aria-hidden /></button>
      </header>
      {!allowed && <p className="bg-amber-500/20 px-4 py-2 text-sm text-amber-100">Consultation seulement : les actions de la cuisine sont réservées aux gérants et au personnel au poste « Cuisinier » (ou « Caisse et accueil »).</p>}
      <div className="grid flex-1 gap-3 overflow-y-auto p-3 sm:grid-cols-2 xl:grid-cols-4">
        {COLS.map((c) => {
          const list = visible.filter((o) => col(o) === c.id);
          return (
            <section key={c.id} className="flex min-h-[200px] flex-col rounded-2xl bg-white/5 p-2" aria-label={c.label}>
              <h3 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold">{c.label}<span className="rounded-full bg-white/10 px-2 text-xs">{list.length}</span></h3>
              <ul className="space-y-2">
                {list.map((o) => {
                  const since = minutesSince(o.data.sent_at ?? o.created_at, new Date(now));
                  const late = prep > 0 && c.id !== "pretes" && since >= prep;
                  const pt = payTag(o);
                  const pending = Boolean(moved[o.id]);
                  return (
                    <li key={o.id} className={`kds-card rounded-xl border-l-4 bg-white p-3 text-slate-900 ${late ? "border-red-600 ring-2 ring-red-500" : c.tone} ${pending ? "opacity-90" : ""}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-extrabold leading-tight">{where(o.data)}</p>
                          <p className="text-xs text-slate-500">{o.data.number} · {hhmm(o.data.sent_at ?? o.created_at)}{o.data.channel === "qr" ? " · QR" : ""}</p>
                        </div>
                        <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${late ? "bg-red-600 text-white" : "bg-slate-100 text-slate-700"}`}><Clock className="h-3 w-3" aria-hidden />{Math.floor(since)} min</span>
                      </div>
                      <ul className="mt-2 space-y-1">
                        {o.data.lines.filter((l) => l.kitchen).map((l) => (
                          <li key={l.id} className="text-base">
                            <b>{l.qty} ×</b> {l.label}
                            {l.options?.length ? <span className="block text-xs text-slate-600">+ {l.options.map((x) => x.name).join(", ")}</span> : null}
                            {l.note && <span className="block text-sm font-semibold text-amber-700">→ {l.note}</span>}
                          </li>
                        ))}
                      </ul>
                      {o.data.note && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-sm font-medium text-amber-800">{o.data.note}</p>}
                      {o.data.problem && <p className="mt-1 rounded-lg bg-red-50 px-2 py-1 text-sm font-medium text-red-700">Problème : {o.data.problem.text}</p>}
                      <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${pt.cls.replace("text-green-200", "text-green-800").replace("text-amber-200", "text-amber-800").replace("text-slate-200", "text-slate-700")}`}>{pt.text}</span>
                      {allowed && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {c.id === "nouvelles" && <Btn small className={BIG} disabled={pending} onClick={() => move(o, "acceptees", [["online.accept", { id: o.id }]])}><Check className="h-4 w-4" aria-hidden />Accepter</Btn>}
                          {(c.id === "nouvelles" || c.id === "acceptees") && <Btn small className={BIG} disabled={pending} kind={c.id === "acceptees" ? "primary" : "soft"} onClick={() => move(o, "preparation", [...(o.data.accepted_at ? [] : [["online.accept", { id: o.id }] as [string, unknown]]), ["order.status", { id: o.id, to: "en_preparation" }]])}><ChefHat className="h-4 w-4" aria-hidden />Commencer</Btn>}
                          {c.id === "preparation" && <Btn small className={BIG} disabled={pending} onClick={() => move(o, "pretes", [["order.status", { id: o.id, to: "prete" }]])}><CircleCheck className="h-4 w-4" aria-hidden />Prête</Btn>}
                          {c.id === "pretes" && <Btn small className={BIG} disabled={pending} kind="soft" onClick={() => move(o, "servie", [["order.status", { id: o.id, to: "servie" }]])}><Hand className="h-4 w-4" aria-hidden />Servie</Btn>}
                          <Btn small className={BIG} disabled={pending} kind="ghost" onClick={() => setProblem(o)}><AlertTriangle className="h-4 w-4" aria-hidden />{o.data.problem ? "Problème" : "Signaler"}</Btn>
                          {pending && <span className="inline-flex items-center gap-1 self-center text-[11px] text-slate-500"><span className="spinner !h-3 !w-3 !border-slate-300 !border-t-slate-600" aria-hidden />Enregistrement…</span>}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {list.length === 0 && <p className="px-1 py-6 text-center text-xs text-white/50">Aucune commande</p>}
            </section>
          );
        })}
      </div>
      {problem && <ProblemForm order={problem} onClose={() => setProblem(null)} />}
    </>
  );
}

function ProblemForm({ order, onClose }: { order: Doc<FullOrder>; onClose: () => void }) {
  const { act } = useV();
  const [text, setText] = useState(order.data.problem?.text ?? "");
  const quick = ["Plat épuisé", "Ingrédient manquant", "Retard en cuisine", "Instruction à préciser"];
  return (
    <Modal title={`Problème · ${order.data.number}`} onClose={onClose}>
      <div className="space-y-3 text-slate-900">
        <div className="flex flex-wrap gap-1.5">{quick.map((q) => <button key={q} type="button" onClick={() => setText(q)} className="rounded-full border border-slate-300 px-3 py-1 text-xs">{q}</button>)}</div>
        <Field label="Message (visible par la caisse et par le client)"><textarea className={inp} rows={3} maxLength={300} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <div className="flex flex-wrap justify-end gap-2">
          {order.data.problem && <Btn kind="ghost" onClick={async () => { if (await act("online.problem", { id: order.id, text: "Problème résolu", clear: true })) onClose(); }}>Marquer résolu</Btn>}
          <Btn kind="ghost" onClick={onClose}>Annuler</Btn>
          <Btn onClick={async () => { if (await act("online.problem", { id: order.id, text })) onClose(); }}>Signaler</Btn>
        </div>
      </div>
    </Modal>
  );
}
