"use client";

import { Ban, CloudOff, Download, FileText, Printer, Receipt, RotateCcw, Share2, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { PAY_METHODS, dueOf, lineTotal, paidOf, periodRange, refundedOf, returnedQty, type Customer, type Doc, type Period, type Register, type Sale } from "@/lib/shop/model";
import { useCtx } from "../context";
import { invoiceHtml, printHtml, receiptHtml, receiptText } from "../print";
import { Badge, Card, Empty, Field, Modal, Pager, SearchBox, Tabs, downloadText, fcfa, opKey, paginate, qtyFmt, timeFmt, toCsv } from "../ui";

export function Sales() {
  const c = useCtx();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period | "all">("month");
  const [filter, setFilter] = useState<"all" | "credit" | "annulee" | "en_ligne">("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const sales = c.data.sale as Doc<Sale>[];
  const rows = useMemo(() => {
    const r = period === "all" ? null : periodRange(period);
    const n = q.trim().toLowerCase();
    return sales
      .filter((s) => !r || (Date.parse(s.data.at) >= r.from && Date.parse(s.data.at) <= r.to))
      .filter((s) => filter === "all" || (filter === "credit" ? dueOf(s.data) > 0 : filter === "annulee" ? s.data.status === "annulee" : s.data.channel === "en_ligne"))
      .filter((s) => !n || [s.data.number, s.data.customer_name, s.data.invoice_number ?? "", ...s.data.items.map((l) => l.name)].some((x) => x.toLowerCase().includes(n)))
      .sort((a, b) => b.data.at.localeCompare(a.data.at));
  }, [sales, q, period, filter]);
  const pg = paginate(rows, page, 25);
  const sel = sales.find((s) => s.id === open);

  const exportCsv = () =>
    downloadText(`ventes-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([["numero", "date", "canal", "client", "vendeur", "total", "paye", "retours", "reste", "statut", "facture"], ...rows.map((s) => [s.data.number, new Date(s.data.at).toLocaleString("fr-FR"), s.data.channel === "caisse" ? "Caisse" : "En ligne", s.data.customer_name, c.memberName(s.data.by), s.data.total, paidOf(s.data), refundedOf(s.data), dueOf(s.data), s.data.status === "annulee" ? "Annulée" : "Validée", s.data.invoice_number ?? ""])]));

  return (
    <div className="space-y-4">
      {c.queue.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><CloudOff className="h-4 w-4" /> Ventes en attente d'envoi ({c.queue.length})</span>} subtitle="Enregistrées sans connexion : elles partent automatiquement dès le retour d'Internet." action={<button className="btn btn-ghost !py-1.5 text-sm" onClick={() => void c.sync()}>Envoyer maintenant</button>}>
          <ul className="divide-y divide-slate-100 text-sm">
            {c.queue.map((x) => (
              <li key={x.input.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate">{x.label}</span>
                <span className="font-medium">{fcfa(x.total)}</span>
                {x.error && <><Badge tone="red">{x.error}</Badge><button className="text-xs text-slate-500 underline" onClick={() => confirm("Retirer cette vente de la file ? Elle ne sera pas enregistrée.") && c.dropQueued(x.input.id)}>Retirer</button></>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} placeholder="Numéro, client, produit…" /></div>
        <Tabs value={period} onChange={(v) => (setPeriod(v), setPage(1))} items={[["today", "Jour"], ["week", "Semaine"], ["month", "Mois"], ["year", "Année"], ["all", "Tout"]]} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={filter} onChange={(v) => (setFilter(v), setPage(1))} items={[["all", "Toutes"], ["credit", "À crédit"], ["en_ligne", "En ligne"], ["annulee", "Annulées"]]} />
        <button className="btn btn-ghost ml-auto !py-1.5 text-sm" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" /> Exporter</button>
      </div>
      {rows.length === 0 ? (
        <Empty icon={Receipt} title="Aucune vente sur cette sélection" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">{rows.length} vente(s) · {fcfa(rows.filter((s) => s.data.status === "validee").reduce((a, s) => a + s.data.total - refundedOf(s.data), 0))}</p>
          <ul className="divide-y divide-slate-100">
            {pg.rows.map((s) => (
              <li key={s.id}>
                <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setOpen(s.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.data.number}{s.data.customer_name ? ` · ${s.data.customer_name}` : ""}</span>
                    <span className="block truncate text-xs text-slate-500">{timeFmt(s.data.at)} · {c.memberName(s.data.by)} · {s.data.items.length} article(s)</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-sm font-semibold">{fcfa(s.data.total)}</span>
                    <span className="flex gap-1">
                      {s.data.channel === "en_ligne" && <Badge tone="blue">En ligne</Badge>}
                      {s.data.status === "annulee" && <Badge tone="red">Annulée</Badge>}
                      {dueOf(s.data) > 0 && <Badge tone="amber">Reste {fcfa(dueOf(s.data))}</Badge>}
                      {s.data.returns.length > 0 && <Badge>Retour</Badge>}
                      {s.data.conflict && <Badge tone="red">À vérifier</Badge>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
      {sel && <SaleDetail sale={sel} onClose={() => setOpen(null)} />}
    </div>
  );
}

export function SaleDetail({ sale, onClose }: { sale: Doc<Sale>; onClose: () => void }) {
  const c = useCtx();
  const s = sale.data;
  const [mode, setMode] = useState<"view" | "pay" | "return" | "cancel">("view");
  const mine = (c.data.register as Doc<Register>[]).find((r) => r.data.status === "ouverte" && r.data.opened_by === c.s.me) ?? null;
  const customer = (c.data.customer as Doc<Customer>[]).find((x) => x.id === s.customer_id)?.data ?? null;
  const logo = c.img(c.settings.logo_id);
  const abs = (u: string | null) => (u ? new URL(u, location.origin).toString() : null);
  const due = dueOf(s);
  const invoice = async () => {
    let num = s.invoice_number;
    if (!num) num = (await c.run("sale.invoice", { sale_id: sale.id }, { quiet: true }))?.number ?? null;
    if (num) printHtml(invoiceHtml({ ...s, invoice_number: num }, c.settings, { logo: abs(logo), customer }));
  };
  const pdf = () => window.open(`/api/apps/${c.projectId}/shop/invoice?mode=${c.mode}&sale=${sale.id}`, "_blank", "noopener");
  return (
    <Modal wide title={`Vente ${s.number}`} onClose={onClose}>
      {mode === "view" && (
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-600">
            <span>{new Date(s.at).toLocaleString("fr-FR")}</span>
            <span>Vendeur : {c.memberName(s.by)}</span>
            {s.customer_name && <span>Client : {s.customer_name}</span>}
            <span>{s.channel === "caisse" ? "Caisse" : `En ligne (${s.note})`}</span>
            {s.invoice_number && <span>Facture {s.invoice_number}</span>}
          </div>
          {s.conflict && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">Vente faite hors connexion : {s.conflict}. Vérifiez le stock dans « Stock ».</p>}
          {s.status === "annulee" && s.cancel && <p className="rounded-xl bg-red-50 px-3 py-2 text-red-700">Annulée le {new Date(s.cancel.at).toLocaleString("fr-FR")} par {c.memberName(s.cancel.by)} : {s.cancel.reason}</p>}
          <table className="w-full">
            <thead className="text-left text-xs text-slate-500"><tr><th className="py-1">Article</th><th className="text-right">Qté</th><th className="text-right">Prix</th><th className="text-right">Montant</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {s.items.map((l, i) => (
                <tr key={i}>
                  <td className="py-2">{l.name}{returnedQty(s, i) > 0 && <span className="ml-1 text-xs text-amber-700">({qtyFmt(returnedQty(s, i))} retourné)</span>}</td>
                  <td className="text-right">{qtyFmt(l.qty)}</td>
                  <td className="text-right">{fcfa(l.unit_price)}</td>
                  <td className="text-right">{fcfa(lineTotal(l))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto max-w-xs space-y-1">
            {s.discount > 0 && <div className="flex justify-between"><dt>Remise</dt><dd>− {fcfa(s.discount)}</dd></div>}
            <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd>{fcfa(s.total)}</dd></div>
            {s.payments.map((p) => <div key={p.id} className="flex justify-between text-slate-600"><dt>{PAY_METHODS[p.method]}{p.ref ? ` (${p.ref})` : ""}{p.verified ? " ✓" : ""}</dt><dd>{fcfa(p.amount)}</dd></div>)}
            {s.returns.map((r) => <div key={r.id} className="flex justify-between text-amber-700"><dt>Retour ({r.reason}){r.refund ? `, rendu ${fcfa(r.refund)}` : ""}</dt><dd>− {fcfa(r.amount)}</dd></div>)}
            {due > 0 && <div className="flex justify-between font-semibold text-amber-700"><dt>Reste à payer</dt><dd>{fcfa(due)}</dd></div>}
          </dl>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <button className="btn btn-ghost" onClick={() => printHtml(receiptHtml(s, c.settings, { logo: abs(logo), seller: c.memberName(s.by) }))}><Printer className="h-4 w-4" /> Reçu</button>
            <button className="btn btn-ghost" onClick={invoice}><FileText className="h-4 w-4" /> Facture (imprimer)</button>
            <button className="btn btn-ghost" onClick={pdf}><Download className="h-4 w-4" /> Facture PDF</button>
            <button className="btn btn-ghost" onClick={() => (navigator.share ? navigator.share({ text: receiptText(s, c.settings) }).catch(() => undefined) : window.open(`https://wa.me/?text=${encodeURIComponent(receiptText(s, c.settings))}`, "_blank", "noopener"))}><Share2 className="h-4 w-4" /> Partager</button>
            {s.status === "validee" && due > 0 && c.may(["caisse", "clients"]) && <button className="btn btn-primary" onClick={() => setMode("pay")}><Wallet className="h-4 w-4" /> Encaisser le reste</button>}
            {s.status === "validee" && c.s.can.remises && s.items.some((l, i) => l.product_id !== "__livraison" && returnedQty(s, i) < l.qty) && <button className="btn btn-ghost" onClick={() => setMode("return")}><RotateCcw className="h-4 w-4" /> Retour</button>}
            {s.status === "validee" && c.s.can.remises && !s.returns.length && <button className="btn btn-danger" onClick={() => setMode("cancel")}><Ban className="h-4 w-4" /> Annuler la vente</button>}
          </div>
        </div>
      )}
      {mode === "pay" && <PayRest sale={sale} register={mine} onDone={() => setMode("view")} />}
      {mode === "return" && <ReturnForm sale={sale} register={mine} onDone={() => setMode("view")} />}
      {mode === "cancel" && <CancelForm sale={sale} register={mine} onDone={onClose} onBack={() => setMode("view")} />}
    </Modal>
  );
}

function PayRest({ sale, register, onDone }: { sale: Doc<Sale>; register: Doc<Register> | null; onDone: () => void }) {
  const c = useCtx();
  const due = dueOf(sale.data);
  const [f, setF] = useState({ method: "especes", amount: String(due), ref: "" });
  return (
    <div className="space-y-3">
      <p>Reste dû : <b>{fcfa(due)}</b></p>
      <Field label="Moyen de paiement">
        <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option><option value="carte">Carte bancaire</option><option value="autre">Autre</option>
        </select>
      </Field>
      {f.method === "especes" && !register && <p className="text-sm text-red-600">Ouvrez votre caisse (page Caisse) pour encaisser des espèces.</p>}
      <Field label="Montant (FCFA)"><input className="input" inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/\D/g, "") })} /></Field>
      {f.method !== "especes" && <Field label="Référence"><input className="input" value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} /></Field>}
      <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onDone}>Retour</button><button className="btn btn-primary" disabled={!f.amount} onClick={async () => (await c.run("sale.pay", { sale_id: sale.id, ...f, register_id: register?.id ?? null })) && onDone()}>Enregistrer le paiement</button></div>
    </div>
  );
}

function ReturnForm({ sale, register, onDone }: { sale: Doc<Sale>; register: Doc<Register> | null; onDone: () => void }) {
  const c = useCtx();
  const s = sale.data;
  const [qty, setQty] = useState<Record<number, string>>({});
  const [f, setF] = useState({ method: "especes", reason: "", restock: true });
  const [key] = useState(() => opKey("ret"));
  const lines = Object.entries(qty).map(([i, v]) => ({ index: Number(i), qty: Number(v.replace(",", ".")) || 0 })).filter((l) => l.qty > 0);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-slate-600">Indiquez les quantités rapportées par le client.</p>
      {s.items.map((l, i) => {
        if (l.product_id === "__livraison") return null;
        const left = l.qty - returnedQty(s, i);
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="flex-1">{l.name} <span className="text-xs text-slate-500">(max {qtyFmt(left)})</span></span>
            <input className="input !w-20" inputMode="decimal" disabled={left <= 0} value={qty[i] ?? ""} onChange={(e) => setQty({ ...qty, [i]: e.target.value })} aria-label={`Quantité retournée de ${l.name}`} />
          </div>
        );
      })}
      <Field label="Motif"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Ex. mauvaise taille" maxLength={200} /></Field>
      <Field label="Remboursement (si le client avait payé)">
        <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="especes">Espèces (depuis ma caisse)</option><option value="mobile_money">Mobile Money</option><option value="autre">Autre / avoir</option>
        </select>
      </Field>
      <label className="flex items-center gap-2"><input type="checkbox" checked={f.restock} onChange={(e) => setF({ ...f, restock: e.target.checked })} /> Remettre les articles en stock (décochez si abîmés)</label>
      <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onDone}>Retour</button><button className="btn btn-primary" disabled={!lines.length || !f.reason} onClick={async () => (await c.run("sale.return", { sale_id: sale.id, lines, ...f, register_id: register?.id ?? null, op_key: key })) && onDone()}>Enregistrer le retour</button></div>
    </div>
  );
}

function CancelForm({ sale, register, onDone, onBack }: { sale: Doc<Sale>; register: Doc<Register> | null; onDone: () => void; onBack: () => void }) {
  const c = useCtx();
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3 text-sm">
      <p>L'annulation remet les articles en stock. La vente reste visible dans l'historique, marquée « Annulée », avec votre nom et le motif.</p>
      {sale.data.payments.some((p) => p.method === "especes") && <p className="text-amber-700">Les espèces encaissées ({fcfa(sale.data.payments.filter((p) => p.method === "especes").reduce((a, p) => a + p.amount, 0))}) sont rendues depuis votre caisse{register ? "" : " : ouvrez d'abord votre caisse"}.</p>}
      <Field label="Motif de l'annulation"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} /></Field>
      <div className="flex justify-end gap-2"><button className="btn btn-ghost" onClick={onBack}>Retour</button><button className="btn btn-danger" disabled={!reason} onClick={async () => (await c.run("sale.cancel", { sale_id: sale.id, reason, register_id: register?.id ?? null })) && onDone()}>Annuler la vente</button></div>
    </div>
  );
}
