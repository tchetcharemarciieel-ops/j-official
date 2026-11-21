"use client";

import { PAY_METHODS, dueOf, lineTotal, paidOf, refundedOf, type Sale, type Settings } from "@/lib/shop/model";

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const f = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;

/** Imprime un document HTML dans un cadre caché (ticket de caisse ou facture), sans quitter la page. */
export function printHtml(html: string) {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  const imgs = [...doc.images];
  if (!imgs.length) setTimeout(go, 50);
  else Promise.all(imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => ((i.onload = r), (i.onerror = r)))))).then(go);
}

/** Ticket de caisse (imprimante 58/80 mm ou A4). */
export function receiptHtml(sale: Sale, s: Settings, opts: { logo?: string | null; seller?: string; change?: number } = {}) {
  const lines = sale.items
    .map((l) => `<tr><td>${esc(l.name)}<br><small>${l.qty} × ${f(l.unit_price)}${l.discount ? ` − ${f(l.discount)}` : ""}</small></td><td class="r">${f(lineTotal(l))}</td></tr>`)
    .join("");
  const pays = sale.payments.map((p) => `<tr><td>${PAY_METHODS[p.method]}${p.ref ? ` (${esc(p.ref)})` : ""}</td><td class="r">${f(p.amount)}</td></tr>`).join("");
  const due = dueOf(sale);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Reçu ${esc(sale.number)}</title><style>
@page{margin:6mm}body{font:12px/1.4 system-ui,sans-serif;color:#000;max-width:300px;margin:0 auto}
h1{font-size:16px;margin:4px 0;text-align:center}.c{text-align:center}.r{text-align:right;white-space:nowrap}
table{width:100%;border-collapse:collapse}td{padding:3px 0;vertical-align:top}small{color:#444}
.t td{border-top:1px dashed #000;font-weight:700;font-size:14px;padding-top:6px}hr{border:0;border-top:1px dashed #000}
img{display:block;margin:0 auto 4px;max-width:70px;max-height:70px}</style></head><body>
${opts.logo ? `<img src="${esc(opts.logo)}" alt="">` : ""}<h1>${esc(s.name)}</h1>
<p class="c">${[s.address, s.phone].filter(Boolean).map(esc).join("<br>")}</p><hr>
<p>Reçu <b>${esc(sale.number)}</b>${sale.invoice_number ? ` · Facture ${esc(sale.invoice_number)}` : ""}<br>${new Date(sale.at).toLocaleString("fr-FR")}${opts.seller ? `<br>Vendeur : ${esc(opts.seller)}` : ""}${sale.customer_name ? `<br>Client : ${esc(sale.customer_name)}` : ""}</p>
<table>${lines}${sale.discount ? `<tr><td>Remise</td><td class="r">− ${f(sale.discount)}</td></tr>` : ""}<tr class="t"><td>TOTAL</td><td class="r">${f(sale.total)}</td></tr></table>
<hr><table>${pays}${opts.change ? `<tr><td>Monnaie rendue</td><td class="r">${f(opts.change)}</td></tr>` : ""}${refundedOf(sale) ? `<tr><td>Retours</td><td class="r">− ${f(refundedOf(sale))}</td></tr>` : ""}${due ? `<tr><td><b>Reste à payer</b></td><td class="r"><b>${f(due)}</b></td></tr>` : ""}</table>
${sale.status === "annulee" ? `<p class="c"><b>VENTE ANNULÉE</b></p>` : ""}<hr><p class="c">${esc(s.receipt_note || "Merci !")}</p><p class="c"><small>MiniSoft Shop</small></p></body></html>`;
}

/** Facture A4 (impression ou « Enregistrer en PDF » du navigateur). */
export function invoiceHtml(sale: Sale, s: Settings, opts: { logo?: string | null; customer?: { name: string; phone: string; address: string } | null } = {}) {
  const rows = sale.items.map((l) => `<tr><td>${esc(l.name)}</td><td class="r">${l.qty}</td><td class="r">${f(l.unit_price)}</td><td class="r">${l.discount ? f(l.discount) : "—"}</td><td class="r">${f(lineTotal(l))}</td></tr>`).join("");
  const due = dueOf(sale);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Facture ${esc(sale.invoice_number ?? sale.number)}</title><style>
@page{size:A4;margin:16mm}body{font:12px/1.5 system-ui,sans-serif;color:#0f172a}
.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}h1{font-size:26px;margin:0;color:${esc(s.primary)}}
table{width:100%;border-collapse:collapse;margin-top:18px}th{background:#f1f5f9;text-align:left;padding:8px}td{padding:8px;border-bottom:1px solid #e2e8f0}
.r{text-align:right;white-space:nowrap}.tot td{font-weight:700;font-size:14px;border:0}.box{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px}
img{max-height:70px;max-width:140px}small{color:#64748b}</style></head><body>
<div class="top"><div>${opts.logo ? `<img src="${esc(opts.logo)}" alt=""><br>` : ""}<b style="font-size:16px">${esc(s.name)}</b><br>${[s.address, s.phone, s.email].filter(Boolean).map(esc).join("<br>")}</div>
<div style="text-align:right"><h1>FACTURE</h1><b>N° ${esc(sale.invoice_number ?? "—")}</b><br>Date : ${new Date(sale.at).toLocaleDateString("fr-FR")}<br><small>Vente ${esc(sale.number)}</small></div></div>
${opts.customer ? `<div class="box" style="margin-top:18px;max-width:300px"><small>Client</small><br><b>${esc(opts.customer.name)}</b><br>${[opts.customer.phone, opts.customer.address].filter(Boolean).map(esc).join("<br>")}</div>` : ""}
<table><thead><tr><th>Article</th><th class="r">Qté</th><th class="r">Prix unitaire</th><th class="r">Remise</th><th class="r">Montant</th></tr></thead><tbody>${rows}</tbody></table>
<table style="max-width:320px;margin-left:auto"><tr><td>Sous-total</td><td class="r">${f(sale.subtotal)}</td></tr>${sale.discount ? `<tr><td>Remise</td><td class="r">− ${f(sale.discount)}</td></tr>` : ""}<tr class="tot"><td>Total</td><td class="r">${f(sale.total)}</td></tr>
<tr><td>Payé</td><td class="r">${f(paidOf(sale))}</td></tr>${refundedOf(sale) ? `<tr><td>Retours</td><td class="r">− ${f(refundedOf(sale))}</td></tr>` : ""}${due ? `<tr><td><b>Reste à payer</b></td><td class="r"><b>${f(due)}</b></td></tr>` : ""}</table>
<p><small>Paiement : ${sale.payments.map((p) => `${PAY_METHODS[p.method]} ${f(p.amount)}`).join(", ") || "à régler"}. Montants en francs CFA (XAF).</small></p>
${sale.status === "annulee" ? `<p><b>Cette vente a été annulée.</b></p>` : ""}<p style="margin-top:30px"><small>${esc(s.receipt_note)} — Document généré par MiniSoft Shop.</small></p></body></html>`;
}

/** Texte à partager (WhatsApp, SMS) pour un reçu. */
export function receiptText(sale: Sale, s: Settings) {
  return [`${s.name} — reçu ${sale.number}`, ...sale.items.map((l) => `• ${l.name} × ${l.qty} : ${f(lineTotal(l))}`), `Total : ${f(sale.total)}`, dueOf(sale) ? `Reste à payer : ${f(dueOf(sale))}` : "Payé. Merci !"].join("\n");
}
