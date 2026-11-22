import { A4, Page, build, cut, hex } from "../shop/pdf";
import { INVOICE_STATE_LABELS, PAY_METHODS, balanceOf, docTotals, invoiceState, money, paidOf, type Client, type Contract, type CurrencyCode, type DocLine, type Invoice, type InvPayment, type Quote, type Settings } from "./model";

/** Documents PDF de l'entreprise : devis, facture, reçu de paiement et contrat (texte seul, sans service tiers). */

type Party = Pick<Client, "name" | "phone" | "address" | "email"> | null;
const GRAY: [number, number, number] = [0.4, 0.45, 0.55];

function header(p: Page, s: Settings, title: string, number: string, rows: string[], client: Party, brand: [number, number, number]) {
  p.rect(0, A4.h - 8, A4.w, 8, brand);
  const y = A4.h - 55;
  p.text(40, y, s.name, 18, true);
  [s.address, s.phone, s.email].filter(Boolean).forEach((l, i) => p.text(40, y - 16 - i * 13, cut(l, 9, 260), 9));
  p.text(A4.w - 40, y, title, 24, true, true, brand);
  p.text(A4.w - 40, y - 20, `N° ${number}`, 11, true, true);
  rows.forEach((r, i) => p.text(A4.w - 40, y - 34 - i * 13, r, 10, false, true));
  let cy = y - 100;
  if (client) {
    p.text(40, cy, "Client", 9, false, false, GRAY);
    p.text(40, cy - 14, client.name, 11, true);
    [client.phone, client.email, client.address].filter(Boolean).forEach((l, i) => p.text(40, cy - 28 - i * 13, cut(l, 9, 300), 9));
    cy -= 80;
  }
  return cy;
}

function lines(pages: Page[], first: Page, y0: number, items: DocLine[], cur: CurrencyCode) {
  let p = first;
  let y = y0;
  const head = () => {
    p.rect(40, y - 6, A4.w - 80, 22, [0.945, 0.961, 0.976]);
    p.text(48, y, "Désignation", 9, true);
    p.text(340, y, "Qté", 9, true, true);
    p.text(430, y, "Prix unitaire", 9, true, true);
    p.text(A4.w - 48, y, "Montant", 9, true, true);
    y -= 26;
  };
  head();
  for (const l of items) {
    if (y < 190) {
      p = new Page();
      pages.push(p);
      y = A4.h - 60;
      head();
    }
    p.text(48, y, cut(l.desc, 10, 270), 10);
    p.text(340, y, String(l.qty), 10, false, true);
    p.text(430, y, money(l.unit_price, cur), 10, false, true);
    p.text(A4.w - 48, y, money(l.qty * l.unit_price, cur), 10, false, true);
    y -= 20;
    p.line(40, y + 10, A4.w - 40);
  }
  return { p, y };
}

function totals(p: Page, y0: number, items: DocLine[], tax: number, discount: number, cur: CurrencyCode, brand: [number, number, number], extra: [string, string][] = []) {
  let y = y0 - 10;
  const t = docTotals(items, tax, discount);
  const row = (label: string, value: string, bold = false, color?: [number, number, number]) => {
    p.text(330, y, label, bold ? 12 : 10, bold);
    p.text(A4.w - 48, y, value, bold ? 12 : 10, bold, true, color);
    y -= bold ? 22 : 16;
  };
  row("Sous-total", money(t.subtotal, cur));
  if (discount) row("Remise", `− ${money(discount, cur)}`);
  if (tax) row(`TVA ${tax} %`, money(t.tax, cur));
  row("Total", money(t.total, cur), true, brand);
  for (const [a, b] of extra) row(a, b);
  return y;
}

function footer(p: Page, note: string) {
  p.text(40, 36, cut(`${note} — Document généré par MiniSoft Bureau.`, 8, A4.w - 80), 8, false, false, [0.5, 0.55, 0.65]);
}

export function quotePdf(q: Quote, s: Settings, client: Party): Buffer {
  const brand = hex(s.primary);
  const pages: Page[] = [];
  const p0 = new Page();
  pages.push(p0);
  const y0 = header(p0, s, "DEVIS", q.number, [`Date : ${new Date(q.date).toLocaleDateString("fr-FR")}`, q.valid_until ? `Valable jusqu'au ${new Date(q.valid_until).toLocaleDateString("fr-FR")}` : ""].filter(Boolean), client, brand);
  const { p, y } = lines(pages, p0, y0, q.items, s.currency);
  const y2 = totals(p, y, q.items, q.tax_rate, q.discount, s.currency, brand);
  if (q.note) p.text(40, y2 - 10, cut(q.note, 9, A4.w - 80), 9, false, false, GRAY);
  footer(p, s.invoice_note);
  return build(pages);
}

export function invoicePdf(v: Invoice, s: Settings, client: Party): Buffer {
  const brand = hex(s.primary);
  const pages: Page[] = [];
  const p0 = new Page();
  pages.push(p0);
  const st = invoiceState(v);
  const y0 = header(p0, s, "FACTURE", v.number, [`Date : ${new Date(v.date).toLocaleDateString("fr-FR")}`, v.due ? `Échéance : ${new Date(v.due).toLocaleDateString("fr-FR")}` : "", `Statut : ${INVOICE_STATE_LABELS[st]}`].filter(Boolean), client, brand);
  const { p, y } = lines(pages, p0, y0, v.items, s.currency);
  const bal = balanceOf(v);
  const y2 = totals(p, y, v.items, v.tax_rate, v.discount, s.currency, brand, [["Payé", money(paidOf(v), s.currency)], ...(bal ? ([["Reste à payer", money(bal, s.currency)]] as [string, string][]) : [])]);
  if (v.payments.length) p.text(40, y2 - 10, cut(`Paiements : ${v.payments.map((x) => `${PAY_METHODS[x.method]} ${money(x.amount, s.currency)} le ${new Date(x.date).toLocaleDateString("fr-FR")} (${x.receipt})`).join(" ; ")}`, 8, A4.w - 80), 8, false, false, GRAY);
  if (v.status === "annulee") p.text(40, y2 - 28, "Cette facture a été annulée.", 11, true, false, [0.75, 0.1, 0.1]);
  footer(p, v.note || s.invoice_note);
  return build(pages);
}

export function receiptPdf(v: Invoice, pay: InvPayment, s: Settings, client: Party): Buffer {
  const brand = hex(s.primary);
  const pg = new Page();
  const y = header(pg, s, "REÇU", pay.receipt, [`Date : ${new Date(pay.date).toLocaleDateString("fr-FR")}`], client, brand);
  pg.text(40, y, `Reçu la somme de`, 11);
  pg.text(40, y - 28, money(pay.amount, s.currency), 24, true, false, brand);
  pg.text(40, y - 60, `Mode de paiement : ${PAY_METHODS[pay.method]}${pay.ref ? ` (${pay.ref})` : ""}`, 11);
  pg.text(40, y - 78, `Pour la facture ${v.number}`, 11);
  pg.text(40, y - 110, `Total de la facture : ${money(v.total, s.currency)}`, 10);
  pg.text(40, y - 126, `Déjà payé : ${money(paidOf(v), s.currency)}`, 10);
  pg.text(40, y - 142, `Reste à payer : ${money(balanceOf(v), s.currency)}`, 10, true);
  footer(pg, s.invoice_note);
  return build([pg]);
}

export function contractPdf(k: Contract, s: Settings, client: Party): Buffer {
  const brand = hex(s.primary);
  const pages: Page[] = [];
  let p = new Page();
  pages.push(p);
  let y = header(p, s, "CONTRAT", k.title, [k.kind ? `Type : ${k.kind}` : "", k.start ? `Début : ${new Date(k.start).toLocaleDateString("fr-FR")}` : "", k.end ? `Fin : ${new Date(k.end).toLocaleDateString("fr-FR")}` : ""].filter(Boolean), client, brand);
  if (k.amount !== null) {
    p.text(40, y, `Montant : ${money(k.amount, s.currency)}`, 12, true);
    y -= 30;
  }
  // Conditions : texte découpé en lignes (largeur approximative).
  const words = (k.terms || "").replace(/\r/g, "").split("\n").flatMap((l) => {
    const out: string[] = [];
    let cur = "";
    for (const w of l.split(" ")) {
      if ((cur + " " + w).length > 95) (out.push(cur), (cur = w));
      else cur = cur ? `${cur} ${w}` : w;
    }
    out.push(cur);
    return out;
  });
  for (const l of words) {
    if (y < 80) {
      p = new Page();
      pages.push(p);
      y = A4.h - 60;
    }
    p.text(40, y, l, 10);
    y -= 14;
  }
  footer(p, s.invoice_note);
  return build(pages);
}
