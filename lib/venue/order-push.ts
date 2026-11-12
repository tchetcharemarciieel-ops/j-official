import "server-only";
import { sendPush, type PushSub } from "../push";
import { adminClient } from "../supabase/admin";
import type { Doc } from "./model";
import { publicOrder, TRACK_LABELS, TRACK_STEPS, type FullOrder, type TrackStep } from "./online";

/**
 * Notifications de suivi de commande sur le téléphone du client, même page fermée.
 * L'abonnement push est rangé dans `records` (entité « push:order », hors données du logiciel)
 * avec les étapes déjà annoncées ; après chaque opération sur les commandes, les nouvelles
 * étapes sont envoyées une seule fois.
 */
const ENTITY = "push:order";
const MSG: Partial<Record<TrackStep, string>> = { payee: "Paiement confirmé.", acceptee: "Votre commande a été acceptée par la cuisine.", preparation: "Votre commande est en préparation.", prete: "Votre commande est prête !", servie: "Bon appétit !" };
type PushRec = { token: string; sub: PushSub; sent: string[]; url: string; restaurant: string };

const doneSteps = (o: Doc<FullOrder>) => {
  const p = publicOrder(o, null);
  const s = TRACK_STEPS.filter((k) => p.steps[k]).map(String);
  if (p.problem) s.push(`probleme:${p.problem.at}`);
  if (p.cancelled) s.push("annulee");
  return { s, p };
};

export async function savePushSubscription(projectId: string, demo: boolean, o: Doc<FullOrder>, sub: PushSub, url: string, restaurant: string) {
  const db = adminClient();
  const token = String(o.data.tracking_token);
  const { data: rows } = await db.from("records").select("id,data").eq("project_id", projectId).eq("is_demo", demo).eq("entity", ENTITY).limit(500);
  const same = (rows ?? []).filter((r) => (r.data as PushRec).token === token);
  if (same.some((r) => (r.data as PushRec).sub.endpoint === sub.endpoint)) return;
  if (same.length >= 5) throw new Error("Trop d'appareils pour cette commande.");
  const rec: PushRec = { token, sub, sent: doneSteps(o).s, url: url.slice(0, 300), restaurant: restaurant.slice(0, 80) };
  await db.from("records").insert({ project_id: projectId, is_demo: demo, entity: ENTITY, data: rec });
}

/** Envoie les nouvelles étapes des commandes suivies (appelé après chaque opération). Ne lève jamais d'erreur. */
export async function pushOrderUpdates(projectId: string, demo: boolean, listOrders: () => Promise<Doc[]>) {
  try {
    const db = adminClient();
    const { data: rows } = await db.from("records").select("id,data,created_at").eq("project_id", projectId).eq("is_demo", demo).eq("entity", ENTITY).limit(500);
    if (!rows?.length) return;
    const orders = (await listOrders()) as Doc<FullOrder>[];
    const byToken = new Map(orders.filter((o) => o.data.tracking_token).map((o) => [o.data.tracking_token!, o]));
    for (const r of rows) {
      const rec = r.data as PushRec;
      const o = byToken.get(rec.token);
      const old = Date.now() - Date.parse(r.created_at as string) > 24 * 3600_000;
      if (!o || old) {
        await db.from("records").delete().eq("id", r.id);
        continue;
      }
      const { s, p } = doneSteps(o);
      const fresh = s.filter((x) => !rec.sent.includes(x));
      if (!fresh.length) continue;
      // Une seule notification : la dernière étape atteinte (les autres sont résumées).
      const last = fresh[fresh.length - 1]!;
      const body = last === "annulee" ? "Votre commande a été annulée. Adressez-vous au serveur." : last.startsWith("probleme") ? `Information du restaurant : ${p.problem?.text ?? ""}` : (MSG[last as TrackStep] ?? TRACK_LABELS[last as TrackStep]);
      const res = await sendPush(rec.sub, { title: `${rec.restaurant} · commande ${p.number}`, body, url: rec.url, tag: `order-${rec.token}` });
      const finished = s.includes("servie") || s.includes("annulee");
      if (res === "gone" || (finished && res === "ok")) await db.from("records").delete().eq("id", r.id);
      else if (res === "ok") await db.from("records").update({ data: { ...rec, sent: s }, updated_at: new Date().toISOString() }).eq("id", r.id);
    }
  } catch {
    /* une notification manquée ne doit jamais faire échouer l'opération */
  }
}
