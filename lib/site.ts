import "server-only";
import { getSetting } from "./settings";

/** Personnalisation publique de la plateforme (réglée dans l'administration, cache de 30 s). */
export async function getSite() {
  const [branding, home, announcement, contact, faq, templates] = await Promise.all([getSetting("branding"), getSetting("home"), getSetting("announcement"), getSetting("contact"), getSetting("faq"), getSetting("templates")]);
  return { branding, home, announcement, contact, faq, templates };
}

/** Modèles proposés aux clients (ceux désactivés par l'administration sont masqués). */
export async function enabledTemplateIds(): Promise<Set<string> | null> {
  const t = await getSetting("templates");
  return t.disabled.length ? new Set(t.disabled) : null;
}
