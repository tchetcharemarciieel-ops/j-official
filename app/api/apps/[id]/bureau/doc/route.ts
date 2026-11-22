import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { has } from "@/lib/team";
import { contractPdf, invoicePdf, quotePdf, receiptPdf } from "@/lib/bureau/pdf";
import { SupabaseStore } from "@/lib/bureau/supabase-store";
import { settingsOf, type Client, type Contract, type Doc, type Invoice, type Quote } from "@/lib/bureau/model";
import { bureauContext } from "../route";

type Ctx = { params: Promise<{ id: string }> };

/** Devis, facture, reçu ou contrat en PDF : réservé aux postes « Documents » ou « Finances ». */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const u = new URL(req.url);
  const q = z.object({ mode: z.enum(["demo", "live"]).default("live"), kind: z.enum(["quote", "invoice", "receipt", "contract"]), id: z.string().min(8).max(64), pid: z.string().max(64).optional() }).parse({ mode: u.searchParams.get("mode") ?? "live", kind: u.searchParams.get("kind"), id: u.searchParams.get("id"), pid: u.searchParams.get("pid") ?? undefined });
  const ctx = await bureauContext(id, q.mode);
  if (!has(ctx.perms, q.kind === "receipt" ? ["documents", "finances"] : "documents") && !has(ctx.perms, "finances")) throw new HttpError(403, "Les documents ne font pas partie de votre poste.");
  const store = new SupabaseStore(id, q.mode === "demo", ctx.profile.id);
  const settings = settingsOf((await store.list("settings"))[0], ctx.project.name);
  const party = async (cid: string | null) => (cid ? (((await store.get("client", cid)) as Doc<Client> | null)?.data ?? null) : null);
  let pdf: Buffer;
  let name: string;
  if (q.kind === "quote") {
    const d = (await store.get("quote", q.id)) as Doc<Quote> | null;
    if (!d) throw new HttpError(404, "Devis introuvable.");
    pdf = quotePdf(d.data, settings, await party(d.data.client_id));
    name = d.data.number;
  } else if (q.kind === "contract") {
    const d = (await store.get("contract", q.id)) as Doc<Contract> | null;
    if (!d) throw new HttpError(404, "Contrat introuvable.");
    pdf = contractPdf(d.data, settings, await party(d.data.client_id));
    name = `contrat-${d.id.slice(0, 8)}`;
  } else {
    const d = (await store.get("invoice", q.id)) as Doc<Invoice> | null;
    if (!d) throw new HttpError(404, "Facture introuvable.");
    if (q.kind === "invoice") {
      pdf = invoicePdf(d.data, settings, await party(d.data.client_id));
      name = d.data.number;
    } else {
      const pay = d.data.payments.find((p) => p.id === q.pid);
      if (!pay) throw new HttpError(404, "Paiement introuvable.");
      pdf = receiptPdf(d.data, pay, settings, await party(d.data.client_id));
      name = pay.receipt;
    }
  }
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${name}.pdf"`, "Cache-Control": "private, no-store" } });
});
