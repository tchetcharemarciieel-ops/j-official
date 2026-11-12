import { SITE_URL } from "./config";

/** Adresse publique du site : NEXT_PUBLIC_SITE_URL, sinon l'hôte de la requête (derrière Render). */
export function siteOrigin(req: Request) {
  if (!/localhost|127\.0\.0\.1/.test(SITE_URL)) return SITE_URL;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : SITE_URL;
}
