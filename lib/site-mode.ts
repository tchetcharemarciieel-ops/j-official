/**
 * Version statique du site (hébergeurs sans serveur, ex. Neocities) :
 * accueil, modèles et démo uniquement. Les pages qui exigent un compte renvoient vers la démo.
 */
export const STATIC_SITE = process.env.NEXT_PUBLIC_STATIC_SITE === "1";

export function siteHref(path: string): string {
  if (STATIC_SITE && /^\/(creer|inscription|connexion|espace|admin|projets)/.test(path)) return "/demo";
  return path;
}
