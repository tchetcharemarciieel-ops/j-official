import { z } from "zod";
import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { appContext } from "@/lib/app-data";
import { has } from "@/lib/team";
import { runOp } from "@/lib/shop/engine";
import { invoicePdf } from "@/lib/shop/pdf";
import { SupabaseStore } from "@/lib/shop/supabase-store";
import { settingsOf, type Customer, type Doc, type Sale } from "@/lib/shop/model";

type Ctx = { params: Promise<{ id: string }> };

/** Facture PDF d'une vente (numéro de facture créé au premier téléchargement). Lecture réservée aux postes autorisés. */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const url = new URL(req.url);
  const q = z.object({ mode: z.enum(["demo", "live"]).default("live"), sale: z.string().min(8).max(64) }).parse({ mode: url.searchParams.get("mode") ?? "live", sale: url.searchParams.get("sale") });
  const ctx = await appContext(id, q.mode);
  if (ctx.spec.module !== "shop") throw new HttpError(404, "Ce logiciel n'est pas une boutique MiniSoft Shop.");
  if (!has(ctx.perms, ["caisse", "clients", "rapports"])) throw new HttpError(403, "Les factures ne font pas partie de votre poste.");
  const store = new SupabaseStore(id, q.mode === "demo", ctx.profile.id);
  let sale = (await store.get("sale", q.sale)) as Doc<Sale> | null;
  if (!sale) throw new HttpError(404, "Vente introuvable.");
  if (!sale.data.invoice_number) {
    await runOp({ store, actor: { id: ctx.profile.id, role: ctx.role }, perms: ctx.perms }, "sale.invoice", { sale_id: q.sale });
    sale = (await store.get("sale", q.sale)) as Doc<Sale>;
  }
  const customer = sale.data.customer_id ? ((await store.get("customer", sale.data.customer_id)) as Doc<Customer> | null) : null;
  const settings = settingsOf((await store.list("settings"))[0], ctx.project.name);
  const pdf = invoicePdf(sale.data, settings, customer?.data ?? null);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="facture-${sale.data.invoice_number}.pdf"`, "Cache-Control": "private, no-store" } });
});
