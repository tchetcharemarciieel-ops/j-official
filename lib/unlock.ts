import "server-only";
import { adminClient } from "./supabase/admin";

/**
 * Logiciel verrouillé : un compte en formule gratuite voit son logiciel généré (flouté) mais ne
 * peut pas l'utiliser avant de choisir une formule qui le débloque (formule avec publication).
 * Les logiciels créés avant la mise en place du verrou restent ouverts ; les administrateurs de
 * la plateforme ne sont jamais bloqués.
 */
export const LOCK_SINCE = "2026-11-11T19:00:00Z";

export async function projectLocked(project: { owner_id: string; created_at: string }): Promise<boolean> {
  if (!project.created_at || project.created_at < LOCK_SINCE) return false;
  const db = adminClient();
  const { data: owner } = await db.from("profiles").select("plan,is_admin").eq("id", project.owner_id).maybeSingle();
  if (!owner || owner.is_admin) return false;
  const { data: plan } = await db.from("plans").select("can_publish").eq("id", owner.plan).maybeSingle();
  return !plan?.can_publish;
}

export const LOCKED_MESSAGE = "Ce logiciel est verrouillé : son propriétaire doit choisir une formule pour le débloquer.";
