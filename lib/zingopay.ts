import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { adminClient } from "./supabase/admin";

/**
 * ZingoPay (ALETCHCARD) : paiement en ligne au montant exact de la commande, d'après la
 * documentation officielle (/developpeurs). Règles :
 * - chaque restaurant a sa propre clé secrète (l'argent va sur son compte) ;
 * - la clé reste sur le serveur, chiffrée, jamais envoyée au navigateur ;
 * - seule une lecture du statut auprès de ZingoPay (`status: "paid"`) marque une commande payée,
 *   jamais la parole du téléphone du client ni une notification seule.
 */

export const ZP_BASE = (process.env.ZINGOPAY_API_BASE || "https://www.zingopay.org").replace(/\/$/, "");
export const KEY_RE = /^zp_(test|live)_[A-Za-z0-9_-]{16,128}$/;

export type ZpPayment = {
  id: string;
  reference: string | null;
  amount_xaf: number;
  description?: string | null;
  status: "pending" | "paid" | "expired" | "cancelled";
  expires_at: string | null;
  paid_at: string | null;
  payment_reference: string | null;
  pay_url?: string;
};

export class ZpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const MESSAGES: Record<string, string> = {
  invalid_api_key: "Clé ZingoPay refusée : vérifiez la clé secrète du restaurant.",
  merchant_not_ready: "Le compte ZingoPay du restaurant n'est pas encore prêt à encaisser.",
  invalid_amount: "Montant refusé par ZingoPay (entre 100 et 1 000 000 FCFA).",
  invalid_reference: "Référence de commande refusée par ZingoPay.",
  reference_conflict: "Cette commande a déjà un paiement ZingoPay d'un autre montant.",
  not_found: "Paiement ZingoPay introuvable.",
  rate_limited: "ZingoPay reçoit trop de demandes : réessayez dans un instant.",
};

async function call<T>(key: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ZP_BASE}${path}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${key}`, accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}) },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ZpError(502, "unreachable", "ZingoPay ne répond pas pour le moment : réessayez ou payez à la caisse.");
  }
  const text = await res.text().catch(() => "");
  let body: (T & { error?: { code?: string; message?: string } }) | null = null;
  try {
    body = JSON.parse(text);
  } catch {
    // Réponse non JSON (page d'erreur de l'hébergeur) : ZingoPay injoignable à cette adresse.
    throw new ZpError(502, "unreachable", "ZingoPay est injoignable pour le moment. Réessayez plus tard ou payez à la caisse.");
  }
  if (!res.ok) {
    const code = body?.error?.code ?? `http_${res.status}`;
    throw new ZpError(res.status, code, MESSAGES[code] ?? body?.error?.message ?? `ZingoPay a refusé la demande (${res.status}).`);
  }
  return body as T;
}

export const zp = {
  create: (key: string, p: { amount: number; reference: string; description?: string; expires_in_minutes?: number }) => call<ZpPayment>(key, "/api/v1/payments", { method: "POST", body: p }),
  get: (key: string, id: string) => call<ZpPayment>(key, `/api/v1/payments/${encodeURIComponent(id)}`),
  byReference: async (key: string, reference: string) => {
    const r = await call<ZpPayment | { data?: ZpPayment[] }>(key, `/api/v1/payments?reference=${encodeURIComponent(reference)}`);
    return "data" in r && Array.isArray(r.data) ? (r.data[0] ?? null) : (r as ZpPayment);
  },
  /** Vérifie la clé (liste des derniers paiements encaissés). */
  check: (key: string) => call<{ data?: unknown[] }>(key, "/api/v1/payments"),
  cancel: (key: string, id: string) => call<ZpPayment>(key, `/api/v1/payments/${encodeURIComponent(id)}/cancel`, { method: "POST" }),
};

/** Signature ZingoPay-Signature: t=<unix>,v1=<hex> = HMAC-SHA256(secret, `${t}.${corps brut}`), 5 minutes de tolérance. */
export function validSignature(rawBody: string, header: string | null, secret: string, now = Date.now()) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  const v1 = parts.v1 ?? "";
  if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  return v1.length === expected.length && timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}

/** Référence ZingoPay d'une commande : identifiant unique, avec le jeu de données (réel ou démonstration). */
export const orderReference = (orderId: string, demo: boolean) => `${demo ? "msd" : "ms"}-${orderId}`;
export function parseReference(ref: string | null | undefined): { orderId: string; demo: boolean } | null {
  const m = /^(msd?)-([0-9a-f-]{36})$/i.exec(ref ?? "");
  return m ? { orderId: m[2]!.toLowerCase(), demo: m[1]!.toLowerCase() === "msd" } : null;
}

// ---------- Clés du restaurant (chiffrées) ----------

function encKey() {
  const base = process.env.PAYMENT_SECRETS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_GATEWAY_KEY;
  if (!base) throw new Error("Aucun secret serveur pour chiffrer les clés de paiement.");
  return createHash("sha256").update(`minisoft:payment-providers:${base}`).digest();
}
export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${data.toString("base64url")}`;
}
export function unseal(sealed: string | null | undefined): string | null {
  if (!sealed) return null;
  try {
    const [v, iv, tag, data] = sealed.split(".");
    if (v !== "v1" || !iv || !tag || !data) return null;
    const d = createDecipheriv("aes-256-gcm", encKey(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
export const keyHint = (key: string) => `${key.slice(0, 8)}…${key.slice(-4)}`;

export type ZpConfig = { apiKey: string; webhookSecret: string | null; mode: "test" | "live"; enabled: boolean; hint: string; updatedAt: string };

export async function zpConfig(projectId: string): Promise<ZpConfig | null> {
  const { data } = await adminClient().from("payment_providers").select("*").eq("project_id", projectId).eq("provider", "zingopay").maybeSingle();
  if (!data) return null;
  const apiKey = unseal(data.api_key_enc as string);
  if (!apiKey) return null;
  return { apiKey, webhookSecret: unseal(data.webhook_secret_enc as string | null), mode: data.mode as "test" | "live", enabled: Boolean(data.enabled), hint: String(data.key_hint ?? ""), updatedAt: String(data.updated_at) };
}
