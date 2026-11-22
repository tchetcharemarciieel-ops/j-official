import { A4, Page, build, cut, hex } from "../shop/pdf";
import { PAY_METHODS, ORDER_STATUS, TX_CATEGORIES, dueOf, money, paidOf, type Doc, type Order, type Settings, type Transaction } from "./model";

/** Documents PDF : facture de livraison et rapport journalier ou mensuel (texte seul, sans service tiers). */
const GRAY: [number, number, number] = [0.4, 0.45, 0.55];

export function invoicePdf(o: Order, s: Settings): Buffer {
  const brand = hex(s.primary);
  const p = new Page();
  p.rect(0, A4.h - 8, A4.w, 8, brand);
  let y = A4.h - 55;
  p.text(40, y, s.name, 18, true);
  [s.address, s.phone, s.email].filter(Boolean).forEach((l, i) => p.text(40, y - 16 - i * 13, cut(l, 9, 260), 9));
  p.text(A4.w - 40, y, "FACTURE", 24, true, true, brand);
  p.text(A4.w - 40, y - 20, `N° F-${o.number}`, 11, true, true);
  p.text(A4.w - 40, y - 34, `Date : ${new Date(o.at).toLocaleDateString("fr-FR")}`, 10, false, true);
  p.text(A4.w - 40, y - 47, `Suivi : ${o.tracking}`, 9, false, true, GRAY);
  y -= 100;
  p.text(40, y, "Expéditeur", 9, false, false, GRAY);
  p.text(40, y - 14, o.sender.name, 11, true);
  p.text(40, y - 28, o.sender.phone, 9);
  p.text(320, y, "Destinataire", 9, false, false, GRAY);
  p.text(320, y - 14, o.recipient.name, 11, true);
  p.text(320, y - 28, o.recipient.phone, 9);
  y -= 66;
  p.text(40, y, "Enlèvement", 9, false, false, GRAY);
  p.text(40, y - 13, cut(o.pickup.address, 10, 240), 10);
  p.text(320, y, "Livraison", 9, false, false, GRAY);
  p.text(320, y - 13, cut(o.dropoff.address, 10, 240), 10);
  y -= 46;
  p.text(40, y, cut(`Colis : ${o.parcel.desc}${o.parcel.weight_kg ? ` · ${o.parcel.weight_kg} kg` : ""}${o.parcel.dims ? ` · ${o.parcel.dims}` : ""}`, 10, A4.w - 80), 10);
  y -= 30;
  p.rect(40, y - 6, A4.w - 80, 22, [0.945, 0.961, 0.976]);
  p.text(48, y, "Désignation", 9, true);
  p.text(A4.w - 48, y, "Montant", 9, true, true);
  y -= 26;
  const lines = o.price_lines.filter((l) => l.amount !== 0);
  for (const l of lines.length ? lines : [{ label: "Livraison", amount: o.price }]) {
    p.text(48, y, cut(l.label, 10, 380), 10);
    p.text(A4.w - 48, y, money(l.amount, s.currency), 10, false, true);
    y -= 18;
    p.line(40, y + 10, A4.w - 40);
  }
  y -= 10;
  const row = (label: string, value: string, bold = false, color?: [number, number, number]) => { p.text(340, y, label, bold ? 12 : 10, bold); p.text(A4.w - 48, y, value, bold ? 12 : 10, bold, true, color); y -= bold ? 22 : 16; };
  row("Total", money(o.price, s.currency), true, brand);
  row("Payé", money(paidOf(o), s.currency));
  const due = dueOf(o);
  if (due) row("Reste à payer", money(due, s.currency), true, [0.7, 0.35, 0]);
  y -= 8;
  const pays = o.payments.filter((x) => x.status === "confirme").map((x) => `${PAY_METHODS[x.method]} ${money(x.amount, s.currency)}${x.ref ? ` (${x.ref})` : ""}`).join(", ") || "à régler";
  p.text(40, y, cut(`Paiement : ${pays}. Statut de la commande : ${ORDER_STATUS[o.status]}.`, 9, A4.w - 80), 9, false, false, GRAY);
  p.text(40, 36, cut(`${s.invoice_note || "Merci de votre confiance."} — Document généré par MiniSoft Transport & Delivery.`, 8, A4.w - 80), 8, false, false, [0.5, 0.55, 0.65]);
  return build([p]);
}

/** Rapport de la période : recettes, dépenses et résultat par catégorie, livraisons de la période. */
export function reportPdf(title: string, from: string, to: string, orders: Doc<Order>[], txs: Doc<Transaction>[], s: Settings): Buffer {
  const brand = hex(s.primary);
  const list = txs.filter((t) => t.data.date >= from && t.data.date <= to).sort((a, b) => a.data.date.localeCompare(b.data.date));
  const inP = (t: Doc<Order>) => t.data.at.slice(0, 10) >= from && t.data.at.slice(0, 10) <= to;
  const ords = orders.filter(inP);
  const income = list.filter((t) => t.data.type === "recette").reduce((a, t) => a + t.data.amount, 0);
  const expense = list.filter((t) => t.data.type === "depense").reduce((a, t) => a + t.data.amount, 0);
  const pages: Page[] = [];
  let p = new Page();
  pages.push(p);
  p.rect(0, A4.h - 8, A4.w, 8, brand);
  let y = A4.h - 55;
  p.text(40, y, s.name, 18, true);
  p.text(A4.w - 40, y, title, 20, true, true, brand);
  p.text(A4.w - 40, y - 18, `Du ${new Date(from).toLocaleDateString("fr-FR")} au ${new Date(to).toLocaleDateString("fr-FR")}`, 10, false, true);
  y -= 60;
  const kv = (l: string, v: string, bold = false) => { p.text(48, y, l, 10, bold); p.text(A4.w - 48, y, v, 10, bold, true); y -= 17; };
  p.text(40, y, "Livraisons", 12, true); y -= 20;
  kv("Commandes enregistrées", String(ords.length));
  kv("Livrées", String(ords.filter((o) => o.data.status === "livre").length));
  kv("Annulées", String(ords.filter((o) => o.data.status === "annule").length));
  kv("Échecs et retours", String(ords.filter((o) => o.data.status === "echec" || o.data.status === "retour").length));
  y -= 10;
  p.text(40, y, "Finances", 12, true); y -= 20;
  kv("Recettes", money(income, s.currency));
  kv("Dépenses", money(expense, s.currency));
  kv("Résultat", money(income - expense, s.currency), true);
  y -= 10;
  const cats = new Map<string, { i: number; o: number }>();
  for (const t of list) { const e = cats.get(t.data.category) ?? { i: 0, o: 0 }; if (t.data.type === "recette") e.i += t.data.amount; else e.o += t.data.amount; cats.set(t.data.category, e); }
  p.text(40, y, "Par catégorie", 12, true); y -= 20;
  for (const [k, v] of cats) { p.text(48, y, TX_CATEGORIES[k as keyof typeof TX_CATEGORIES] ?? k, 10); p.text(380, y, v.i ? money(v.i, s.currency) : "—", 10, false, true); p.text(A4.w - 48, y, v.o ? money(v.o, s.currency) : "—", 10, false, true); y -= 16; }
  if (!cats.size) { p.text(48, y, "Aucune écriture sur la période.", 10, false, false, GRAY); y -= 16; }
  y -= 14;
  p.text(40, y, "Journal", 12, true); y -= 20;
  for (const t of list) {
    if (y < 70) { p = new Page(); pages.push(p); y = A4.h - 60; }
    p.text(48, y, new Date(t.data.date).toLocaleDateString("fr-FR"), 9);
    p.text(110, y, cut(t.data.description || TX_CATEGORIES[t.data.category], 9, 250), 9);
    p.text(A4.w - 48, y, `${t.data.type === "recette" ? "+" : "−"} ${money(t.data.amount, s.currency)}`, 9, false, true);
    y -= 14;
  }
  p.text(40, 36, "Rapport généré par MiniSoft Transport & Delivery à partir des écritures enregistrées.", 8, false, false, [0.5, 0.55, 0.65]);
  return build(pages);
}
