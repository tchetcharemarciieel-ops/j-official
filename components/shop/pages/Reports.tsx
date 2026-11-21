"use client";

import { Download, Printer } from "lucide-react";
import { useState } from "react";
import { EXPENSE_CATS, MOVE_TYPES, PAY_METHODS, finance, periodRange, refundOutOf, salesBySeller, salesIn, salesSeries, stockValue, today, topProducts, type Doc, type Expense, type Move, type Period, type Sale } from "@/lib/shop/model";
import { useCtx } from "../context";
import { printHtml } from "../print";
import { Bars, Card, Tabs, downloadText, fcfa, qtyFmt, toCsv } from "../ui";

/** Rapports journaliers, hebdomadaires, mensuels et annuels : chiffre d'affaires, marge brute et bénéfice net séparés. */
export function Reports() {
  const c = useCtx();
  const [period, setPeriod] = useState<Period>("month");
  const [custom, setCustom] = useState({ from: today(new Date(Date.now() - 6 * 86_400_000)), to: today() });
  const r = periodRange(period, new Date(), custom);
  const sales = c.data.sale as Doc<Sale>[];
  const expenses = c.data.expense as Doc<Expense>[];
  const f = finance(sales, expenses, r);
  const list = salesIn(sales, r);
  const top = topProducts(sales, r, 15);
  const sellers = salesBySeller(sales, r);
  const byMethod = Object.entries(PAY_METHODS).map(([k, l]) => ({ k, l, v: list.reduce((a, s) => a + s.data.payments.filter((p) => p.method === k).reduce((b, p) => b + p.amount, 0), 0) })).filter((x) => x.v > 0);
  const refunds = list.reduce((a, s) => a + refundOutOf(s.data), 0);
  const moves = (c.data.move as Doc<Move>[]).filter((m) => Date.parse(m.data.at) >= r.from && Date.parse(m.data.at) <= r.to);
  const moveSum = Object.entries(MOVE_TYPES).map(([k, l]) => ({ k, l, v: moves.filter((m) => m.data.type === k).reduce((a, m) => a + m.data.qty, 0) })).filter((x) => x.v !== 0);
  const exp = (expenses as Doc<Expense>[]).filter((e) => {
    const t = Date.parse(`${e.data.date}T12:00:00`);
    return t >= r.from - 43_200_000 && t <= r.to;
  });
  const expByCat = Object.entries(EXPENSE_CATS).map(([k, l]) => ({ l, v: exp.filter((e) => e.data.category === k).reduce((a, e) => a + e.data.amount, 0) })).filter((x) => x.v > 0);
  const value = c.products.reduce((a, p) => a + stockValue(p.data), 0);
  const series = salesSeries(sales, r, period === "year" ? "month" : "day");
  const title = `Rapport ${r.label} — ${c.settings.name}`;

  const csv = () =>
    downloadText(`rapport-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      [title],
      ["Chiffre d'affaires", f.revenue], ["Nombre de ventes", f.salesCount], ["Articles vendus", f.items],
      ...(c.s.can.cost ? [["Coût des marchandises vendues", f.cogs], ["Marge brute", f.gross]] : []),
      ...(c.s.can.finances ? [["Dépenses", f.expenses], ["Bénéfice net estimé", f.net]] : []),
      [], ["Produit", "Quantité", "Chiffre d'affaires"], ...top.map((t) => [t.name, t.qty, t.revenue]),
      [], ["Vendeur", "Ventes", "Chiffre d'affaires"], ...sellers.map((s) => [c.memberName(s.by), s.count, s.revenue]),
    ]));
  const print = () =>
    printHtml(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:13px system-ui;margin:24px}h1{font-size:20px}table{border-collapse:collapse;width:100%;margin:12px 0}td,th{border-bottom:1px solid #ddd;padding:6px;text-align:left}.r{text-align:right}</style></head><body><h1>${title}</h1>
<table><tr><td>Chiffre d'affaires</td><td class="r">${fcfa(f.revenue)}</td></tr><tr><td>Ventes</td><td class="r">${f.salesCount}</td></tr>${c.s.can.cost ? `<tr><td>Coût des marchandises</td><td class="r">${fcfa(f.cogs)}</td></tr><tr><td>Marge brute</td><td class="r">${fcfa(f.gross)}</td></tr>` : ""}${c.s.can.finances ? `<tr><td>Dépenses</td><td class="r">${fcfa(f.expenses)}</td></tr><tr><td><b>Bénéfice net estimé</b></td><td class="r"><b>${fcfa(f.net)}</b></td></tr>` : ""}</table>
<h2>Produits les plus vendus</h2><table>${top.map((t) => `<tr><td>${t.name}</td><td class="r">${qtyFmt(t.qty)}</td><td class="r">${fcfa(t.revenue)}</td></tr>`).join("")}</table>
<h2>Vendeurs</h2><table>${sellers.map((s) => `<tr><td>${c.memberName(s.by)}</td><td class="r">${s.count} vente(s)</td><td class="r">${fcfa(s.revenue)}</td></tr>`).join("")}</table><p>Généré par MiniSoft Shop le ${new Date().toLocaleString("fr-FR")}.</p></body></html>`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={period} onChange={setPeriod} items={[["today", "Journalier"], ["week", "Hebdomadaire"], ["month", "Mensuel"], ["year", "Annuel"], ["custom", "Dates…"]]} />
        {period === "custom" && (
          <span className="flex items-center gap-1 text-sm">
            <input type="date" className="input !w-auto" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="Du" />
            <input type="date" className="input !w-auto" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="Au" />
          </span>
        )}
        <button className="btn btn-ghost ml-auto" onClick={csv}><Download className="h-4 w-4" /> Excel / CSV</button>
        <button className="btn btn-ghost" onClick={print}><Printer className="h-4 w-4" /> Imprimer / PDF</button>
      </div>
      <Card title={`Résultat ${r.label}`} subtitle="Chiffre d'affaires = ventes validées − retours. Marge brute = chiffre d'affaires − prix d'achat des articles vendus. Bénéfice net estimé = marge brute − dépenses.">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Kv k="Chiffre d'affaires" v={fcfa(f.revenue)} />
          <Kv k="Ventes" v={`${f.salesCount}${f.average ? ` · moy. ${fcfa(f.average)}` : ""}`} />
          <Kv k="Articles vendus" v={qtyFmt(f.items)} />
          {c.s.can.cost && <Kv k="Marge brute" v={fcfa(f.gross)} />}
          {c.s.can.finances && <Kv k="Dépenses" v={fcfa(f.expenses)} />}
          {c.s.can.finances && <Kv k="Bénéfice net estimé" v={fcfa(f.net)} tone={f.net < 0 ? "text-red-600" : "text-emerald-700"} />}
        </dl>
        {f.salesCount > 0 && <div className="mt-4"><Bars data={series.map((b) => ({ label: b.label, value: b.revenue }))} color={c.settings.primary} /></div>}
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Produits les plus vendus">
          {top.length ? <ol className="space-y-1 text-sm">{top.map((t, i) => <li key={t.id} className="flex gap-2"><span className="w-5 text-slate-400">{i + 1}.</span><span className="flex-1 truncate">{t.name}</span><span className="text-slate-500">{qtyFmt(t.qty)}</span><span className="w-28 text-right font-medium">{fcfa(t.revenue)}</span></li>)}</ol> : <p className="text-sm text-slate-500">Aucune vente.</p>}
        </Card>
        <Card title="Performance des vendeurs">
          {sellers.length ? <ul className="space-y-1 text-sm">{sellers.map((s) => <li key={s.by} className="flex gap-2"><span className="flex-1">{c.memberName(s.by)}</span><span className="text-slate-500">{s.count} vente(s)</span><span className="w-28 text-right font-medium">{fcfa(s.revenue)}</span></li>)}</ul> : <p className="text-sm text-slate-500">Aucune vente.</p>}
        </Card>
        <Card title="Encaissements par moyen de paiement">
          {byMethod.length ? <ul className="space-y-1 text-sm">{byMethod.map((m) => <li key={m.k} className="flex justify-between"><span>{m.l}</span><span className="font-medium">{fcfa(m.v)}</span></li>)}{refunds > 0 && <li className="flex justify-between text-amber-700"><span>Remboursements</span><span>− {fcfa(refunds)}</span></li>}</ul> : <p className="text-sm text-slate-500">Aucun encaissement.</p>}
        </Card>
        <Card title="Évolution du stock" subtitle={c.s.can.cost ? `Valeur actuelle : ${fcfa(value)}` : undefined}>
          {moveSum.length ? <ul className="space-y-1 text-sm">{moveSum.map((m) => <li key={m.k} className="flex justify-between"><span>{m.l}</span><span className={m.v > 0 ? "text-emerald-700" : "text-red-600"}>{m.v > 0 ? "+" : ""}{qtyFmt(m.v)}</span></li>)}</ul> : <p className="text-sm text-slate-500">Aucun mouvement sur la période.</p>}
        </Card>
        {c.s.can.finances && (
          <Card title="Dépenses par catégorie">
            {expByCat.length ? <ul className="space-y-1 text-sm">{expByCat.map((e) => <li key={e.l} className="flex justify-between"><span>{e.l}</span><span className="font-medium">{fcfa(e.v)}</span></li>)}</ul> : <p className="text-sm text-slate-500">Aucune dépense.</p>}
          </Card>
        )}
      </div>
    </div>
  );
}

function Kv({ k, v, tone = "" }: { k: string; v: string; tone?: string }) {
  return <div><dt className="text-xs text-slate-500">{k}</dt><dd className={`text-base font-bold ${tone}`}>{v}</dd></div>;
}
