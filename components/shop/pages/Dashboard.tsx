"use client";

import { AlertTriangle, Boxes, CalendarClock, CircleDollarSign, Package, PackageX, Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { OPEN_ORDER, ORDER_STATUS, dueOf, expiringLots, finance, periodRange, salesSeries, stockState, stockValue, topProducts, totalStock, type Doc, type Expense, type Order, type Period, type Sale } from "@/lib/shop/model";
import { useCtx } from "../context";
import { Badge, Bars, Card, Empty, Stat, Tabs, fcfa, qtyFmt, timeFmt } from "../ui";

/** Tableau de bord : chaque chiffre est calculé sur les fiches de la boutique, rien n'est estimé à l'avance. */
export function Dashboard() {
  const c = useCtx();
  const [period, setPeriod] = useState<Period>("week");
  const sales = c.data.sale as Doc<Sale>[];
  const expenses = c.data.expense as Doc<Expense>[];
  const orders = c.data.order as Doc<Order>[];
  const now = useMemo(() => new Date(), [c.data]);
  const day = finance(sales, expenses, periodRange("today", now));
  const week = finance(sales, expenses, periodRange("week", now));
  const month = finance(sales, expenses, periodRange("month", now));
  const r = periodRange(period, now);
  const cur = finance(sales, expenses, r);
  const series = salesSeries(sales, r, period === "year" ? "month" : "day");
  const top = topProducts(sales, r, 6);
  const rupture = c.products.filter((p) => stockState(p.data) === "rupture");
  const low = c.products.filter((p) => stockState(p.data) === "faible");
  const expiring = c.products.flatMap((p) => expiringLots(p.data, 30, now).map((l) => ({ p, l })));
  const open = orders.filter((o) => OPEN_ORDER.includes(o.data.status));
  const credit = sales.filter((s) => dueOf(s.data) > 0);
  const conflicts = sales.filter((s) => s.data.conflict && s.data.status === "validee");
  const value = c.products.reduce((a, p) => a + stockValue(p.data), 0);
  const empty = sales.length === 0 && c.products.length === 0;

  if (empty)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card title={`Bienvenue dans ${c.settings.name}`} subtitle="Votre boutique est prête. Trois étapes pour commencer :">
          <ol className="space-y-3 text-sm">
            {[
              ["Ajoutez vos produits", "Prix, stock, photos, variantes (tailles, couleurs…).", "products"],
              ["Ouvrez la caisse", "Indiquez le fond de caisse, puis encaissez vos ventes.", "pos"],
              ["Publiez votre boutique en ligne", "Vos clients commandent depuis un lien ou un QR code.", "online"],
            ].map(([t, d, p], i) => (
              <li key={t} className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{i + 1}</span>
                <span className="flex-1">
                  <span className="block font-medium">{t}</span>
                  <span className="text-slate-500">{d}</span>
                </span>
                <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => c.go(p as never)}>Ouvrir</button>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">Les indicateurs apparaîtront dès vos premières ventes : aucun chiffre n'est inventé.</p>
        </Card>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CircleDollarSign} tone="blue" label="Chiffre d'affaires du jour" value={fcfa(day.revenue)} hint={`${day.salesCount} vente(s)`} />
        <Stat icon={TrendingUp} tone="blue" label="Cette semaine" value={fcfa(week.revenue)} hint={`${week.salesCount} vente(s)`} />
        <Stat icon={CircleDollarSign} tone="blue" label="Ce mois-ci" value={fcfa(month.revenue)} hint={`${month.salesCount} vente(s)`} />
        <Stat icon={ShoppingBag} tone={open.length ? "amber" : "slate"} label="Commandes en attente" value={open.length} onClick={c.may("commandes") ? () => c.go("orders") : undefined} />
        {c.s.can.cost && <Stat icon={TrendingUp} tone="green" label="Bénéfice estimé (mois)" value={fcfa(c.s.can.finances ? month.net : month.gross)} hint={c.s.can.finances ? "Marge brute − dépenses" : "Marge brute"} />}
        {c.s.can.finances && <Stat icon={Wallet} label="Dépenses du mois" value={fcfa(month.expenses)} onClick={() => c.go("expenses")} />}
        <Stat icon={Package} label="Produits" value={c.products.length} hint={c.s.can.cost ? `Stock : ${fcfa(value)}` : undefined} onClick={() => c.go("products")} />
        <Stat icon={PackageX} tone={rupture.length ? "red" : low.length ? "amber" : "green"} label="Ruptures / presque épuisés" value={`${rupture.length} / ${low.length}`} onClick={c.may("stock") ? () => c.go("stock") : undefined} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2" title="Ventes" subtitle={`${fcfa(cur.revenue)} ${r.label} · ${cur.salesCount} vente(s)${cur.average ? ` · panier moyen ${fcfa(cur.average)}` : ""}`} action={<Tabs value={period} onChange={setPeriod} items={[["today", "Jour"], ["week", "Semaine"], ["month", "Mois"], ["year", "Année"]]} />}>
          {cur.salesCount ? <Bars data={series.map((b) => ({ label: b.label, value: b.revenue }))} color={c.settings.primary} /> : <p className="py-10 text-center text-sm text-slate-500">Aucune vente {r.label}.</p>}
          {c.s.can.cost && cur.salesCount > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-4">
              <div><dt className="text-xs text-slate-500">Chiffre d'affaires</dt><dd className="font-semibold">{fcfa(cur.revenue)}</dd></div>
              <div><dt className="text-xs text-slate-500">Coût des marchandises</dt><dd className="font-semibold">{fcfa(cur.cogs)}</dd></div>
              <div><dt className="text-xs text-slate-500">Marge brute</dt><dd className="font-semibold">{fcfa(cur.gross)}</dd></div>
              {c.s.can.finances && <div><dt className="text-xs text-slate-500">Bénéfice net estimé</dt><dd className={`font-semibold ${cur.net < 0 ? "text-red-600" : "text-emerald-700"}`}>{fcfa(cur.net)}</dd></div>}
            </dl>
          )}
        </Card>
        <Card title="Alertes importantes">
          <ul className="space-y-2 text-sm">
            {rupture.slice(0, 4).map((p) => <Alert key={p.id} tone="red" icon={PackageX} text={`${p.data.name} : rupture de stock`} />)}
            {low.slice(0, 4).map((p) => <Alert key={p.id} tone="amber" icon={Boxes} text={`${p.data.name} : plus que ${qtyFmt(totalStock(p.data))} ${p.data.unit}`} />)}
            {expiring.slice(0, 3).map(({ p, l }) => <Alert key={l.id} tone="amber" icon={CalendarClock} text={`${p.data.name} : lot ${l.number} périme le ${l.expiry}`} />)}
            {conflicts.slice(0, 3).map((s) => <Alert key={s.id} tone="red" icon={AlertTriangle} text={`Vente ${s.data.number} (hors connexion) : ${s.data.conflict}`} />)}
            {credit.length > 0 && <Alert tone="blue" icon={Receipt} text={`${credit.length} vente(s) à crédit : ${fcfa(credit.reduce((a, s) => a + dueOf(s.data), 0))} à encaisser`} />}
            {open.filter((o) => o.data.reserved_until && Date.parse(o.data.reserved_until) < Date.now()).map((o) => <Alert key={o.id} tone="amber" icon={ShoppingBag} text={`Commande ${o.data.number} : réservation du stock expirée, confirmez-la vite`} />)}
            {!rupture.length && !low.length && !expiring.length && !conflicts.length && !credit.length && <li className="text-slate-500">Aucune alerte pour le moment.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Produits les plus vendus" subtitle={r.label}>
          {top.length ? (
            <ol className="space-y-2 text-sm">
              {top.map((t, i) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="w-5 text-xs text-slate-400">{i + 1}.</span>
                  <span className="flex-1 truncate">{t.name}</span>
                  <span className="text-xs text-slate-500">{qtyFmt(t.qty)}</span>
                  <span className="w-28 text-right font-medium">{fcfa(t.revenue)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-slate-500">Pas encore de vente sur la période.</p>
          )}
        </Card>
        <Card title="Dernières transactions">
          {sales.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {sales.slice(0, 6).map((s) => (
                <li key={s.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.data.number}{s.data.customer_name ? ` · ${s.data.customer_name}` : ""}</span>
                    <span className="text-xs text-slate-500">{timeFmt(s.data.at)} · {c.memberName(s.data.by)}</span>
                  </span>
                  {s.data.status === "annulee" ? <Badge tone="red">Annulée</Badge> : dueOf(s.data) > 0 ? <Badge tone="amber">Crédit</Badge> : null}
                  <span className="font-semibold">{fcfa(s.data.total)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={Receipt} title="Aucune vente" text="Les ventes de la caisse et de la boutique en ligne apparaîtront ici." />
          )}
        </Card>
        <Card title="Dernières commandes">
          {orders.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {orders.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <button className="flex w-full items-center gap-2 py-2 text-left" onClick={() => c.go("orders", o.id)}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{o.data.number} · {o.data.customer.name}</span>
                      <span className="text-xs text-slate-500">{timeFmt(o.data.at)} · {o.data.mode === "livraison" ? "Livraison" : "Retrait"}</span>
                    </span>
                    <Badge tone={OPEN_ORDER.includes(o.data.status) ? "amber" : o.data.status === "annulee" ? "red" : "green"}>{ORDER_STATUS[o.data.status]}</Badge>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon={ShoppingBag} title="Aucune commande en ligne" text="Publiez votre boutique en ligne pour recevoir des commandes." />
          )}
        </Card>
      </div>
    </div>
  );
}

function Alert({ tone, icon: Icon, text }: { tone: "red" | "amber" | "blue"; icon: typeof Boxes; text: string }) {
  const t = { red: "text-red-700 bg-red-50", amber: "text-amber-800 bg-amber-50", blue: "text-blue-800 bg-blue-50" }[tone];
  return (
    <li className={`flex items-start gap-2 rounded-xl px-3 py-2 ${t}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{text}</span>
    </li>
  );
}
