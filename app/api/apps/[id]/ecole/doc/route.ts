import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { has } from "@/lib/team";
import { bulletinPdf, receiptPdf } from "@/lib/ecole/pdf";
import { SupabaseStore } from "@/lib/ecole/supabase-store";
import { annualReport, settingsOf, termReport, type Assign, type Attendance, type Doc, type Exam, type Guardian, type Invoice, type Klass, type Student, type Subject, type Year } from "@/lib/ecole/model";
import { isParentOnly, visibleData } from "@/lib/ecole/visibility";
import { ecoleContext } from "../route";

type Ctx = { params: Promise<{ id: string }> };

/** Bulletin ou reçu en PDF. Chaque personne ne reçoit que les documents qu'elle a le droit de voir (le parent : ses enfants). */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const u = new URL(req.url);
  const q = z.object({ mode: z.enum(["demo", "live"]).default("live"), kind: z.enum(["bulletin", "receipt"]), id: z.string().max(64), term: z.string().regex(/^(\d{1,2}|annuel)$/).optional(), pid: z.string().max(64).optional() })
    .parse({ mode: u.searchParams.get("mode") ?? undefined, kind: u.searchParams.get("kind"), id: u.searchParams.get("id"), term: u.searchParams.get("term") ?? undefined, pid: u.searchParams.get("pid") ?? undefined });
  const ctx = await ecoleContext(id, q.mode);
  const store = new SupabaseStore(id, q.mode === "demo", ctx.profile.id);
  const all = await store.all();
  const settings = settingsOf(all.settings[0], ctx.project.name);
  const seen = visibleData(all, ctx.profile.id, ctx.perms);
  const parent = isParentOnly(ctx.perms);
  let pdf: Buffer, name: string;
  if (q.kind === "bulletin") {
    // Un bulletin contient toutes les matières : direction, secrétariat (bulletins + élèves) ou parent de l'élève seulement.
    if (!parent && !(has(ctx.perms, "classes") || (has(ctx.perms, "bulletins") && has(ctx.perms, "eleves")))) throw new HttpError(403, "Les bulletins ne font pas partie de votre poste.");
    // L'élève doit être visible par la personne ; les moyennes et rangs sont calculés sur toute la classe côté serveur.
    const st = (seen.student as Doc<Student>[]).find((x) => x.id === q.id);
    if (!st) throw new HttpError(404, "Élève introuvable.");
    const klass = (all.class as Doc<Klass>[]).find((k) => k.id === st.data.class_id);
    if (!klass) throw new HttpError(404, "Classe introuvable.");
    const common = { klass, students: all.student as Doc<Student>[], assigns: all.assign as Doc<Assign>[], exams: all.exam as Doc<Exam>[], settings };
    const term = q.term ?? "1";
    const report = term === "annuel" ? annualReport(common) : termReport({ ...common, term: Number(term) });
    const row = report.rows.find((r) => r.student_id === st.id);
    if (!row) throw new HttpError(404, "Aucune note pour cet élève.");
    const year = (all.year as Doc<Year>[]).find((y) => y.id === klass.data.year_id)?.data.name ?? "";
    pdf = bulletinPdf({ student: st, klass, row, size: report.stats.graded, stats: report.stats, subjects: all.subject as Doc<Subject>[], label: term === "annuel" ? "Moyenne annuelle" : `${settings.term_label} ${term}`, year, attendance: (all.attendance as Doc<Attendance>[]).filter((a) => a.data.class_id === klass.id), settings });
    name = `bulletin-${st.data.matricule}-${term}`;
  } else {
    if (!parent && !has(ctx.perms, "finances")) throw new HttpError(403, "Les reçus ne font pas partie de votre poste.");
    const inv = (seen.invoice as Doc<Invoice>[]).find((i) => i.id === q.id);
    const pay = inv?.data.payments.find((p) => p.id === q.pid);
    if (!inv || !pay) throw new HttpError(404, "Reçu introuvable.");
    pdf = receiptPdf(inv, pay, (all.student as Doc<Student>[]).find((s) => s.id === inv.data.student_id), (all.class as Doc<Klass>[]).find((k) => k.id === (all.student as Doc<Student>[]).find((s) => s.id === inv.data.student_id)?.data.class_id), settings);
    name = pay.receipt;
  }
  void (all.guardian as Doc<Guardian>[]);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
});
