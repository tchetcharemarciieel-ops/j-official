/**
 * Adresse IP du visiteur pour les limites anti-abus. Derrière Cloudflare (Render), `cf-connecting-ip`
 * est fixé par le réseau et ne peut pas être falsifié par le client ; `x-forwarded-for` (dont la
 * première valeur peut être inventée par le client) ne sert qu'en secours.
 */
export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip")?.trim() || req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "inconnue";
}
