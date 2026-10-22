import { NextResponse } from "next/server";
import { assertSameOrigin, route } from "@/lib/api";
import { HttpError } from "@/lib/access";
import { adminClient } from "@/lib/supabase/admin";
import { adminAudit, assertAdminApi } from "@/lib/admin";
import { PAYMENT_PROVIDERS } from "@/lib/payments";

type Ctx = { params: Promise<{ paymentId: string }> };

/** Remboursement : uniquement via un prestataire qui le permet, jamais par simple changement de statut. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const admin = await assertAdminApi();
  const { paymentId } = await params;
  const db = adminClient();
  const { data: pay } = await db.from("payments").select("id,provider,provider_ref,status,amount_xaf").eq("id", paymentId).maybeSingle();
  if (!pay) throw new HttpError(404, "Paiement introuvable.");
  if (pay.status !== "succeeded") throw new HttpError(409, "Seul un paiement réussi peut être remboursé.");
  const provider = PAYMENT_PROVIDERS.find((p) => p.id === pay.provider);
  if (!provider?.refund || !pay.provider_ref) throw new HttpError(409, "Ce prestataire ne permet pas le remboursement automatique.");
  await provider.refund(pay.provider_ref);
  await db.from("payments").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", pay.id);
  await adminAudit(admin, "payment_refunded", { paymentId, amount: pay.amount_xaf, provider: pay.provider });
  return NextResponse.json({ ok: true });
});
