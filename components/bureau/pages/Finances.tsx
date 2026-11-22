"use client";

import { Download, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { PAY_METHODS, TX_CATEGORIES, financeIn, monthRange, monthlySeries, today, type Doc, type PayMethod, type Transaction, type TxCategory } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, DualBars, Empty, Field, Modal, Pager, Pick, Stat, Tabs, downloadText, fmtDate, paginate, toCsv } from "../ui";

/** Finances : recettes et dépenses saisies ou issues des paiements de factures ; rapports mensuels calculés sur les écritures réelles. */
export function Finances() {
  const c = useCtx();
  const [ym, setYm] = useState(today().slice(0, 7));
  const [type, setType] = useState<"" | "recette" | "depense">("");
  const [cat, setCat] = useState("");
  const [tab, setTab] = useState<"journal" | "rapport">("journal");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Doc<Transaction> | "new" | null>(null);
  const txs = c.data.transaction as Doc<Transaction>[];
  const canEdit = c.may("finances");
  const range = monthRange(ym);
  const month = useMemo(() => financeIn(txs, range), [txs, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = useMemo(() => financeIn(txs, { from: "0000-01-01", to: "9999-12-31" }), [txs]);
  const rows = useMemo(() => txs.filter((t) => t.data.date >= range.from && t.data.date <= range.to && (!type || t.data.type === type) && (!cat || t.data.category === cat)).sort((a, b) => b.data.date.localeCompare(a.data.date) || b.created_at.localeCompare(a.created_at)), [txs, range.from, range.to, type, cat]);
  const pg = paginate(rows, page, 30);
  const byCat = useMemo(() => {
    const m = new Map<string, { in: number; out: number }>();
    for (const t of txs.filter((x) => x.data.date >= range.from && x.data.date <= range.to)) {
      const e = m.get(t.data.category) ?? { in: 0, out: 0 };
      if (t.data.type === "recette") e.in += t.data.amount; else e.out += t.data.amount;
      m.set(t.data.category, e);
    }
    return [...m.entries()].sort((a, b) => b[1].in + b[1].out - (a[1].in + a[1].out));
  }, [txs, range.from, range.to]);
  const series = useMemo(() => monthlySeries(txs), [txs]);
  if (!canEdit && !c.may("rapports")) return <Empty icon={Wallet} title="Accès réservé" text="Les finances sont visibles par le directeur, le comptable et les administrateurs." />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recettes du mois" value={c.fmt(month.income)} icon={TrendingUp} tone="green" />
        <Stat label="Dépenses du mois" value={c.fmt(month.expense)} icon={TrendingDown} tone="red" />
        <Stat label="Résultat du mois" value={c.fmt(month.balance)} tone={month.balance < 0 ? "red" : "blue"} icon={Wallet} />
        <Stat label="Solde cumulé" value={c.fmt(total.balance)} hint="Toutes les écritures enregistrées" tone={total.balance < 0 ? "red" : "slate"} icon={Wallet} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} items={[["journal", "Journal"], ["rapport", "Rapport mensuel"]]} />
        <input className="input !w-auto" type="month" value={ym} onChange={(e) => (setYm(e.target.value || today().slice(0, 7)), setPage(1))} aria-label="Mois" />
        {canEdit && <button className="btn btn-primary ml-auto" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Écriture</button>}
      </div>

      {tab === "journal" && (
        <>
          <div className="flex flex-wrap gap-2">
            <select className="input !w-auto" value={type} onChange={(e) => (setType(e.target.value as typeof type), setPage(1))} aria-label="Type"><option value="">Recettes et dépenses</option><option value="recette">Recettes</option><option value="depense">Dépenses</option></select>
            <select className="input !w-auto" value={cat} onChange={(e) => (setCat(e.target.value), setPage(1))} aria-label="Catégorie"><option value="">Toutes catégories</option>{Object.entries(TX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <button className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadText(`finances-${ym}.csv`, toCsv([["date", "type", "categorie", "description", "mode", "montant"], ...rows.map((t) => [t.data.date, t.data.type, TX_CATEGORIES[t.data.category], t.data.description, PAY_METHODS[t.data.method], String(t.data.amount)])]))}><Download className="h-4 w-4" /> Exporter</button>
          </div>
          {rows.length === 0 ? <Empty icon={Wallet} title="Aucune écriture ce mois-ci" text="Les paiements de factures créent automatiquement une recette." /> : (
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {pg.rows.map((t) => (
                <li key={t.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => canEdit && !t.data.invoice_id && setEdit(t)}>
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{t.data.description || TX_CATEGORIES[t.data.category]}</span><span className="block text-xs text-slate-500">{fmtDate(t.data.date)} · {TX_CATEGORIES[t.data.category]} · {PAY_METHODS[t.data.method]}{t.data.invoice_id ? " · paiement de facture" : ""}</span></span>
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
          <Card title={`Détail par catégorie — ${ym}`} action={<button className="btn btn-ghost !py-1 text-xs" disabled={!byCat.length} onClick={() => downloadText(`rapport-${ym}.csv`, toCsv([["categorie", "recettes", "depenses"], ...byCat.map(([k, v]) => [TX_CATEGORIES[k as TxCategory] ?? k, String(v.in), String(v.out)]), ["TOTAL", String(month.income), String(month.expense)]]))}><Download className="h-3.5 w-3.5" /> CSV</button>}>
            {byCat.length === 0 ? <p className="text-sm text-slate-500">Aucune écriture sur ce mois.</p> : (
              <table className="w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th>Catégorie</th><th className="text-right">Recettes</th><th className="text-right">Dépenses</th></tr></thead>
                <tbody>{byCat.map(([k, v]) => <tr key={k} className="border-t border-slate-100"><td className="py-1.5">{TX_CATEGORIES[k as TxCategory] ?? k}</td><td className="text-right text-emerald-700">{v.in ? c.fmt(v.in) : "—"}</td><td className="text-right text-red-600">{v.out ? c.fmt(v.out) : "—"}</td></tr>)}
                  <tr className="border-t-2 border-slate-200 font-semibold"><td className="py-1.5">Total</td><td className="text-right">{c.fmt(month.income)}</td><td className="text-right">{c.fmt(month.expense)}</td></tr></tbody></table>
            )}
            <p className="mt-3 text-xs text-slate-500">Calculé uniquement sur les écritures enregistrées : aucune estimation.</p>
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
  const [f, setF] = useState({ type: d?.type ?? ("depense" as "recette" | "depense"), amount: d ? String(d.amount) : "", category: d?.category ?? ("autre" as TxCategory), date: d?.date ?? today(), description: d?.description ?? "", method: d?.method ?? ("especes" as PayMethod), client_id: d?.client_id ?? "" });
  const clients: [string, string][] = (c.data.client as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
  return (
    <Modal title={tx ? "Écriture" : "Nouvelle écriture"} onClose={onClose} footer={
      <>
        {tx && <DeleteButton confirmText="Supprimer cette écriture ?" onConfirm={async () => (await c.run("transaction.delete", { id: tx.id })) && onClose()} />}
        <button className="btn btn-primary" disabled={!(Number(f.amount) > 0)} onClick={async () => (await c.run("transaction.save", { id: tx?.id, ...f, amount: Number(f.amount), client_id: f.client_id || null })) && onClose()}>Enregistrer</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}><option value="recette">Recette</option><option value="depense">Dépense</option></select></Field>
        <Field label="Montant"><input className="input" type="number" min="0" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
        <Field label="Catégorie"><select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as TxCategory })}>{Object.entries(TX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Mode de paiement"><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PayMethod })}>{Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Pick label="Client" value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} options={clients} empty="Aucun" />
        <Field label="Description" className="sm:col-span-2"><input className="input" value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
