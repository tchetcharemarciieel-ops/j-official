import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { HttpError } from "./access";

function isPrivate(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    return v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

/** Refuse les adresses internes (protection SSRF). */
export async function assertPublicUrl(url: string) {
  const u = new URL(url);
  if (u.protocol !== "https:") throw new HttpError(400, "Adresse https:// obligatoire.");
  const host = u.hostname;
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new HttpError(400, "Adresse introuvable.");
  if (addrs.some((a) => isPrivate(a.address))) throw new HttpError(400, "Les adresses internes ne sont pas autorisées.");
}

export async function sendWebhook(url: string, payload: unknown): Promise<{ ok: boolean; status?: number; error?: string }> {
  try {
    await assertPublicUrl(url);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "MiniSoft-RCA-Webhook/1.0" },
      body: JSON.stringify(payload),
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    return { ok: false, status: res.status, error: `Réponse ${res.status} du service distant.` };
  } catch (err) {
    return { ok: false, error: err instanceof HttpError ? err.message : "Service injoignable (délai dépassé ou adresse invalide)." };
  }
}
