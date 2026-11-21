"use client";

import { Download, ImagePlus, Plus, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import { shrinkImage } from "@/components/runtime/venue/image";
import { EXPENSE_CATS, periodRange, today, type Doc, type Expense, type ExpenseCat, type Period } from "@/lib/shop/model";
import { useCtx } from "../context";
import { Empty, Field, Modal, Tabs, dateFmt, downloadText, fcfa, toCsv } from "../ui";

export function Expenses() {
  const c = useCtx();
  const [period, setPeriod] = useState<Period>("month");
  const [edit, setEdit] = useState<Doc<Expense> | "new" | null>(null);
  const r = periodRange(period);
  const rows = (c.data.expense as Doc<Expense>[]).filter((e) => {
    const t = Date.parse(`${e.data.date}T12:00:00`);
    return t >= r.from - 43_200_000 && t <= r.to;
  }).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const total = rows.reduce((a, e) => a + e.data.amount, 0);
  const byCat = Object.entries(EXPENSE_CATS).map(([k, l]) => ({ k, l, v: rows.filter((e) => e.data.category === k).reduce((a, e) => a + e.data.amount, 0) })).filter((x) => x.v > 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={period} onChange={setPeriod} items={[["today", "Jour"], ["week", "Semaine"], ["month", "Mois"], ["year", "Année"]]} />
        <button className="btn btn-ghost ml-auto" disabled={!rows.length} onClick={() => downloadText("depenses.csv", toCsv([["date", "categorie", "montant", "description", "par"], ...rows.map((e) => [e.data.date, EXPENSE_CATS[e.data.category], e.data.amount, e.data.description, c.memberName(e.data.by)])]))}><Download className="h-4 w-4" /> Exporter</button>
        <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Nouvelle dépense</button>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs text-slate-500">Dépenses {r.label}</p>
        <p className="text-2xl font-bold">{fcfa(total)}</p>
        {byCat.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs">{byCat.map((x) => <span key={x.k} className="rounded-full bg-slate-100 px-3 py-1">{x.l} : {fcfa(x.v)}</span>)}</div>}
      </div>
      {rows.length === 0 ? <Empty icon={Wallet} title={`Aucune dépense ${r.label}`} text="Loyer, transport, électricité, salaires… : elles sont déduites du bénéfice dans les rapports." /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((e) => (
            <li key={e.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setEdit(e)}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{EXPENSE_CATS[e.data.category]}{e.data.description ? ` · ${e.data.description}` : ""}</span>
                  <span className="text-xs text-slate-500">{dateFmt(`${e.data.date}T12:00:00`)} · {c.memberName(e.data.by)}{e.data.photo_id ? " · justificatif" : ""}</span>
                </span>
                <span className="font-semibold">{fcfa(e.data.amount)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {edit && <ExpenseForm expense={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ExpenseForm({ expense, onClose }: { expense: Doc<Expense> | null; onClose: () => void }) {
  const c = useCtx();
  const [f, setF] = useState({ amount: String(expense?.data.amount ?? ""), category: (expense?.data.category ?? "transport") as ExpenseCat, date: expense?.data.date ?? today(), description: expense?.data.description ?? "", photo_id: expense?.data.photo_id ?? null as string | null });
  const [busy, setBusy] = useState(false);
  const photo = async (file: File) => {
    setBusy(true);
    try {
      const data = await shrinkImage(file, 1200, "image/jpeg", 380_000);
      const r = await c.run("photo.add", { data, kind: "receipt" }, { quiet: true });
      if (r?.id) setF((x) => ({ ...x, photo_id: r.id! }));
    } catch (e) {
      c.notify("error", e instanceof Error ? e.message : "Image refusée.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={expense ? "Dépense" : "Nouvelle dépense"} onClose={onClose} footer={
      <>
        {expense && <button className="btn btn-danger mr-auto" onClick={async () => confirm("Supprimer cette dépense ?") && (await c.run("expense.delete", { id: expense.id })) && onClose()}><Trash2 className="h-4 w-4" /> Supprimer</button>}
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={busy || !f.amount} onClick={async () => (await c.run("expense.save", { id: expense?.id, ...f })) && onClose()}>Enregistrer</button>
      </>
    }>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Montant (FCFA)"><input className="input text-lg" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} autoFocus /></Field>
          <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        </div>
        <Field label="Catégorie">
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as ExpenseCat })}>{Object.entries(EXPENSE_CATS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </Field>
        <Field label="Description"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={300} /></Field>
        <div className="flex items-center gap-3">
          {f.photo_id && <a href={c.img(f.photo_id)!} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--brand)] underline">Voir le justificatif</a>}
          <label className="btn btn-ghost cursor-pointer !py-1.5 text-sm"><ImagePlus className="h-4 w-4" /> {f.photo_id ? "Remplacer" : "Ajouter"} un justificatif (facultatif)<input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void photo(e.target.files[0])} /></label>
        </div>
      </div>
    </Modal>
  );
}
