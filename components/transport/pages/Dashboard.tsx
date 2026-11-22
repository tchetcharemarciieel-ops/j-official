"use client";

import { AlertTriangle, Bike, CheckCircle2, CircleDollarSign, Clock, Package, Truck, TrendingDown, XCircle } from "lucide-react";
import { useMemo } from "react";
import { ORDER_STATUS, dayStats, monthlySeries, orderLate, today, type Courier, type Doc, type Order, type Transaction, type Vehicle } from "@/lib/transport/model";
import { useCtx } from "../context";
import { Badge, Card, DualBars, Empty, Stat, STATUS_TONE, fmtDT } from "../ui";

/** Tableau de bord : tous les chiffres sont calculés sur les fiches visibles par votre poste ; rien n'est estimé. */
export function Dashboard() {
  const c = useCtx();
  const orders = c.data.order as Doc<Order>[];
  const txs = c.data.transaction as Doc<Transaction>[];
  const couriers = c.data.courier as Doc<Courier>[];
  const vehicles = c.data.vehicle as Doc<Vehicle>[];
  const day = today();
  const st = useMemo(() => dayStats(orders, txs, day), [orders, txs, day]);
  const series = useMemo(() => monthlySeries(txs), [txs]);
  const showFin = c.may(["finances", "rapports"]);
  const late = orders.filter((o) => orderLate(o.data));
  const todayOrders = orders.filter((o) => o.data.at.slice(0, 10) === day).length;
  const freeCouriers = couriers.filter((x) => x.data.status === "actif" && x.data.available).length;
  const freeVehicles = vehicles.filter((v) => v.data.available).length;
  if (!orders.length && !couriers.length && !vehicles.length)
    return (
      <div className="mx-auto max-w-2xl">
        <Card title={`Bienvenue dans ${c.settings.name}`} subtitle="Votre espace est prêt. Pour commencer :">
          <ol className="space-y-3 text-sm">
            {([["Définissez vos tarifs et zones", "Réglages : prix de base, par km, par kg, zones, urgence.", "parametres"], ["Ajoutez vos livreurs et véhicules", "Reliez chaque livreur à son compte pour qu'il voie ses missions sur son téléphone.", "livreurs"], ["Enregistrez une commande", "Un numéro de suivi unique est créé et le client peut suivre son colis.", "commandes"]] as const).map(([t, d, p], i) => (
              <li key={t} className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{i + 1}</span>
                <span className="flex-1"><b>{t}</b><br /><span className="text-slate-600">{d}</span></span>
                {c.may(p === "parametres" ? "parametres" : p === "livreurs" ? "livreurs" : "livraisons") && <button className="btn btn-ghost !py-1 text-xs" onClick={() => c.go(p)}>Ouvrir</button>}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Commandes (total)" value={st.total} hint={`${todayOrders} aujourd'hui`} icon={Package} tone="blue" onClick={() => c.go("commandes")} />
        <Stat label="En attente" value={st.waiting + st.assigned} hint={`${st.waiting} à affecter`} icon={Clock} tone="amber" onClick={() => c.go("commandes")} />
        <Stat label="En cours" value={st.inProgress} icon={Truck} tone="blue" onClick={() => c.go("commandes")} />
        <Stat label="Terminées" value={st.done} icon={CheckCircle2} tone="green" />
        <Stat label="Annulées" value={st.cancelled} icon={XCircle} tone="slate" />
        <Stat label="En retard" value={st.late} icon={AlertTriangle} tone={st.late ? "red" : "slate"} onClick={() => c.go("commandes")} />
        <Stat label="Livreurs disponibles" value={`${freeCouriers}/${couriers.length}`} icon={Bike} tone="green" onClick={() => c.go("livreurs")} />
        <Stat label="Véhicules disponibles" value={`${freeVehicles}/${vehicles.length}`} icon={Truck} tone="green" onClick={() => c.go("vehicules")} />
      </div>
      {showFin && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Recettes du jour" value={c.fmt(st.revenueDay)} icon={CircleDollarSign} tone="green" />
          <Stat label="Dépenses du jour" value={c.fmt(st.expenseDay)} icon={TrendingDown} tone="red" />
          <Stat label="Chiffre d'affaires" value={c.fmt(st.revenue)} hint="Paiements confirmés" icon={CircleDollarSign} tone="blue" />
          <Stat label="Résultat" value={c.fmt(st.revenue - st.expense)} hint="Recettes − dépenses" tone={st.revenue - st.expense < 0 ? "red" : "slate"} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {showFin && <Card title="Recettes et dépenses (6 mois)"><DualBars data={series.map((s) => ({ label: s.label, a: s.income, b: s.expense }))} /></Card>}
        <Card title="Répartition des commandes">
          <ul className="space-y-1.5 text-sm">
            {(Object.keys(ORDER_STATUS) as (keyof typeof ORDER_STATUS)[]).map((k) => {
              const n = orders.filter((o) => o.data.status === k).length;
              return (
                <li key={k} className="flex items-center gap-2">
                  <span className="w-44 truncate text-slate-600">{ORDER_STATUS[k]}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: `${orders.length ? (n / orders.length) * 100 : 0}%` }} /></span>
                  <span className="w-8 text-right font-medium">{n}</span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Livraisons en retard" subtitle="Date estimée dépassée, commande non terminée">
          {late.length === 0 ? <p className="text-sm text-slate-500">Aucune livraison en retard.</p> : (
            <ul className="divide-y divide-slate-100">
              {late.slice(0, 8).map((o) => (
                <li key={o.id}><button className="flex w-full items-center gap-2 py-2 text-left text-sm" onClick={() => c.go("commandes", o.id)}>
                  <span className="flex-1 truncate"><b>{o.data.number}</b> · {o.data.recipient.name}<span className="block text-xs text-slate-500">prévue {fmtDT(o.data.eta)} · {c.courierName(o.data.courier_id)}</span></span>
                  <Badge tone={STATUS_TONE[o.data.status]}>{ORDER_STATUS[o.data.status]}</Badge>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Dernières commandes">
          {orders.length === 0 ? <Empty icon={Package} title="Aucune commande" /> : (
            <ul className="divide-y divide-slate-100">
              {[...orders].sort((a, b) => b.data.at.localeCompare(a.data.at)).slice(0, 6).map((o) => (
                <li key={o.id}><button className="flex w-full items-center gap-2 py-2 text-left text-sm" onClick={() => c.go("commandes", o.id)}>
                  <span className="flex-1 truncate"><b>{o.data.number}</b> · {o.data.recipient.name}<span className="block text-xs text-slate-500">{fmtDT(o.data.at)} · {c.fmt(o.data.price)}</span></span>
                  <Badge tone={STATUS_TONE[o.data.status]}>{ORDER_STATUS[o.data.status]}</Badge>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
