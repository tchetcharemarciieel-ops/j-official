"use client";

import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS, QUOTE_STATUS_LABELS, balance, fmtDate, fmtMoney, fmtQty, type Client, type Doc, type Invoice, type Job, type Payment, type Quote, type Vehicle } from "@/lib/garage/model";
import { PrintDoc, byId, useG } from "./ui";

function Head({ title, number, date }: { title: string; number: string; date: string }) {
  const { appName } = useG();
  return (
    <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
      <div>
        <p className="text-lg font-bold">{appName}</p>
        <p className="text-xs text-slate-500">Document généré par le logiciel de gestion du garage</p>
      </div>
      <div className="text-right">
        <p className="text-base font-semibold">{title}</p>
        <p className="font-mono text-sm">{number}</p>
        <p className="text-xs text-slate-500">{date}</p>
      </div>
    </div>
  );
}

function Party({ clientId, customer, jobId }: { clientId: string | null; customer?: string; jobId?: string | null }) {
  const { g } = useG();
  const c = byId<Client>(g.data.client, clientId);
  const job = byId<Job>(g.data.job, jobId);
  const v = byId<Vehicle>(g.data.vehicle, job?.data.vehicle_id);
  return (
    <div className="mb-3 grid gap-3 sm:grid-cols-2">
      <div>
        <p className="text-xs uppercase text-slate-500">Client</p>
        <p className="font-medium">{c?.data.name ?? (customer || "Client de passage")}</p>
        {c && <p className="text-xs">{[c.data.phone, c.data.email, c.data.address].filter(Boolean).join(" · ")}</p>}
      </div>
      {v && job && (
        <div>
          <p className="text-xs uppercase text-slate-500">Véhicule · dossier {job.data.ref}</p>
          <p className="font-medium">{v.data.plate} — {v.data.make} {v.data.model}</p>
          {job.data.mileage_in !== null && <p className="text-xs">{job.data.mileage_in.toLocaleString("fr-FR")} km à l&apos;entrée</p>}
        </div>
      )}
    </div>
  );
}

function Lines({ lines }: { lines: { label: string; kind: string; qty: number; unit_price: number }[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-xs text-slate-500">
          <th className="py-1.5">Désignation</th>
          <th className="py-1.5">Type</th>
          <th className="py-1.5 text-right">Qté</th>
          <th className="py-1.5 text-right">P.U.</th>
          <th className="py-1.5 text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className="border-b border-slate-100">
            <td className="py-1.5">{l.label}</td>
            <td className="py-1.5 text-xs">{l.kind === "piece" ? "Pièce" : l.kind === "main_oeuvre" ? "Main-d'œuvre" : "Autre"}</td>
            <td className="py-1.5 text-right">{fmtQty(l.qty)}</td>
            <td className="py-1.5 text-right">{fmtMoney(l.unit_price)}</td>
            <td className="py-1.5 text-right">{fmtMoney(Math.round(l.qty * l.unit_price))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function QuoteDoc({ quote, onClose }: { quote: Doc<Quote>; onClose: () => void }) {
  const q = quote.data;
  return (
    <PrintDoc title={`Devis ${q.number}`} onClose={onClose}>
      <Head title="DEVIS" number={q.number} date={`Établi le ${fmtDate(quote.created_at)}`} />
      <Party clientId={q.client_id} jobId={q.job_id} />
      <Lines lines={q.lines} />
      <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
        <p className="flex justify-between"><span>Pièces</span><span>{fmtMoney(q.total_parts)}</span></p>
        <p className="flex justify-between"><span>Main-d&apos;œuvre</span><span>{fmtMoney(q.total_labour)}</span></p>
        <p className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span>{fmtMoney(q.total)}</span></p>
      </div>
      {q.note && <p className="mt-3 text-xs">{q.note}</p>}
      <p className="mt-4 text-xs text-slate-600">Statut : {QUOTE_STATUS_LABELS[q.status]}{q.decision ? ` · réponse enregistrée le ${fmtDate(q.decision.at)}` : ""}</p>
      <div className="mt-8 grid grid-cols-2 gap-6 text-xs text-slate-500"><p>Bon pour accord (date et signature du client) :</p><p className="text-right">Cachet du garage :</p></div>
    </PrintDoc>
  );
}

export function InvoiceDoc({ invoice, onClose }: { invoice: Doc<Invoice>; onClose: () => void }) {
  const { g } = useG();
  const inv = invoice.data;
  const pays = (g.data.payment as Doc<Payment>[]).filter((p) => p.data.invoice_id === invoice.id && !p.data.cancelled);
  return (
    <PrintDoc title={`Facture ${inv.number}`} onClose={onClose}>
      <Head title="FACTURE" number={inv.number} date={`Émise le ${fmtDate(inv.issued_at)}${inv.due_date ? ` · échéance ${fmtDate(inv.due_date)}` : ""}`} />
      <Party clientId={inv.client_id} customer={inv.customer_name} jobId={inv.job_id} />
      <Lines lines={inv.lines} />
      <div className="mt-3 ml-auto max-w-xs space-y-1 text-sm">
        <p className="flex justify-between"><span>Pièces</span><span>{fmtMoney(inv.total_parts)}</span></p>
        <p className="flex justify-between"><span>Main-d&apos;œuvre</span><span>{fmtMoney(inv.total_labour)}</span></p>
        <p className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span>{fmtMoney(inv.total)}</span></p>
        <p className="flex justify-between"><span>Paiements enregistrés</span><span>{fmtMoney(inv.paid)}</span></p>
        <p className="flex justify-between font-semibold"><span>Reste à payer</span><span>{fmtMoney(balance(inv))}</span></p>
      </div>
      {pays.length > 0 && (
        <p className="mt-3 text-xs">Paiements : {pays.map((p) => `${fmtDate(p.data.received_at)} ${fmtMoney(p.data.amount)} (${PAYMENT_METHOD_LABELS[p.data.method]}, reçu ${p.data.receipt_no})`).join(" · ")}</p>
      )}
      <p className="mt-4 text-xs text-slate-600">Statut : {INVOICE_STATUS_LABELS[inv.status]}{inv.cancelled ? ` — annulée le ${fmtDate(inv.cancelled.at)} (${inv.cancelled.reason})` : ""}</p>
    </PrintDoc>
  );
}

export function ReceiptDoc({ payment, onClose }: { payment: Doc<Payment>; onClose: () => void }) {
  const { g, name } = useG();
  const p = payment.data;
  const inv = byId<Invoice>(g.data.invoice, p.invoice_id);
  return (
    <PrintDoc title={`Reçu ${p.receipt_no}`} onClose={onClose}>
      <Head title="REÇU DE PAIEMENT" number={p.receipt_no} date={`Paiement reçu le ${fmtDate(p.received_at)}`} />
      {inv && <Party clientId={inv.data.client_id} customer={inv.data.customer_name} jobId={inv.data.job_id} />}
      <div className="space-y-1 text-sm">
        <p className="flex justify-between"><span>Facture</span><span className="font-mono">{inv?.data.number ?? "—"}</span></p>
        <p className="flex justify-between text-base font-bold"><span>Montant reçu</span><span>{fmtMoney(p.amount)}</span></p>
        <p className="flex justify-between"><span>Mode de paiement</span><span>{PAYMENT_METHOD_LABELS[p.method]}</span></p>
        {p.reference && <p className="flex justify-between"><span>Référence</span><span>{p.reference}</span></p>}
        {inv && <p className="flex justify-between"><span>Reste à payer sur la facture</span><span>{fmtMoney(balance(inv.data))}</span></p>}
        <p className="flex justify-between text-xs text-slate-500"><span>Enregistré par</span><span>{name(p.recorded_by)}</span></p>
      </div>
      {p.cancelled && <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">Paiement annulé le {fmtDate(p.cancelled.at)} : {p.cancelled.reason}</p>}
    </PrintDoc>
  );
}
