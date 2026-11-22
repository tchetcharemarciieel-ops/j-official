"use client";

import { Download, FileText, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { PAY_METHODS, TX_CATEGORIES, monthRange, monthlySeries, today, type Courier, type Doc, type Order, type PayMethod, type Transaction, type TxCategory, type Vehicle } from "@/lib/transport/model";
import { useCtx } from "../context";
import { Card, DeleteButton, DualBars, Empty, Field, Modal, Pager, Pick, Stat, Tabs, downloadText, fmtD, paginate, toCsv } from "../ui";

/** Finances : recettes (paiements confirmés), dépenses, carburant, entretien, paiements des livreurs, commissions, rapports PDF. */
export function Finances() {
  const c = useCtx();
  const [ym, setYm] = useState(today().slice(0, 7));
  const [tab, setTab] = useState<"journal" | "rapport">("journal");
  const [type, setType] = useState("");
  const [cat, setCat] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Doc<Transaction> | "new" | null>(null);
  const txs = c.data.transaction as Doc<Transaction>[];
  const range = monthRange(ym);
  const canEdit = c.may("finances");
  const inM = useMemo(() => txs.filter((t) => t.data.date >= range.from && t.data.date <= range.to), [txs, range.from, range.to]);
  const sum = (l: Doc<Transaction>[], t: "recette" | "depense") => l.filter((x) => x.data.type === t).reduce((a, x) => a + x.data.amount, 0);
  const rows = useMemo(() => inM.filter((t) => (!type || t.data.type === type) && (!cat || t.data.category === cat)).sort((a, b) => b.data.date.localeCompare(a.data.date) || b.created_at.localeCompare(a.created_at)), [inM, type, cat]);
  const pg = paginate(rows, page, 30);
  const byCat = useMemo(() => { const m = new Map<string, { i: number; o: number }>(); for (const t of inM) { const e = m.get(t.data.category) ?? { i: 0, o: 0 }; if (t.data.type === "recette") e.i += t.data.amount; else e.o += t.data.amount; m.set(t.data.category, e); } return [...m.entries()]; }, [inM]);
  const series = useMemo(() => monthlySeries(txs), [txs]);
  const orders = c.data.order as Doc<Order>[];
  const unpaid = orders.filter((o) => o.data.status !== "annule" && o.data.price - o.data.payments.filter((p) => p.status === "confirme").reduce((a, p) => a + p.amount, 0) > 0);
  if (!canEdit && !c.may("rapports")) return <Empty icon={Wallet} title="Accès réservé" text="Les finances sont visibles par le responsable, le comptable et les administrateurs." />;
  const day = today();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recettes du mois" value={c.fmt(sum(inM, "recette"))} icon={TrendingUp} tone="green" />
        <Stat label="Dépenses du mois" value={c.fmt(sum(inM, "depense"))} icon={TrendingDown} tone="red" />
        <Stat label="Résultat du mois" value={c.fmt(sum(inM, "recette") - sum(inM, "depense"))} icon={Wallet} tone={sum(inM, "recette") < sum(inM, "depense") ? "red" : "blue"} />
        <Stat label="Reste à encaisser" value={c.fmt(unpaid.reduce((a, o) => a + (o.data.price - o.data.payments.filter((p) => p.status === "confirme").reduce((x, p) => x + p.amount, 0)), 0))} hint={`${unpaid.length} commande(s) non soldée(s)`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} items={[["journal", "Journal"], ["rapport", "Rapports"]]} />
        <input className="input !w-auto" type="month" value={ym} onChange={(e) => (setYm(e.target.value || today().slice(0, 7)), setPage(1))} aria-label="Mois" />
        {canEdit && <button className="btn btn-primary ml-auto" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Dépense / écriture</button>}
      </div>
      {tab === "journal" && (
        <>
          <div className="flex flex-wrap gap-2">
            <select className="input !w-auto" value={type} onChange={(e) => (setType(e.target.value), setPage(1))} aria-label="Type"><option value="">Recettes et dépenses</option><option value="recette">Recettes</option><option value="depense">Dépenses</option></select>
            <select className="input !w-auto" value={cat} onChange={(e) => (setCat(e.target.value), setPage(1))} aria-label="Catégorie"><option value="">Toutes catégories</option>{Object.entries(TX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadText(`finances-${ym}.csv`, toCsv([["date", "type", "categorie", "description", "mode", "montant"], ...rows.map((t) => [t.data.date, t.data.type, TX_CATEGORIES[t.data.category], t.data.description, PAY_METHODS[t.data.method], String(t.data.amount)])]))}><Download className="h-4 w-4" /> CSV</button>
          </div>
          {rows.length === 0 ? <Empty icon={Wallet} title="Aucune écriture ce mois-ci" text="Les paiements confirmés des commandes créent automatiquement une recette." /> : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {pg.rows.map((t) => (
                <li key={t.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => canEdit && !t.data.order_id && setEdit(t)}>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.data.description || TX_CATEGORIES[t.data.category]}</span><span className="block text-xs text-slate-500">{fmtD(t.data.date)} · {TX_CATEGORIES[t.data.category]} · {PAY_METHODS[t.data.method]}{t.data.order_id ? " · paiement de commande" : ""}{t.data.courier_id ? ` · ${c.courierName(t.data.courier_id)}` : ""}</span></span>
                  <span className={`text-sm font-semibold ${t.data.type === "recette" ? "text-emerald-700" : "text-red-600"}`}>{t.data.type === "recette" ? "+" : "−"} {c.fmt(t.data.amount)}</span>
                </button></li>
              ))}
            </ul>
          )}
          <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
        </>
      )}
      {tab === "rapport" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Six derniers mois"><DualBars data={series.map((s) => ({ label: s.label, a: s.income, b: s.expense }))} /></Card>
          <Card title={`Rapports PDF`} subtitle="Livraisons, recettes, dépenses et journal de la période.">
            <div className="flex flex-wrap gap-2">
              <a className="btn btn-primary" href={c.docUrl("day", "-", day)} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> Rapport du jour</a>
              <a className="btn btn-ghost" href={c.docUrl("month", "-", ym)} target="_blank" rel="noreferrer"><FileText className="h-4 w-4" /> Rapport de {ym}</a>
            </div>
          </Card>
          <Card title={`Par catégorie — ${ym}`} action={<button className="btn btn-ghost !py-1 text-xs" disabled={!byCat.length} onClick={() => downloadText(`rapport-${ym}.csv`, toCsv([["categorie", "recettes", "depenses"], ...byCat.map(([k, v]) => [TX_CATEGORIES[k as TxCategory] ?? k, String(v.i), String(v.o)])]))}><Download className="h-3.5 w-3.5" /> CSV</button>} className="lg:col-span-2">
            {byCat.length === 0 ? <p className="text-sm text-slate-500">Aucune écriture sur ce mois.</p> : (
              <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th>Catégorie</th><th className="text-right">Recettes</th><th className="text-right">Dépenses</th></tr></thead>
                <tbody>{byCat.map(([k, v]) => <tr key={k} className="border-t border-slate-100"><td className="py-1.5">{TX_CATEGORIES[k as TxCategory] ?? k}</td><td className="text-right text-emerald-700">{v.i ? c.fmt(v.i) : "—"}</td><td className="text-right text-red-600">{v.o ? c.fmt(v.o) : "—"}</td></tr>)}
                  <tr className="border-t-2 border-slate-200 font-semibold"><td className="py-1.5">Total</td><td className="text-right">{c.fmt(sum(inM, "recette"))}</td><td className="text-right">{c.fmt(sum(inM, "depense"))}</td></tr></tbody></table>
            )}
            <p className="mt-2 text-xs text-slate-500">Calculé uniquement sur les écritures enregistrées : aucune estimation.</p>
          </Card>
        </div>
      )}
      {edit && <TxForm tx={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TxForm({ tx, onClose }: { tx: Doc<Transaction> | null; onClose: () => void }) {
  const c = useCtx();
  const d = tx?.data;
  const [f, setF] = useState({ type: d?.type ?? ("depense" as "recette" | "depense"), amount: d ? String(d.amount) : "", category: d?.category ?? ("autre" as TxCategory), date: d?.date ?? today(), description: d?.description ?? "", method: d?.method ?? ("especes" as PayMethod), courier_id: d?.courier_id ?? "", vehicle_id: d?.vehicle_id ?? "" });
  const couriers: [string, string][] = (c.data.courier as Doc<Courier>[]).map((x) => [x.id, x.data.name]);
  const vehicles: [string, string][] = (c.data.vehicle as Doc<Vehicle>[]).map((x) => [x.id, `${x.data.brand} ${x.data.plate}`]);
  return (
    <Modal title={tx ? "Écriture" : "Nouvelle écriture"} onClose={onClose} footer={<>{tx && <DeleteButton confirmText="Supprimer cette écriture ?" onConfirm={async () => (await c.run("transaction.delete", { id: tx.id })) && onClose()} />}<button className="btn btn-primary" disabled={!(Number(f.amount) > 0)} onClick={async () => (await c.run("transaction.save", { id: tx?.id, ...f, amount: Number(f.amount), courier_id: f.courier_id || null, vehicle_id: f.vehicle_id || null })) && onClose()}>Enregistrer</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}><option value="depense">Dépense</option><option value="recette">Recette</option></select></Field>
        <Field label="Montant"><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
        <Field label="Catégorie"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as TxCategory })}>{Object.entries(TX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Mode"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PayMethod })}>{Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Pick label="Livreur (paiement, commission)" value={f.courier_id} onChange={(v) => setF({ ...f, courier_id: v })} options={couriers} empty="Aucun" />
        <Pick label="Véhicule" value={f.vehicle_id} onChange={(v) => setF({ ...f, vehicle_id: v })} options={vehicles} empty="Aucun" />
        <Field label="Description" className="sm:col-span-2"><input className="input" value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
