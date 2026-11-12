import "server-only";
import { createECDH, createHash } from "node:crypto";
import webpush from "web-push";
import { SITE_URL } from "./config";

/**
 * Notifications push (écran verrouillé) via le standard Web Push. Clés VAPID : variables
 * VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY si présentes, sinon dérivées du secret serveur (stables tant
 * que ce secret ne change pas). La clé privée ne quitte jamais le serveur.
 */
export type PushSub = { endpoint: string; keys: { p256dh: string; auth: string } };

let cached: { publicKey: string; privateKey: string } | null = null;
export function vapidKeys() {
  if (cached) return cached;
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (pub && priv) return (cached = { publicKey: pub, privateKey: priv });
  const base = process.env.PAYMENT_SECRETS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_GATEWAY_KEY;
  if (!base) return null;
  const seed = createHash("sha256").update(`minisoft:vapid:${base}`).digest();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(seed);
  return (cached = { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: seed.toString("base64url") });
}

export const validSub = (s: unknown): s is PushSub => {
  const x = s as PushSub;
  return Boolean(x && typeof x.endpoint === "string" && /^https:\/\//.test(x.endpoint) && x.endpoint.length < 1000 && typeof x.keys?.p256dh === "string" && typeof x.keys?.auth === "string" && x.keys.p256dh.length < 200 && x.keys.auth.length < 100);
};

/** Envoie une notification ; renvoie "gone" si l'abonnement n'existe plus (à supprimer). */
export async function sendPush(sub: PushSub, payload: { title: string; body: string; url: string; tag?: string }): Promise<"ok" | "gone" | "error"> {
  const k = vapidKeys();
  if (!k) return "error";
  try {
    const subject = /^https:\/\//.test(SITE_URL) ? SITE_URL : "https://minisoft-rca.onrender.com";
    await webpush.sendNotification(sub, JSON.stringify(payload), { vapidDetails: { subject, publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 3600, urgency: "high", timeout: 10_000 });
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "error";
  }
}
