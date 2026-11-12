import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * SasPay : paiement des formules MiniSoft (abonnements), d'après la documentation officielle
 * (https://docs.saspay.me, spécification OpenAPI). Règles :
 * - la clé secrète (`SASPAY_SECRET_KEY`, scope « Encaissement ») reste sur le serveur ;
 * - une formule n'est activée que si SasPay confirme le paiement (`GET /payments/{id}/verify/`
 *   renvoie `SUCCESS`), au bon montant et en XAF — jamais sur la seule parole du navigateur ni
 *   sur une notification seule.
 */

export const SASPAY_BASE = (process.env.SASPAY_API_BASE || "https://api.saspay.me/api/v1").replace(/\/$/, "");
export const saspayKey = () => {
  const k = (process.env.SASPAY_SECRET_KEY || "").trim();
  return /^sk_(test|live)_[A-Za-z0-9_-]{8,200}$/.test(k) ? k : null;
};

export class SasPayError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export type SasCheckout = {
  id: string;
  checkout_url: string;
  amount: string;
  currency: string;
  status: string;
  metadata?: Record<string, unknown>;
  transaction?: string | null;
};
export type SasSessionStatus = { id: string; status: string; transaction_id: string | null; transaction_status: string | null; transaction_reference?: string | null };
export type SasTransaction = { id: string; reference?: string; status: string; requested_amount: string; net_amount?: string; debited_amount?: string; currency: string; flow_direction?: string };

const MESSAGES: Record<string, string> = {
  api_key_scope_forbidden: "La clé SasPay n'a pas le droit d'encaisser (choisissez « Encaissement »).",
  merchant_suspended: "Le compte SasPay est suspendu.",
};

async function call<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const key = saspayKey();
  if (!key) throw new SasPayError(503, "not_configured", "Le paiement en ligne n'est pas encore configuré.");
  let res: Response;
  try {
    res = await fetch(`${SASPAY_BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${key}`, accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SasPayError(502, "unreachable", "SasPay ne répond pas pour le moment. Réessayez dans un instant.");
  }
  const text = await res.text().catch(() => "");
  let body: Record<string, unknown> | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new SasPayError(502, "unreachable", "SasPay est injoignable pour le moment. Réessayez plus tard.");
  }
  if (!res.ok || body?.success === false) {
    const err = (body?.error ?? body) as { code?: string; message?: string } | null;
    const code = typeof err?.code === "string" ? err.code : `http_${res.status}`;
    throw new SasPayError(res.status, code, MESSAGES[code] ?? (typeof err?.message === "string" ? err.message : `SasPay a refusé la demande (${res.status}).`));
  }
  // Enveloppe documentée { success, data, code } ; certains exemples montrent l'objet directement.
  return (body && "data" in body && body.data && typeof body.data === "object" ? body.data : body) as T;
}

export const saspay = {
  createCheckout: (p: { amount: number; currency: "XAF"; description: string; customer_email: string; customer_name: string; return_url: string; metadata: Record<string, string> }) =>
    call<SasCheckout>("/checkout-sessions/", { method: "POST", body: { ...p, amount: `${Math.round(p.amount)}.00` } }),
  sessionStatus: (id: string) => call<SasSessionStatus>(`/checkout-sessions/${encodeURIComponent(id)}/status/`),
  verify: (paymentId: string) => call<SasTransaction>(`/payments/${encodeURIComponent(paymentId)}/verify/`),
};

/** Signature des webhooks : X-Webhook-Signature = hex HMAC-SHA256(secret, `${timestamp}.${corps brut}`), 5 min de tolérance. */
export function validSasSignature(rawBody: string, signature: string | null, timestamp: string | null, secret: string, now = Date.now()) {
  if (!signature || !timestamp || !/^\d{9,12}$/.test(timestamp)) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  const got = signature.trim().toLowerCase();
  return got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

/** Montant SasPay (« 15000.00 ») en FCFA entiers ; NaN si illisible. */
export const sasAmount = (s: string | number | null | undefined) => (typeof s === "number" ? s : Number.parseFloat(String(s ?? "")));
