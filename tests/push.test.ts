import { createECDH, randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import webpush from "web-push";
vi.mock("server-only", () => ({}));
process.env.PAYMENT_SECRETS_KEY = "cle-de-test-uniquement";
const { vapidKeys, validSub } = await import("@/lib/push");

describe("Notifications push : clés VAPID et abonnement", () => {
  it("dérive des clés VAPID stables et utilisables", () => {
    const k = vapidKeys()!;
    expect(k.publicKey).toMatch(/^[A-Za-z0-9_-]{87}$/);
    expect(vapidKeys()).toEqual(k);
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") } };
    expect(validSub(sub)).toBe(true);
    const req = webpush.generateRequestDetails(sub, JSON.stringify({ title: "t", body: "b" }), { vapidDetails: { subject: "https://minisoft-rca.onrender.com", publicKey: k.publicKey, privateKey: k.privateKey } });
    expect(req.headers.Authorization ?? req.headers.authorization).toMatch(/^vapid t=/);
    expect(req.body).toBeTruthy();
  });
  it("refuse un abonnement invalide", () => {
    expect(validSub({ endpoint: "http://x", keys: { p256dh: "a", auth: "b" } })).toBe(false);
    expect(validSub({ endpoint: "https://x" })).toBe(false);
  });
});
