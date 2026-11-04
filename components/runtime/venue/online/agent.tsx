"use client";

import { Bot, Clock, Printer, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { api as fetchApi } from "@/lib/fetcher";
import { periodPreset, type Doc, type Order, type Period, type Table } from "@/lib/venue/model";
import { kitchenReport, reportAdvice, type FullOrder } from "@/lib/venue/online";
import { visionSettings, visionStats, type Seat, type VisionAlert } from "@/lib/venue/vision";
import { Btn, Card, Empty, isMgr, PeriodPicker, PrintDoc, Stat, useV } from "../ui";

const fmt = (m: number | null) => (m === null ? "—" : `${m} min`);

/**
 * Agent restaurant : surveille les commandes en retard, analyse les temps de préparation et
 * produit le rapport du jour, uniquement à partir des événements enregistrés.
 */
export function RestaurantAgent() {
  const { v, level, settings, mode, projectId } = useV();
  const [p, setP] = useState<Period>(() => periodPreset("today"));
  const [ai, setAi] = useState<{ text: string; busy: boolean; error: string }>({ text: "", busy: false, error: "" });
  const [print, setPrint] = useState(false);
  const vs = visionSettings(settings as never);
  const orders = v.data.order as Doc<FullOrder>[];
  const r = useMemo(() => kitchenReport(orders, p, vs.prep_minutes), [orders, p, vs.prep_minutes]);
  const s = useMemo(() => visionStats(v.data.vseat as Doc<Seat>[], v.data.valert as Doc<VisionAlert>[], v.data.table as Doc<Table>[], p, v.data.order as Doc<Order>[]), [v, p]);
  const advice = reportAdvice(r, vs.prep_minutes);
  const maxH = Math.max(1, ...r.byHour);
  const mgr = isMgr(level);

  const Report = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Commandes" value={r.orders} />
        <Stat label="Dont par QR code" value={r.qr} />
        <Stat label="Payées (confirmées)" value={r.paidOrders} tone="green" />
        <Stat label="Annulées" value={r.cancelled} tone={r.cancelled ? "red" : "slate"} />
        <Stat label="Préparation moyenne" value={fmt(r.avgPrep)} tone={r.avgPrep !== null && vs.prep_minutes > 0 && r.avgPrep > vs.prep_minutes ? "red" : "blue"} />
        <Stat label="Préparation la plus longue" value={fmt(r.maxPrep)} />
        <Stat label="Acceptation moyenne" value={fmt(r.avgAccept)} />
        <Stat label="Attente avant 1er service" value={fmt(s.avgWait)} />
      </div>
      <div>
        <h5 className="mb-2 text-xs font-semibold text-slate-600">Commandes par heure</h5>
        <div className="flex h-24 items-end gap-0.5" role="img" aria-label="Commandes par heure">
          {r.byHour.map((n, h) => <div key={h} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-t bg-[var(--app-primary)] opacity-80" style={{ height: `${(n / maxH) * 100}%`, minHeight: n ? 3 : 0 }} title={`${h} h : ${n}`} /><span className="text-[9px] text-slate-400">{h % 3 === 0 ? h : ""}</span></div>)}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <h5 className="mb-1 text-xs font-semibold text-slate-600">Plats les plus commandés</h5>
          {r.topItems.length ? <ul className="space-y-1 text-sm">{r.topItems.map((x) => <li key={x.label} className="flex justify-between"><span>{x.label}</span><span className="font-semibold">{x.qty}</span></li>)}</ul> : <p className="text-sm text-slate-500">—</p>}
        </div>
        <div>
          <h5 className="mb-1 text-xs font-semibold text-slate-600">Problèmes signalés par la cuisine</h5>
          {r.problems.length ? <ul className="space-y-1 text-sm">{r.problems.map((x, i) => <li key={i}><b>{x.number}</b> : {x.text}</li>)}</ul> : <p className="text-sm text-slate-500">Aucun.</p>}
        </div>
      </div>
      <div>
        <h5 className="mb-1 text-xs font-semibold text-slate-600">Recommandations (calculées sur vos chiffres)</h5>
        <ul className="list-disc space-y-1 pl-5 text-sm">{advice.map((a, i) => <li key={i}>{a}</li>)}</ul>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <Card title={<span className="flex items-center gap-2"><Clock className="h-4 w-4 text-red-600" aria-hidden />En retard maintenant</span>}>
        {r.lateNow.length === 0 ? (
          <p className="text-sm text-slate-500">{vs.prep_minutes > 0 ? `Aucune commande au-delà de ${vs.prep_minutes} min de préparation.` : "Seuil de préparation désactivé (Vision IA › Paramètres)."}</p>
        ) : (
          <ul className="space-y-1.5">{r.lateNow.map((o) => <li key={o.id} className="flex justify-between rounded-xl bg-red-50 px-3 py-2 text-sm"><span className="font-semibold text-red-800">{o.number}</span><span className="text-red-700">{o.minutes} min en cuisine</span></li>)}</ul>
        )}
        <p className="mt-2 text-[11px] text-slate-500">La cuisine (écran cuisine) et la caisse (Vision IA) sont alertées automatiquement ; les gérants reçoivent une notification dans les données réelles.</p>
      </Card>
      <Card title={<span className="flex items-center gap-2"><Bot className="h-4 w-4" aria-hidden />Rapport</span>} actions={<><PeriodPicker value={p} onChange={setP} /><Btn small kind="ghost" onClick={() => setPrint(true)}><Printer className="h-3.5 w-3.5" aria-hidden />Imprimer</Btn></>}>
        {r.orders === 0 && s.seatings === 0 ? <Empty text="Aucune commande ni aucun passage sur cette période." /> : Report}
      </Card>
      {mgr && (
        <Card title={<span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" aria-hidden />Analyse par l&apos;IA</span>}>
          <p className="text-sm text-slate-600">L&apos;IA lit uniquement les chiffres ci-dessus (aucun nom de client) et propose des améliorations. Consomme des crédits d&apos;IA.</p>
          {mode === "local" ? (
            <p className="mt-2 text-xs text-amber-700">Disponible avec un compte (aperçu ou logiciel publié).</p>
          ) : (
            <Btn
              className="mt-2"
              busy={ai.busy}
              onClick={async () => {
                setAi({ text: "", busy: true, error: "" });
                try {
                  const res = await fetchApi<{ reply: string }>(`/api/apps/${projectId}/venue/agent`, { body: { mode, from: p.from, to: p.to } });
                  setAi({ text: res.reply, busy: false, error: "" });
                } catch (e) {
                  setAi({ text: "", busy: false, error: e instanceof Error ? e.message : "Analyse impossible." });
                }
              }}
            >
              <Sparkles className="h-4 w-4" aria-hidden />Analyser la période
            </Btn>
          )}
          {ai.error && <p role="alert" className="mt-2 text-sm text-red-600">{ai.error}</p>}
          {ai.text && <div className="mt-3 whitespace-pre-wrap rounded-xl bg-violet-50 p-3 text-sm text-slate-800">{ai.text}</div>}
        </Card>
      )}
      {print && (
        <PrintDoc title={`Rapport du ${p.from}${p.to !== p.from ? ` au ${p.to}` : ""}`} onClose={() => setPrint(false)}>
          <h2 className="mb-3 text-lg font-bold">Rapport du restaurant · {p.from}{p.to !== p.from ? ` → ${p.to}` : ""}</h2>
          {Report}
        </PrintDoc>
      )}
    </div>
  );
}
