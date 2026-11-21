import { PAY_METHODS, dueOf, lineTotal, paidOf, refundedOf, type Customer, type Sale, type Settings } from "./model";

/**
 * Générateur de PDF minimal (texte seul, police Helvetica, accents français) : la facture est un
 * vrai fichier PDF téléchargeable, sans dépendance externe ni service tiers.
 */

const A4 = { w: 595, h: 842 };
const CP1252: Record<string, number> = { "€": 0x80, "’": 0x92, "‘": 0x91, "“": 0x93, "”": 0x94, "–": 0x96, "—": 0x97, "…": 0x85, "œ": 0x9c, "Œ": 0x8c };

function enc(s: string): Buffer {
  const out: number[] = [];
  for (const ch of s.normalize("NFC").replace(/[  ]/g, " ")) {
    const code = ch.codePointAt(0)!;
    if (CP1252[ch]) out.push(CP1252[ch]!);
    else if (code < 256) out.push(code);
    else out.push(0x3f);
  }
  return Buffer.from(out);
}
const esc = (b: Buffer) => Buffer.from(b.toString("latin1").replace(/([\\()])/g, "\\$1"), "latin1");

type Op = { x: number; y: number; size: number; bold: boolean; text: string; right?: boolean; color?: [number, number, number] };
const textWidth = (s: string, size: number, bold: boolean) => s.length * size * (bold ? 0.56 : 0.52);

class Page {
  ops: Op[] = [];
  lines: { x1: number; y1: number; x2: number; y2: number; w: number; gray: number }[] = [];
  rects: { x: number; y: number; w: number; h: number; rgb: [number, number, number] }[] = [];
  text(x: number, y: number, text: string, size = 10, bold = false, right = false, color?: [number, number, number]) {
    this.ops.push({ x, y, size, bold, text, right, color });
  }
  line(x1: number, y: number, x2: number, gray = 0.85, w = 0.6) {
    this.lines.push({ x1, y1: y, x2, y2: y, w, gray });
  }
  rect(x: number, y: number, w: number, h: number, rgb: [number, number, number]) {
    this.rects.push({ x, y, w, h, rgb });
  }
}

function build(pages: Page[]): Buffer {
  const objs: Buffer[] = [];
  const add = (b: Buffer | string) => (objs.push(typeof b === "string" ? Buffer.from(b, "latin1") : b), objs.length);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  const kids = pages.map((_, i) => `${6 + i * 2} 0 R`).join(" ");
  add(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((pg, i) => {
    const parts: Buffer[] = [];
    for (const r of pg.rects) parts.push(Buffer.from(`${r.rgb.join(" ")} rg ${r.x} ${r.y} ${r.w} ${r.h} re f\n`));
    for (const l of pg.lines) parts.push(Buffer.from(`${l.gray} G ${l.w} w ${l.x1} ${l.y1} m ${l.x2} ${l.y2} l S\n`));
    for (const o of pg.ops) {
      const x = o.right ? o.x - textWidth(o.text, o.size, o.bold) : o.x;
      const c = o.color ?? [0.06, 0.09, 0.16];
      parts.push(Buffer.from(`BT ${c.join(" ")} rg /${o.bold ? "F2" : "F1"} ${o.size} Tf ${x.toFixed(2)} ${o.y} Td (`), esc(enc(o.text)), Buffer.from(") Tj ET\n"));
    }
    const content = Buffer.concat(parts);
    const cid = add(Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from("\nendstream")]));
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`);
  });
  // Ordre des objets : 1 catalogue, 2 pages, 3-4 polices, puis pour chaque page son contenu (5+2i) et la page (6+2i).
  const header = Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "latin1");
  const chunks: Buffer[] = [header];
  const offsets: number[] = [];
  let pos = header.length;
  objs.forEach((o, i) => {
    offsets.push(pos);
    const b = Buffer.concat([Buffer.from(`${i + 1} 0 obj\n`), o, Buffer.from("\nendobj\n")]);
    chunks.push(b);
    pos += b.length;
  });
  const xref = [`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`, ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

const money = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
const hex = (h: string): [number, number, number] => {
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  const v = m ? parseInt(m[1]!, 16) : 0x2563eb;
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};
const cut = (s: string, size: number, width: number) => {
  let t = s;
  while (t.length > 3 && textWidth(t, size, false) > width) t = t.slice(0, -2);
  return t === s ? s : `${t.trimEnd()}…`;
};

/** Facture A4 : boutique, numéro, client, articles, total, paiements. */
export function invoicePdf(sale: Sale, s: Settings, customer: Pick<Customer, "name" | "phone" | "address"> | null): Buffer {
  const brand = hex(s.primary);
  const pages: Page[] = [];
  let p = new Page();
  pages.push(p);
  p.rect(0, A4.h - 8, A4.w, 8, brand);
  let y = A4.h - 55;
  p.text(40, y, s.name, 18, true);
  const head = [s.address, s.phone, s.email].filter(Boolean);
  head.forEach((l, i) => p.text(40, y - 16 - i * 13, cut(l, 9, 260), 9));
  p.text(A4.w - 40, y, "FACTURE", 24, true, true, brand);
  p.text(A4.w - 40, y - 20, `N° ${sale.invoice_number ?? "—"}`, 11, true, true);
  p.text(A4.w - 40, y - 34, `Date : ${new Date(sale.at).toLocaleDateString("fr-FR")}`, 10, false, true);
  p.text(A4.w - 40, y - 47, `Vente ${sale.number}`, 9, false, true, [0.4, 0.45, 0.55]);
  y -= 100;
  if (customer) {
    p.text(40, y, "Client", 9, false, false, [0.4, 0.45, 0.55]);
    p.text(40, y - 14, customer.name, 11, true);
    [customer.phone, customer.address].filter(Boolean).forEach((l, i) => p.text(40, y - 28 - i * 13, cut(l, 9, 300), 9));
    y -= 70;
  }
  const header = () => {
    p.rect(40, y - 6, A4.w - 80, 22, [0.945, 0.961, 0.976]);
    p.text(48, y, "Article", 9, true);
    p.text(340, y, "Qté", 9, true, true);
    p.text(420, y, "Prix unitaire", 9, true, true);
    p.text(A4.w - 48, y, "Montant", 9, true, true);
    y -= 26;
  };
  header();
  for (const l of sale.items) {
    if (y < 150) {
      p = new Page();
      pages.push(p);
      y = A4.h - 60;
      header();
    }
    p.text(48, y, cut(l.name, 10, 260), 10);
    p.text(340, y, String(l.qty), 10, false, true);
    p.text(420, y, money(l.unit_price), 10, false, true);
    p.text(A4.w - 48, y, money(lineTotal(l)), 10, false, true);
    if (l.discount) p.text(48, y - 11, `Remise : ${money(l.discount)}`, 8, false, false, [0.4, 0.45, 0.55]);
    y -= l.discount ? 28 : 20;
    p.line(40, y + 10, A4.w - 40);
  }
  if (y < 190) {
    p = new Page();
    pages.push(p);
    y = A4.h - 60;
  }
  y -= 10;
  const row = (label: string, value: string, bold = false, color?: [number, number, number]) => {
    p.text(340, y, label, bold ? 12 : 10, bold);
    p.text(A4.w - 48, y, value, bold ? 12 : 10, bold, true, color);
    y -= bold ? 22 : 16;
  };
  row("Sous-total", money(sale.subtotal));
  if (sale.discount) row("Remise", `− ${money(sale.discount)}`);
  row("Total", money(sale.total), true, brand);
  row("Payé", money(paidOf(sale)));
  if (refundedOf(sale)) row("Retours", `− ${money(refundedOf(sale))}`);
  const due = dueOf(sale);
  if (due) row("Reste à payer", money(due), true, [0.7, 0.35, 0]);
  y -= 8;
  const pays = sale.payments.map((x) => `${PAY_METHODS[x.method]} ${money(x.amount)}`).join(", ") || "à régler";
  p.text(40, y, cut(`Paiement : ${pays}. Montants en francs CFA (XAF).`, 9, A4.w - 80), 9, false, false, [0.4, 0.45, 0.55]);
  if (sale.status === "annulee") p.text(40, y - 18, "Cette vente a été annulée.", 11, true, false, [0.75, 0.1, 0.1]);
  p.text(40, 36, cut(`${s.receipt_note || "Merci pour votre achat !"} — Document généré par MiniSoft Shop.`, 8, A4.w - 80), 8, false, false, [0.5, 0.55, 0.65]);
  return build(pages);
}
