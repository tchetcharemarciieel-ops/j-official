"use client";

import { FileText, Plus, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { FEE_KINDS, PAY_METHODS, TX_CATEGORIES, dueOf, financeStats, monthlySeries, paidOf, studentName, type Doc, type Fee, type Invoice, type Level, type Student, type Transaction, type TxCategory } from "@/lib/ecole/model";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, DualBars, Empty, Field, Modal, Pick, SearchBox, Stat, Tabs, downloadText, fmtD, toCsv, uid } from "../ui";

/** Finances de l'établissement : frais prévus, factures et impayés, paiements avec reçus PDF, dépenses et résultat. */
export function Finances() {
  const c = useCtx();
  const [tab, setTab] = useState<"factures" | "frais" | "ecritures">("factures");
  const invoices = c.data.invoice as Doc<Invoice>[];
  const txs = c.data.transaction as Doc<Transaction>[];
  const st = financeStats(invoices, txs);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Facturé (${c.cur})`} value={c.num(st.billed)} icon={Wallet} />
        <Stat label={`Encaissé (${c.cur})`} value={c.num(st.paid)} tone="green" />
        <Stat label={`Impayés (${c.cur})`} value={c.num(st.due)} hint={`${st.unpaid} facture(s)`} tone={st.due > 0 ? "amber" : "slate"} />
        <Stat label={`Résultat (${c.cur})`} value={c.num(st.result)} hint={`dépenses ${c.num(st.expense)}`} tone={st.result >= 0 ? "blue" : "red"} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[["factures", "Factures et paiements"], ["frais", "Frais de scolarité"], ["ecritures", "Dépenses et recettes"]]} />
      {tab === "factures" && <Invoices />}
      {tab === "frais" && <Fees />}
      {tab === "ecritures" && <Entries />}
    </div>
  );
}

function Invoices() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"impayes" | "tous">("impayes");
  const [pay, setPay] = useState<Doc<Invoice> | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<keyof typeof PAY_METHODS>("especes");
  const students = c.data.student as Doc<Student>[];
  const nameOf = (id: string) => { const s = students.find((x) => x.id === id); return s ? studentName(s.data) : "Élève supprimé"; };
  const rows = useMemo(() => (c.data.invoice as Doc<Invoice>[]).filter((i) => (only === "tous" || dueOf(i.data) > 0) && (!q.trim() || [nameOf(i.data.student_id), i.data.number].some((v) => v.toLowerCase().includes(q.trim().toLowerCase())))).sort((a, b) => dueOf(b.data) - dueOf(a.data)), [c.data.invoice, q, only]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportCsv = () => downloadText("impayes.csv", toCsv([["Facture", "Élève", "Total", "Payé", "Reste"], ...rows.map((i) => [i.data.number, nameOf(i.data.student_id), i.data.total, paidOf(i.data), dueOf(i.data)])]));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2"><div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Élève ou n° de facture…" /></div><Tabs value={only} onChange={setOnly} items={[["impayes", "Impayés"], ["tous", "Toutes"]]} />{rows.length > 0 && <button className="btn btn-ghost" onClick={exportCsv}>Excel (CSV)</button>}</div>
      {rows.length === 0 ? <Empty icon={Wallet} title={only === "impayes" ? "Aucun impayé" : "Aucune facture"} text="Les factures sont créées à l'inscription (frais obligatoires du niveau)." /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.slice(0, 200).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{nameOf(i.data.student_id)}</p><p className="text-xs text-slate-500">{i.data.number} · total {c.fmt(i.data.total)} · payé {c.fmt(paidOf(i.data))}</p></div>
              <Badge tone={dueOf(i.data) > 0 ? "amber" : "green"}>{dueOf(i.data) > 0 ? `Reste ${c.fmt(dueOf(i.data))}` : "Soldée"}</Badge>
              {c.may("finances") && dueOf(i.data) > 0 && <button className="btn btn-primary" onClick={() => { setPay(i); setAmount(String(dueOf(i.data))); }}>Encaisser</button>}
              {i.data.payments.filter((p) => !p.cancelled).slice(-1).map((p) => <a key={p.id} className="text-xs text-blue-700 underline" href={c.docUrl("receipt", i.id, { pid: p.id })} target="_blank" rel="noreferrer"><FileText className="inline h-3 w-3" /> dernier reçu</a>)}
            </li>
          ))}
        </ul>
      )}
      {pay && (
        <Modal title={`Encaisser · ${nameOf(pay.data.student_id)}`} onClose={() => setPay(null)} footer={<button className="btn btn-primary" disabled={!(Number(amount) > 0)} onClick={async () => (await c.run("payment.add", { invoice_id: pay.id, pid: uid(), amount: Number(amount), method })) && setPay(null)}>Enregistrer le paiement</button>}>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={`Montant (reste ${c.fmt(dueOf(pay.data))})`}><input className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field><Field label="Mode"><select className="input" value={method} onChange={(e) => setMethod(e.target.value as keyof typeof PAY_METHODS)}>{Object.entries(PAY_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field></div>
          {pay.data.payments.length > 0 && <ul className="mt-3 space-y-1 text-xs text-slate-600">{pay.data.payments.map((p) => <li key={p.id} className={p.cancelled ? "line-through opacity-60" : ""}>{fmtD(p.date)} · {c.fmt(p.amount)} · {p.receipt}{!p.cancelled && <button className="ml-2 text-red-700 hover:underline" onClick={() => confirm(`Annuler le paiement ${p.receipt} ?`) && void c.run("payment.cancel", { invoice_id: pay.id, pid: p.id })}>Annuler</button>}</li>)}</ul>}
        </Modal>
      )}
    </div>
  );
}

function Fees() {
  const c = useCtx();
  const [edit, setEdit] = useState<Doc<Fee> | "new" | null>(null);
  const levels = c.data.level as Doc<Level>[];
  const fees = c.data.fee as Doc<Fee>[];
  return (
    <Card title="Frais de scolarité" subtitle="Les frais obligatoires sont facturés automatiquement à chaque inscription, selon le niveau de la classe. Modifier un montant ne change pas les factures déjà émises." action={c.may("finances") ? <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Frais</button> : undefined}>
      {fees.length === 0 ? <p className="text-sm text-slate-600">Aucun frais défini. Ajoutez par exemple « Inscription » et « Scolarité ».</p> : (
        <ul className="divide-y divide-slate-100">{fees.map((f) => <li key={f.id}><button className="flex w-full items-center gap-3 py-2 text-left text-sm" onClick={() => c.may("finances") && setEdit(f)}><span className="min-w-0 flex-1"><b>{f.data.name}</b> <span className="text-slate-500">· {FEE_KINDS[f.data.kind]} · {f.data.level_id ? levels.find((l) => l.id === f.data.level_id)?.data.name : "tous les niveaux"}</span></span><span className="font-semibold">{c.fmt(f.data.amount)}</span>{!f.data.mandatory && <Badge>Facultatif</Badge>}</button></li>)}</ul>
      )}
      {edit && <FeeForm f={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </Card>
  );
}

function FeeForm({ f, onClose }: { f: Doc<Fee> | null; onClose: () => void }) {
  const c = useCtx();
  const d = f?.data;
  const [v, setV] = useState({ name: d?.name ?? "", kind: d?.kind ?? ("scolarite" as keyof typeof FEE_KINDS), amount: String(d?.amount ?? ""), level_id: d?.level_id ?? "", mandatory: d?.mandatory ?? true });
  return (
    <Modal title={f ? "Modifier les frais" : "Nouveaux frais"} onClose={onClose} footer={<>
      {f && <DeleteButton confirmText="Supprimer ces frais du barème ?" onConfirm={async () => { if (await c.run("fee.delete", { id: f.id })) onClose(); }} />}
      <button className="btn btn-primary" disabled={!v.name.trim() || !(Number(v.amount) > 0)} onClick={async () => (await c.run("fee.save", { id: f?.id, ...v, amount: Number(v.amount), level_id: v.level_id || null })) && onClose()}>Enregistrer</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom *"><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} autoFocus /></Field>
        <Field label="Type"><select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as keyof typeof FEE_KINDS })}>{Object.entries(FEE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Montant *"><input className="input" type="number" min="1" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} /></Field>
        <Pick label="Niveau concerné" value={v.level_id} onChange={(x) => setV({ ...v, level_id: x })} options={(c.data.level as Doc<Level>[]).map((l) => [l.id, l.data.name])} empty="Tous les niveaux" />
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={v.mandatory} onChange={(e) => setV({ ...v, mandatory: e.target.checked })} /> Obligatoire (facturé à chaque inscription)</label>
      </div>
    </Modal>
  );
}

function Entries() {
  const c = useCtx();
  const [edit, setEdit] = useState<Doc<Transaction> | "new" | null>(null);
  const txs = (c.data.transaction as Doc<Transaction>[]).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const series = monthlySeries(txs);
  return (
    <div className="space-y-3">
      <Card title="6 derniers mois" subtitle="Recettes (paiements encaissés) et dépenses"><DualBars data={series.map((m) => ({ label: m.label, a: m.income, b: m.expense }))} /></Card>
      <div className="flex justify-end"><button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Dépense</button></div>
      {txs.length === 0 ? <Empty icon={Wallet} title="Aucune écriture" text="Les paiements de scolarité apparaissent ici automatiquement ; ajoutez vos dépenses (salaires, fournitures…)." /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {txs.slice(0, 100).map((t) => <li key={t.id}><button className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50" onClick={() => !t.data.invoice_id && setEdit(t)}><span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.data.description || TX_CATEGORIES[t.data.category]}</span><span className="text-xs text-slate-500">{fmtD(t.data.date)} · {TX_CATEGORIES[t.data.category]}</span></span><span className={t.data.type === "recette" ? "font-semibold text-green-700" : "font-semibold text-red-700"}>{t.data.type === "recette" ? "+" : "−"}{c.fmt(t.data.amount)}</span></button></li>)}
        </ul>
      )}
      {edit && <TxForm t={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TxForm({ t, onClose }: { t: Doc<Transaction> | null; onClose: () => void }) {
  const c = useCtx();
  const d = t?.data;
  const [v, setV] = useState({ type: d?.type ?? ("depense" as "recette" | "depense"), amount: String(d?.amount ?? ""), category: d?.category ?? ("fournitures" as TxCategory), date: d?.date ?? new Date().toISOString().slice(0, 10), description: d?.description ?? "", method: d?.method ?? ("especes" as keyof typeof PAY_METHODS) });
  return (
    <Modal title={t ? "Modifier l'écriture" : "Nouvelle écriture"} onClose={onClose} footer={<>
      {t && <DeleteButton confirmText="Supprimer cette écriture ?" onConfirm={async () => { if (await c.run("transaction.delete", { id: t.id })) onClose(); }} />}
      <button className="btn btn-primary" disabled={!(Number(v.amount) > 0)} onClick={async () => (await c.run("transaction.save", { id: t?.id, ...v, amount: Number(v.amount) })) && onClose()}>Enregistrer</button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type"><select className="input" value={v.type} onChange={(e) => setV({ ...v, type: e.target.value as "recette" | "depense" })}><option value="depense">Dépense</option><option value="recette">Recette</option></select></Field>
        <Field label="Montant *"><input className="input" type="number" min="1" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} autoFocus /></Field>
        <Field label="Catégorie"><select className="input" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value as TxCategory })}>{Object.entries(TX_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Date"><input className="input" type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><input className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
