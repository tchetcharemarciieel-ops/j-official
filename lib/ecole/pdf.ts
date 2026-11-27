import { A4, Page, build, cut, hex } from "../shop/pdf";
import { PAY_METHODS, attendanceStats, dueOf, money, paidOf, studentName, type Attendance, type Doc, type Invoice, type Klass, type Payment, type Row, type Settings, type Student, type Subject } from "./model";

const GRAY: [number, number, number] = [0.4, 0.45, 0.55];

function header(p: Page, s: Settings, title: string, sub: string) {
  const brand = hex(s.primary);
  p.rect(0, A4.h - 8, A4.w, 8, brand);
  const y = A4.h - 55;
  p.text(40, y, cut(s.name, 18, 330), 18, true);
  [s.address, [s.phone, s.email].filter(Boolean).join(" · ")].filter(Boolean).forEach((l, i) => p.text(40, y - 16 - i * 13, cut(l, 9, 300), 9));
  p.text(A4.w - 40, y, title, 20, true, true, brand);
  p.text(A4.w - 40, y - 18, sub, 10, false, true, GRAY);
  return { brand, y: y - 70 };
}

/** Bulletin d'un élève pour une période (ou l'année) : notes par matière, moyenne générale, rang, mention, présences. Texte seul, sans service tiers. */
export function bulletinPdf(p: { student: Doc<Student>; klass: Doc<Klass>; row: Row; size: number; stats: { mean: number | null; best: number | null; worst: number | null }; subjects: Doc<Subject>[]; label: string; year: string; attendance: Doc<Attendance>[]; settings: Settings }): Buffer {
  const s = p.settings;
  const pg = new Page();
  const { brand, y: y0 } = header(pg, s, "BULLETIN SCOLAIRE", `${p.label} · ${p.year}`);
  let y = y0;
  pg.text(40, y, studentName(p.student.data), 13, true);
  pg.text(40, y - 15, `Matricule ${p.student.data.matricule} · Classe ${p.klass.data.name}${p.student.data.birth_date ? ` · Né(e) le ${new Date(p.student.data.birth_date).toLocaleDateString("fr-FR")}` : ""}`, 9, false, false, GRAY);
  y -= 42;
  pg.rect(40, y - 6, A4.w - 80, 22, [0.945, 0.961, 0.976]);
  pg.text(48, y, "Matière", 9, true);
  pg.text(330, y, "Coef.", 9, true, true);
  pg.text(400, y, `Moyenne /${s.scale}`, 9, true, true);
  pg.text(A4.w - 48, y, "Points", 9, true, true);
  y -= 26;
  for (const l of p.row.subjects) {
    const sub = p.subjects.find((x) => x.id === l.subject_id);
    pg.text(48, y, cut(sub?.data.name ?? "Matière", 10, 250), 10);
    pg.text(330, y, String(l.coef), 10, false, true);
    pg.text(400, y, l.avg === null ? "—" : l.avg.toFixed(2), 10, false, true);
    pg.text(A4.w - 48, y, l.avg === null ? "—" : (l.avg * l.coef).toFixed(2), 10, false, true);
    y -= 17;
    pg.line(40, y + 9, A4.w - 40);
  }
  y -= 14;
  const row = (label: string, value: string, bold = false, color?: [number, number, number]) => { pg.text(300, y, label, bold ? 12 : 10, bold); pg.text(A4.w - 48, y, value, bold ? 12 : 10, bold, true, color); y -= bold ? 22 : 16; };
  row("Moyenne générale", p.row.general === null ? "—" : `${p.row.general.toFixed(2)} / ${s.scale}`, true, brand);
  row("Rang", p.row.rank === null ? "—" : `${p.row.rank}${p.row.rank === 1 ? "er" : "e"} sur ${p.size}`);
  if (p.row.mention) row("Mention", p.row.mention);
  row("Moyenne de la classe", p.stats.mean === null ? "—" : p.stats.mean.toFixed(2));
  if (p.stats.best !== null) row("Meilleure · plus faible", `${p.stats.best.toFixed(2)} · ${p.stats.worst?.toFixed(2)}`);
  const att = attendanceStats(p.attendance, p.student.id);
  if (att.total) row("Présences", `${att.absent} absence(s) · ${att.late} retard(s) sur ${att.total} appel(s)`);
  y -= 20;
  pg.text(40, y, "Appréciation du conseil de classe :", 9, false, false, GRAY);
  pg.rect(40, y - 62, A4.w - 80, 52, [0.975, 0.98, 0.99]);
  y -= 90;
  pg.text(60, y, "Le directeur", 9, false, false, GRAY);
  pg.text(A4.w - 150, y, "Le parent ou tuteur", 9, false, false, GRAY);
  pg.text(40, 36, cut(`${s.bulletin_note || "Document généré par MiniSoft École."}`, 8, A4.w - 80), 8, false, false, [0.5, 0.55, 0.65]);
  return build([pg]);
}

/** Reçu de paiement de scolarité : numéro unique, montant, mode et solde restant. */
export function receiptPdf(inv: Doc<Invoice>, pay: Payment, student: Doc<Student> | undefined, klass: Doc<Klass> | undefined, s: Settings): Buffer {
  const pg = new Page();
  const { brand, y: y0 } = header(pg, s, "REÇU", pay.receipt);
  let y = y0;
  pg.text(40, y, "Reçu de", 9, false, false, GRAY);
  pg.text(40, y - 15, student ? studentName(student.data) : "Élève", 12, true);
  pg.text(40, y - 30, `${student ? `Matricule ${student.data.matricule}` : ""}${klass ? ` · Classe ${klass.data.name}` : ""}`, 9, false, false, GRAY);
  pg.text(A4.w - 40, y, `Date : ${new Date(pay.date).toLocaleDateString("fr-FR")}`, 10, false, true);
  pg.text(A4.w - 40, y - 15, `Facture ${inv.data.number}`, 9, false, true, GRAY);
  y -= 70;
  pg.rect(40, y - 8, A4.w - 80, 52, [0.945, 0.961, 0.976]);
  pg.text(52, y + 20, "Montant reçu", 10, false, false, GRAY);
  pg.text(A4.w - 52, y + 18, money(pay.amount, s.currency), 22, true, true, brand);
  pg.text(52, y, `Mode de paiement : ${PAY_METHODS[pay.method]}${pay.note ? ` · ${cut(pay.note, 9, 220)}` : ""}`, 10);
  y -= 50;
  const row = (label: string, value: string, bold = false) => { pg.text(300, y, label, bold ? 12 : 10, bold); pg.text(A4.w - 48, y, value, bold ? 12 : 10, bold, true); y -= bold ? 22 : 16; };
  row("Total de la facture", money(inv.data.total, s.currency));
  row("Total payé", money(paidOf(inv.data), s.currency));
  row("Reste à payer", money(dueOf(inv.data), s.currency), true);
  if (pay.cancelled) pg.text(40, y - 10, "PAIEMENT ANNULÉ", 14, true, false, [0.8, 0.1, 0.1]);
  pg.text(40, 36, cut(`${s.name} — Reçu généré par MiniSoft École.`, 8, A4.w - 80), 8, false, false, [0.5, 0.55, 0.65]);
  return build([pg]);
}
