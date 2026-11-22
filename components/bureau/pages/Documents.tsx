"use client";

import { Archive, ArrowRightLeft, Download, FileText, Paperclip, Plus, Receipt, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { CONTRACT_STATUS, DOC_CATEGORIES, INVOICE_STATE_LABELS, INVOICE_STATUS, PAY_METHODS, QUOTE_STATUS, balanceOf, docTotals, invoiceState, paidOf, today, type Contract, type Doc, type DocLine, type Document, type Invoice, type PayMethod, type Quote } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, Empty, Field, Modal, Pick, SearchBox, Tabs, TONES, fmtDate, uid, useFilePick } from "../ui";

type Tab = "devis" | "factures" | "contrats" | "fichiers";

/** Documents et facturation : devis, factures, reçus, contrats, fichiers, archives. */
export function Documents() {
  const c = useCtx();
  const [tab, setTab] = useState<Tab>("factures");
  const [arch, setArch] = useState(false);
  const [q, setQ] = useState("");
  const canDoc = c.may("documents");
  const items: [Tab, string][] = [["factures", "Factures"], ["devis", "Devis"], ["contrats", "Contrats"], ["fichiers", "Fichiers"]];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} items={items} />
        <div className="min-w-[10rem] flex-1"><SearchBox value={q} onChange={setQ} placeholder="Numéro, client, titre…" /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={arch} onChange={(e) => setArch(e.target.checked)} /> Archives</label>
      </div>
      {!canDoc && <p className="rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-600">Lecture seule : votre poste ne permet pas de créer ou modifier des documents.</p>}
      {tab === "factures" && <Invoices q={q} arch={arch} canEdit={canDoc} />}
      {tab === "devis" && <Quotes q={q} arch={arch} canEdit={canDoc} />}
      {tab === "contrats" && <Contracts q={q} arch={arch} canEdit={canDoc} />}
      {tab === "fichiers" && <Files q={q} arch={arch} canEdit={canDoc} />}
    </div>
  );
}

const match = (q: string, ...vals: (string | undefined)[]) => !q.trim() || vals.some((v) => (v ?? "").toLowerCase().includes(q.trim().toLowerCase()));

// ---------- Lignes de devis / facture ----------
function LinesEditor({ items, onChange }: { items: DocLine[]; onChange: (i: DocLine[]) => void }) {
  const upd = (i: number, p: Partial<DocLine>) => onChange(items.map((l, k) => (k === i ? { ...l, ...p } : l)));
  return (
    <div className="space-y-2 sm:col-span-2">
      <span className="label">Lignes</span>
      {items.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_4.5rem_6.5rem_2rem] items-center gap-2">
          <input className="input" placeholder="Description" value={l.desc} maxLength={300} onChange={(e) => upd(i, { desc: e.target.value })} aria-label="Description" />
          <input className="input" type="number" min="0" step="any" value={l.qty} onChange={(e) => upd(i, { qty: Number(e.target.value) })} aria-label="Quantité" />
          <input className="input" type="number" min="0" step="any" value={l.unit_price} onChange={(e) => upd(i, { unit_price: Number(e.target.value) })} aria-label="Prix unitaire" />
          <button type="button" className="text-slate-400 hover:text-red-600 disabled:opacity-30" disabled={items.length < 2} onClick={() => onChange(items.filter((_, k) => k !== i))} aria-label="Retirer la ligne"><Trash2 className="h-4 w-4" /></button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => onChange([...items, { desc: "", qty: 1, unit_price: 0 }])}><Plus className="h-4 w-4" /> Ajouter une ligne</button>
    </div>
  );
}

function DocForm({ kind, doc, onClose }: { kind: "quote" | "invoice"; doc: Doc<Quote> | Doc<Invoice> | null; onClose: () => void }) {
  const c = useCtx();
  const d = doc?.data;
  const [f, setF] = useState({ client_id: d?.client_id ?? "", items: d?.items?.length ? d.items : [{ desc: "", qty: 1, unit_price: 0 }], tax_rate: String(d?.tax_rate ?? c.settings.tax_rate ?? 0), discount: String(d?.discount ?? 0), date: d?.date ?? today(), end: (d && ("valid_until" in d ? d.valid_until : (d as Invoice).due)) ?? "", note: d?.note ?? c.settings.invoice_note ?? "" });
  const t = docTotals(f.items, Number(f.tax_rate) || 0, Number(f.discount) || 0);
  const clients: [string, string][] = (c.data.client as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
  const save = async () => {
    const base = { id: doc?.id, client_id: f.client_id || null, items: f.items, tax_rate: Number(f.tax_rate) || 0, discount: Number(f.discount) || 0, note: f.note, date: f.date || undefined };
    const r = await c.run(kind === "quote" ? "quote.save" : "invoice.save", kind === "quote" ? { ...base, valid_until: f.end || null } : { ...base, due: f.end || null });
    if (r) onClose();
  };
  return (
    <Modal wide title={`${doc ? "Modifier" : "Nouveau"} ${kind === "quote" ? "devis" : "facture"}`} onClose={onClose} footer={<button className="btn btn-primary" onClick={save}>Enregistrer</button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Pick label="Client" value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} options={clients} empty="Sans client" />
        <Field label="Date"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={kind === "quote" ? "Valable jusqu'au" : "Échéance"}><input className="input" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="TVA (%)"><input className="input" type="number" min="0" max="100" step="any" value={f.tax_rate} onChange={(e) => setF({ ...f, tax_rate: e.target.value })} /></Field>
          <Field label="Remise"><input className="input" type="number" min="0" step="any" value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} /></Field>
        </div>
        <LinesEditor items={f.items} onChange={(items) => setF({ ...f, items })} />
        <p className="text-right text-sm sm:col-span-2">Sous-total {c.fmt(t.subtotal)}{t.tax ? ` · TVA ${c.fmt(t.tax)}` : ""} · <b>Total {c.fmt(t.total)}</b></p>
        <Field label="Note affichée sur le document" className="sm:col-span-2"><textarea className="input" rows={2} maxLength={600} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ---------- Factures ----------
function Invoices({ q, arch, canEdit }: { q: string; arch: boolean; canEdit: boolean }) {
  const c = useCtx();
  const [edit, setEdit] = useState<Doc<Invoice> | "new" | null>(null);
  const [view, setView] = useState<string | null>(c.focus);
  const rows = useMemo(() => (c.data.invoice as Doc<Invoice>[]).filter((i) => i.data.archived === arch && match(q, i.data.number, c.clientName(i.data.client_id))).sort((a, b) => b.data.number.localeCompare(a.data.number)), [c.data.invoice, arch, q, c]);
  const sel = (c.data.invoice as Doc<Invoice>[]).find((i) => i.id === view);
  const due = rows.reduce((a, i) => a + balanceOf(i.data), 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-slate-600">{rows.length} facture(s) · reste à encaisser <b>{c.fmt(due)}</b></p>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Facture</button>}
      </div>
      {rows.length === 0 ? <Empty icon={FileText} title="Aucune facture" text={arch ? "Rien dans les archives." : "Créez une facture ou convertissez un devis accepté."} /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((i) => {
            const st = invoiceState(i.data);
            return (
              <li key={i.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setView(i.id)}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{i.data.number} · {c.clientName(i.data.client_id)}</span><span className="block text-xs text-slate-500">{fmtDate(i.data.date)}{i.data.due ? ` · échéance ${fmtDate(i.data.due)}` : ""}</span></span>
                <span className="text-right"><span className="block text-sm font-semibold">{c.fmt(i.data.total)}</span><Badge tone={TONES[st] ?? "slate"}>{INVOICE_STATE_LABELS[st]}</Badge></span>
              </button></li>
            );
          })}
        </ul>
      )}
      {edit && <DocForm kind="invoice" doc={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {sel && <InvoiceView inv={sel} canEdit={canEdit} onClose={() => setView(null)} onEdit={() => (setView(null), setEdit(sel))} />}
    </div>
  );
}

function InvoiceView({ inv, canEdit, onClose, onEdit }: { inv: Doc<Invoice>; canEdit: boolean; onClose: () => void; onEdit: () => void }) {
  const c = useCtx();
  const d = inv.data;
  const st = invoiceState(d);
  const canPay = c.may("finances") && d.status !== "brouillon" && d.status !== "annulee";
  const [pay, setPay] = useState({ amount: String(balanceOf(d) || ""), method: "especes" as PayMethod, date: today(), ref: "" });
  const t = docTotals(d.items, d.tax_rate, d.discount);
  return (
    <Modal wide title={`Facture ${d.number}`} onClose={onClose} footer={
      <>
        <a className="btn btn-ghost" href={c.docUrl("invoice", inv.id)} target="_blank" rel="noreferrer"><Download className="h-4 w-4" /> PDF</a>
        {canEdit && d.status === "brouillon" && <><DeleteButton confirmText="Supprimer cette facture brouillon ?" onConfirm={async () => (await c.run("invoice.delete", { id: inv.id })) && onClose()} /><button className="btn btn-ghost" onClick={onEdit}>Modifier</button><button className="btn btn-primary" onClick={async () => (await c.run("invoice.status", { id: inv.id, status: "envoyee" })) && onClose()}>Marquer envoyée</button></>}
        {canEdit && d.status === "envoyee" && !d.payments.length && c.s.can.manager && <button className="btn btn-ghost" onClick={async () => { const reason = window.prompt("Motif de l'annulation ?"); if (reason?.trim()) (await c.run("invoice.status", { id: inv.id, status: "annulee", reason })) && onClose(); }}>Annuler la facture</button>}
        {canEdit && <button className="btn btn-ghost" onClick={async () => (await c.run("invoice.archive", { id: inv.id, archived: !d.archived })) && onClose()}><Archive className="h-4 w-4" /> {d.archived ? "Désarchiver" : "Archiver"}</button>}
      </>
    }>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2"><Badge tone={TONES[st] ?? "slate"}>{INVOICE_STATE_LABELS[st]}</Badge><span className="text-slate-500">{c.clientName(d.client_id)} · {fmtDate(d.date)}{d.due ? ` · échéance ${fmtDate(d.due)}` : ""}</span></div>
        <table className="w-full text-left"><thead className="text-xs text-slate-500"><tr><th className="py-1">Description</th><th className="text-right">Qté</th><th className="text-right">Prix</th><th className="text-right">Montant</th></tr></thead>
          <tbody>{d.items.map((l, i) => <tr key={i} className="border-t border-slate-100"><td className="py-1.5">{l.desc}</td><td className="text-right">{l.qty}</td><td className="text-right">{c.fmt(l.unit_price)}</td><td className="text-right">{c.fmt(l.qty * l.unit_price)}</td></tr>)}</tbody></table>
        <div className="text-right"><p>Sous-total {c.fmt(t.subtotal)}{d.discount ? ` · remise ${c.fmt(d.discount)}` : ""}{t.tax ? ` · TVA ${c.fmt(t.tax)}` : ""}</p><p className="text-base font-semibold">Total {c.fmt(d.total)}</p><p>Payé {c.fmt(paidOf(d))} · Reste <b>{c.fmt(balanceOf(d))}</b></p></div>
        <Card title="Paiements">
          {d.payments.length === 0 ? <p className="text-slate-500">Aucun paiement enregistré.</p> : (
            <ul className="divide-y divide-slate-100">{d.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="flex-1">{fmtDate(p.date)} · {PAY_METHODS[p.method]}{p.ref ? ` · ${p.ref}` : ""} · <b>{c.fmt(p.amount)}</b> <span className="text-xs text-slate-500">{p.receipt}</span></span>
                <a className="btn btn-ghost !py-1 text-xs" href={c.docUrl("receipt", inv.id, p.id)} target="_blank" rel="noreferrer"><Receipt className="h-3.5 w-3.5" /> Reçu</a>
                {c.s.can.manager && <button className="text-xs text-red-600 hover:underline" onClick={async () => { const reason = window.prompt("Motif de l'annulation du paiement ?"); if (reason?.trim()) await c.run("invoice.payment_cancel", { invoice_id: inv.id, pid: p.id, reason }); }}>Annuler</button>}
              </li>))}</ul>
          )}
          {canPay && balanceOf(d) > 0 && (
            <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-4">
              <Field label="Montant"><input className="input" type="number" min="0" step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
              <Field label="Mode"><select className="input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value as PayMethod })}>{Object.entries(PAY_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="Date"><input className="input" type="date" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} /></Field>
              <Field label="Référence"><input className="input" value={pay.ref} maxLength={80} onChange={(e) => setPay({ ...pay, ref: e.target.value })} /></Field>
              <button className="btn btn-primary sm:col-span-4" disabled={!(Number(pay.amount) > 0)} onClick={async () => { if (await c.run("invoice.payment", { invoice_id: inv.id, pid: uid(), amount: Number(pay.amount), method: pay.method, date: pay.date, ref: pay.ref })) setPay({ ...pay, amount: "", ref: "" }); }}>Enregistrer le paiement (génère un reçu et une recette)</button>
            </div>
          )}
          {d.status === "brouillon" && <p className="mt-2 text-xs text-slate-500">Marquez la facture comme envoyée pour enregistrer des paiements.</p>}
        </Card>
        {d.note && <p className="text-slate-600">{d.note}</p>}
      </div>
    </Modal>
  );
}

// ---------- Devis ----------
function Quotes({ q, arch, canEdit }: { q: string; arch: boolean; canEdit: boolean }) {
  const c = useCtx();
  const [edit, setEdit] = useState<Doc<Quote> | "new" | null>(null);
  const rows = useMemo(() => (c.data.quote as Doc<Quote>[]).filter((x) => x.data.archived === arch && match(q, x.data.number, c.clientName(x.data.client_id))).sort((a, b) => b.data.number.localeCompare(a.data.number)), [c.data.quote, arch, q, c]);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">{canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Devis</button>}</div>
      {rows.length === 0 ? <Empty icon={FileText} title="Aucun devis" /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => canEdit && x.data.status === "brouillon" ? setEdit(x) : undefined}>
                <span className="block truncate text-sm font-medium">{x.data.number} · {c.clientName(x.data.client_id)}</span>
                <span className="block text-xs text-slate-500">{fmtDate(x.data.date)}{x.data.valid_until ? ` · valable jusqu'au ${fmtDate(x.data.valid_until)}` : ""}{x.data.invoice_id ? " · converti en facture" : ""}</span>
              </button>
              <span className="text-sm font-semibold">{c.fmt(x.data.total)}</span>
              {canEdit ? (
                <select className="input !w-auto !py-1 text-xs" value={x.data.status} onChange={(e) => c.run("quote.status", { id: x.id, status: e.target.value })} aria-label="Statut du devis">{Object.entries(QUOTE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              ) : <Badge tone={TONES[x.data.status]}>{QUOTE_STATUS[x.data.status]}</Badge>}
              <a className="btn btn-ghost !py-1 text-xs" href={c.docUrl("quote", x.id)} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /> PDF</a>
              {canEdit && x.data.status === "accepte" && !x.data.invoice_id && <button className="btn btn-primary !py-1 text-xs" onClick={() => c.run("quote.convert", { id: x.id })}><ArrowRightLeft className="h-3.5 w-3.5" /> En facture</button>}
              {canEdit && <button className="text-slate-400 hover:text-slate-700" aria-label={x.data.archived ? "Désarchiver" : "Archiver"} onClick={() => c.run("quote.archive", { id: x.id, archived: !x.data.archived })}><Archive className="h-4 w-4" /></button>}
              {canEdit && x.data.status === "brouillon" && <DeleteButton label="Suppr." confirmText="Supprimer ce devis ?" onConfirm={() => c.run("quote.delete", { id: x.id })} />}
            </li>
          ))}
        </ul>
      )}
      {edit && <DocForm kind="quote" doc={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ---------- Contrats ----------
function Contracts({ q, arch, canEdit }: { q: string; arch: boolean; canEdit: boolean }) {
  const c = useCtx();
  const [edit, setEdit] = useState<Doc<Contract> | "new" | null>(null);
  const rows = useMemo(() => (c.data.contract as Doc<Contract>[]).filter((x) => x.data.archived === arch && match(q, x.data.title, c.clientName(x.data.client_id))), [c.data.contract, arch, q, c]);
  return (
    <div className="space-y-3">
      <div className="flex justify-end">{canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Contrat</button>}</div>
      {rows.length === 0 ? <Empty icon={FileText} title="Aucun contrat" /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <button className="min-w-0 flex-1 text-left" onClick={() => canEdit && setEdit(x)}><span className="block truncate text-sm font-medium">{x.data.title}</span><span className="block text-xs text-slate-500">{c.clientName(x.data.client_id)} · {fmtDate(x.data.start)} → {fmtDate(x.data.end)}{x.data.amount != null ? ` · ${c.fmt(x.data.amount)}` : ""}</span></button>
              <Badge tone={TONES[x.data.status]}>{CONTRACT_STATUS[x.data.status]}</Badge>
              <a className="btn btn-ghost !py-1 text-xs" href={c.docUrl("contract", x.id)} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /> PDF</a>
              {canEdit && <button className="text-slate-400 hover:text-slate-700" aria-label={x.data.archived ? "Désarchiver" : "Archiver"} onClick={() => c.run("contract.archive", { id: x.id, archived: !x.data.archived })}><Archive className="h-4 w-4" /></button>}
            </li>
          ))}
        </ul>
      )}
      {edit && <ContractForm doc={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ContractForm({ doc, onClose }: { doc: Doc<Contract> | null; onClose: () => void }) {
  const c = useCtx();
  const d = doc?.data;
  const [f, setF] = useState({ title: d?.title ?? "", client_id: d?.client_id ?? "", kind: d?.kind ?? "", start: d?.start ?? "", end: d?.end ?? "", amount: d?.amount != null ? String(d.amount) : "", status: d?.status ?? ("brouillon" as keyof typeof CONTRACT_STATUS), terms: d?.terms ?? "" });
  const clients: [string, string][] = (c.data.client as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
  return (
    <Modal wide title={doc ? "Contrat" : "Nouveau contrat"} onClose={onClose} footer={
      <>
        {doc && <DeleteButton confirmText="Supprimer ce contrat ?" onConfirm={async () => (await c.run("contract.delete", { id: doc.id })) && onClose()} />}
        <button className="btn btn-primary" disabled={!f.title.trim()} onClick={async () => (await c.run("contract.save", { id: doc?.id, ...f, client_id: f.client_id || null, start: f.start || null, end: f.end || null, amount: f.amount === "" ? null : Number(f.amount) })) && onClose()}>Enregistrer</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre" className="sm:col-span-2"><input className="input" value={f.title} maxLength={160} onChange={(e) => setF({ ...f, title: e.target.value })} autoFocus /></Field>
        <Pick label="Client" value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} options={clients} empty="Sans client" />
        <Field label="Type"><input className="input" value={f.kind} maxLength={60} placeholder="Prestation, bail, mandat…" onChange={(e) => setF({ ...f, kind: e.target.value })} /></Field>
        <Field label="Début"><input className="input" type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Fin"><input className="input" type="date" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <Field label="Montant"><input className="input" type="number" min="0" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Statut"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })}>{Object.entries(CONTRACT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Clauses et conditions" className="sm:col-span-2"><textarea className="input" rows={6} maxLength={6000} value={f.terms} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

// ---------- Fichiers ----------
function Files({ q, arch, canEdit }: { q: string; arch: boolean; canEdit: boolean }) {
  const c = useCtx();
  const { pick, busy } = useFilePick();
  const input = useRef<HTMLInputElement>(null);
  const [cat, setCat] = useState<keyof typeof DOC_CATEGORIES>("administratif");
  const [clientId, setClientId] = useState("");
  const rows = useMemo(() => (c.data.document as Doc<Document>[]).filter((x) => x.data.archived === arch && match(q, x.data.name, c.clientName(x.data.client_id))), [c.data.document, arch, q, c]);
  const clients: [string, string][] = (c.data.client as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const f = await pick(file);
    if (f) await c.run("document.add", { name: file.name.replace(/\.[^.]+$/, ""), category: cat, client_id: clientId || null, file: f });
    if (input.current) input.current.value = "";
  };
  return (
    <div className="space-y-3">
      {canEdit && (
        <Card>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Catégorie"><select className="input" value={cat} onChange={(e) => setCat(e.target.value as typeof cat)}>{Object.entries(DOC_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Pick label="Client (facultatif)" value={clientId} onChange={setClientId} options={clients} empty="Aucun" />
            <button className="btn btn-primary" disabled={busy} onClick={() => input.current?.click()}><Upload className="h-4 w-4" /> {busy ? "Lecture…" : "Ajouter un fichier"}</button>
            <input ref={input} type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.xls,.xlsx" onChange={(e) => onFile(e.target.files?.[0])} />
          </div>
          <p className="mt-2 text-xs text-slate-500">PDF, images, Word, Excel ou texte — 380 Ko maximum par fichier.</p>
        </Card>
      )}
      {rows.length === 0 ? <Empty icon={Paperclip} title="Aucun fichier" /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {rows.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <Paperclip className="h-4 w-4 text-slate-400" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.data.name}</span><span className="block text-xs text-slate-500">{DOC_CATEGORIES[x.data.category]} · {c.clientName(x.data.client_id)} · {Math.max(1, Math.round(x.data.size / 1024))} Ko · {fmtDate(x.data.at)}</span></span>
              {x.data.file_id && <a className="btn btn-ghost !py-1 text-xs" href={c.fileUrl(x.data.file_id) ?? "#"} target="_blank" rel="noreferrer"><Download className="h-3.5 w-3.5" /> Ouvrir</a>}
              {canEdit && <button className="text-slate-400 hover:text-slate-700" aria-label={x.data.archived ? "Désarchiver" : "Archiver"} onClick={() => c.run("document.archive", { id: x.id, archived: !x.data.archived })}><Archive className="h-4 w-4" /></button>}
              {canEdit && <DeleteButton label="Suppr." confirmText="Supprimer ce fichier ?" onConfirm={() => c.run("document.delete", { id: x.id })} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
