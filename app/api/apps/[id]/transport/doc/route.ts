import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { has } from "@/lib/team";
import { invoicePdf, reportPdf } from "@/lib/transport/pdf";
import { SupabaseStore } from "@/lib/transport/supabase-store";
import { monthRange, settingsOf, type Doc, type Order, type Transaction } from "@/lib/transport/model";
import { transportContext } from "../route";

type Ctx = { params: Promise<{ id: string }> };

/** Facture d'une commande ou rapport journalier / mensuel en PDF (postes « Livraisons » ou « Finances »). */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const u = new URL(req.url);
  const q = z.object({ mode: z.enum(["demo", "live"]).default("live"), kind: z.enum(["invoice", "day", "month"]), id: z.string().max(64).optional(), date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).optional() }).parse({ mode: u.searchParams.get("mode") ?? undefined, kind: u.searchParams.get("kind"), id: u.searchParams.get("id") ?? undefined, date: u.searchParams.get("date") ?? undefined });
  const ctx = await transportContext(id, q.mode);
  const store = new SupabaseStore(id, q.mode === "demo", ctx.profile.id);
  const settings = settingsOf((await store.list("settings"))[0], ctx.project.name);
  let pdf: Buffer, name: string;
  if (q.kind === "invoice") {
    if (!has(ctx.perms, ["livraisons", "finances"])) throw new HttpError(403, "Les factures ne font pas partie de votre poste.");
    const d = q.id ? ((await store.get("order", q.id)) as Doc<Order> | null) : null;
    if (!d) throw new HttpError(404, "Commande introuvable.");
    pdf = invoicePdf(d.data, settings);
    name = `facture-${d.data.number}`;
  } else {
    if (!has(ctx.perms, ["finances", "rapports"])) throw new HttpError(403, "Les rapports ne font pas partie de votre poste.");
    const date = q.date ?? new Date().toISOString().slice(0, 10);
    const range = q.kind === "day" ? { from: date.slice(0, 10), to: date.slice(0, 10) } : monthRange(date.slice(0, 7));
    pdf = reportPdf(q.kind === "day" ? "RAPPORT JOURNALIER" : "RAPPORT MENSUEL", range.from, range.to, (await store.list("order")) as Doc<Order>[], (await store.list("transaction")) as Doc<Transaction>[], settings);
    name = `rapport-${q.kind === "day" ? range.from : date.slice(0, 7)}`;
  }
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
});
