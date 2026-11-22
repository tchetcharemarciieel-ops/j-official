import { route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { clientIp } from "@/lib/client-ip";
import { invoicePdf } from "@/lib/transport/pdf";
import { orderForInvoice, publicCompany } from "@/lib/transport/public";
import { limited } from "@/lib/venue/public";

type Ctx = { params: Promise<{ slug: string }> };

/** Facture PDF : numéro de suivi + téléphone de l'expéditeur ou du destinataire de la commande. */
export const GET = route(async (req, { params }: Ctx) => {
  const { slug } = await params;
  if (limited(`tr-inv:${clientIp(req)}`, 10)) throw new HttpError(429, "Trop d'essais : patientez une minute.");
  const u = new URL(req.url);
  const p = await publicCompany(slug, false);
  const o = await orderForInvoice(p, u.searchParams.get("n") ?? "", u.searchParams.get("p") ?? "");
  if (!o) throw new HttpError(404, "Commande introuvable. Vérifiez le numéro de suivi et le téléphone utilisé pour la commande.");
  return new Response(new Uint8Array(invoicePdf(o.data, p.settings)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="facture-${o.data.number}.pdf"`, "Cache-Control": "private, no-store" } });
});
