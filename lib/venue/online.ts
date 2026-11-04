/**
 * Restaurant en ligne : menu public par QR code, commande du client, suivi de commande,
 * écran cuisine et rapports. Modèle partagé par le serveur, le navigateur et les tests.
 *
 * Règles :
 * - un paiement n'est « confirmé » qu'après un encaissement vérifié par l'équipe ou, plus tard,
 *   la confirmation officielle d'ALETCHCARD reçue par le serveur (jamais une redirection) ;
 * - le client ne choisit jamais sa table : elle vient du jeton secret imprimé dans le QR code ;
 * - le menu public n'expose aucune donnée privée (coûts, recettes, stock, équipe, clients).
 */

import { inPeriod, type Doc, type MenuItem, type Order, type Period } from "./model";

export const minutesSince = (iso: string, now = new Date()) => Math.max(0, (now.getTime() - Date.parse(iso)) / 60_000);

// ---------- Réglages du menu en ligne ----------

export type OnlineSettings = {
  /** Menu public visible (sinon la page affiche « menu non publié »). */
  published: boolean;
  /** Commande par le client depuis le menu. */
  ordering: boolean;
  /** Paiement à la caisse ou au serveur (confirmé par l'équipe). */
  pay_counter: boolean;
  /** Cuisine : n'afficher une commande QR qu'après paiement confirmé (sinon dès la commande). */
  kitchen_after_payment: boolean;
  welcome: string;
  /** Logo (image réduite) affiché sur le menu et au centre des QR codes. */
  logo: string | null;
  /** Jeton du QR code du menu général (null = pas encore généré) et son état. */
  menu_token: string | null;
  menu_qr_active: boolean;
};
export const DEFAULT_ONLINE: OnlineSettings = { published: false, ordering: true, pay_counter: true, kitchen_after_payment: false, welcome: "", logo: null, menu_token: null, menu_qr_active: true };
export function onlineSettings(s: { online?: Partial<OnlineSettings> } | undefined): OnlineSettings {
  return { ...DEFAULT_ONLINE, ...(s?.online ?? {}) };
}

/** Option d'un plat (supplément, cuisson…) avec son prix (0 = gratuit). */
export type MenuOption = { id: string; name: string; price: number };
/** Champs du menu en ligne ajoutés aux plats de la carte. */
export type OnlineItem = MenuItem & { description?: string; photo?: string | null; options?: MenuOption[]; available?: boolean };
export const itemAvailable = (m: OnlineItem) => m.active && m.available !== false;

/** Statistiques d'un jour (un document par jour, compteurs uniquement : aucune donnée personnelle). */
export type DayStat = { date: string; scans: Record<string, number>; visitors: string[]; views: Record<string, number>; orders: number };

// ---------- Commandes du client ----------

export type OnlineOrderFields = {
  channel?: "qr" | "equipe";
  /** Jeton secret du lien de suivi (jamais devinable, jamais affiché à l'équipe en clair). */
  tracking_token?: string;
  /** Mode de paiement choisi par le client. */
  pay_mode?: "caisse" | "aletchcard" | "demo";
  /** En attente du paiement avant d'être envoyée en cuisine. */
  held?: boolean;
  sent_at?: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
  problem?: { at: string; text: string; by: string } | null;
};
export type FullOrder = Order & OnlineOrderFields;
/** Ligne de commande avec ses options (prix unitaire = prix du plat + options). */
export type OptionPick = { name: string; price: number };

/** Étapes affichées au client, dans l'ordre. */
export const TRACK_STEPS = ["recue", "payee", "acceptee", "preparation", "prete", "servie"] as const;
export type TrackStep = (typeof TRACK_STEPS)[number];
export const TRACK_LABELS: Record<TrackStep, string> = { recue: "Commande reçue", payee: "Paiement confirmé", acceptee: "Commande acceptée", preparation: "En préparation", prete: "Commande prête", servie: "Servie" };

/** Vue publique d'une commande : uniquement ce que le client doit voir. */
export function publicOrder(o: Doc<FullOrder>, table: string | null) {
  const d = o.data;
  const hist = (to: string) => [...d.history].reverse().find((h) => h.to === to)?.at ?? null;
  return {
    number: d.number,
    table,
    lines: d.lines.map((l) => ({ label: l.label, qty: l.qty, unit_price: l.unit_price, note: l.note, options: (l as { options?: OptionPick[] }).options ?? [] })),
    total: d.total,
    note: d.note,
    created_at: o.created_at,
    status: d.status,
    cancelled: d.status === "annulee",
    // « Payée » uniquement après confirmation (encaissement vérifié ou confirmation officielle).
    paid: d.pay_status === "paye",
    pay_mode: d.pay_mode ?? "caisse",
    held: Boolean(d.held),
    steps: {
      recue: o.created_at,
      payee: d.pay_status === "paye" ? (hist("payee") ?? o.updated_at) : null,
      acceptee: d.accepted_at ?? null,
      preparation: hist("en_preparation"),
      prete: d.ready_at ?? hist("prete"),
      servie: hist("servie"),
    } satisfies Record<TrackStep, string | null>,
    problem: d.problem ? { at: d.problem.at, text: d.problem.text } : null,
  };
}
export type PublicOrder = ReturnType<typeof publicOrder>;

// ---------- Rapport quotidien (agent restaurant) ----------

const hist = (o: Doc<FullOrder>, to: string) => [...o.data.history].reverse().find((h) => h.to === to)?.at ?? null;

/** Indicateurs calculés uniquement sur les commandes enregistrées. */
export function kitchenReport(orders: Doc<FullOrder>[], p: Period, prepMinutes: number, now = new Date()) {
  const inP = orders.filter((o) => inPeriod(o.created_at, p));
  const valid = inP.filter((o) => o.data.status !== "annulee");
  const prep: number[] = [];
  const accept: number[] = [];
  for (const o of valid) {
    const start = o.data.sent_at ?? o.created_at;
    const ready = o.data.ready_at ?? hist(o, "prete");
    if (ready) prep.push(minutesSince(start, new Date(ready)));
    if (o.data.accepted_at) accept.push(minutesSince(start, new Date(o.data.accepted_at)));
  }
  const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
  const open = valid.filter((o) => (o.data.status === "en_attente" || o.data.status === "en_preparation") && !o.data.held);
  const late = open.filter((o) => prepMinutes > 0 && minutesSince(o.data.sent_at ?? o.created_at, now) >= prepMinutes);
  const items = new Map<string, number>();
  for (const o of valid) for (const l of o.data.lines) items.set(l.label, (items.get(l.label) ?? 0) + l.qty);
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const o of valid) byHour[new Date(o.created_at).getHours()]++;
  return {
    orders: valid.length,
    cancelled: inP.length - valid.length,
    qr: valid.filter((o) => o.data.channel === "qr").length,
    revenueOrdered: valid.reduce((a, o) => a + o.data.total, 0),
    paidOrders: valid.filter((o) => o.data.pay_status === "paye").length,
    avgPrep: avg(prep),
    maxPrep: prep.length ? Math.round(Math.max(...prep)) : null,
    slowCount: prepMinutes > 0 ? prep.filter((m) => m >= prepMinutes).length : 0,
    avgAccept: avg(accept),
    problems: valid.filter((o) => o.data.problem).map((o) => ({ number: o.data.number, text: o.data.problem!.text })),
    lateNow: late.map((o) => ({ id: o.id, number: o.data.number, minutes: Math.round(minutesSince(o.data.sent_at ?? o.created_at, now)) })),
    topItems: [...items.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, qty]) => ({ label, qty })),
    byHour,
  };
}
export type KitchenReport = ReturnType<typeof kitchenReport>;

/** Recommandations simples déduites des chiffres (sans IA), toujours accompagnées du chiffre qui les justifie. */
export function reportAdvice(r: KitchenReport, prepMinutes: number): string[] {
  const out: string[] = [];
  if (r.orders === 0) return ["Aucune commande sur la période : pas encore de recommandation."];
  if (r.avgPrep !== null && prepMinutes > 0 && r.avgPrep > prepMinutes) out.push(`Temps moyen de préparation de ${r.avgPrep} min, au-dessus du seuil de ${prepMinutes} min : renforcez la cuisine aux heures de pointe ou simplifiez les plats les plus longs.`);
  if (r.slowCount > 0) out.push(`${r.slowCount} commande(s) ont dépassé ${prepMinutes} min de préparation.`);
  if (r.avgAccept !== null && r.avgAccept > 3) out.push(`Les commandes attendent en moyenne ${r.avgAccept} min avant d'être acceptées : gardez l'écran cuisine ouvert et le son activé.`);
  if (r.problems.length) out.push(`${r.problems.length} problème(s) signalé(s) par la cuisine : vérifiez le stock des plats concernés.`);
  const peak = r.byHour.indexOf(Math.max(...r.byHour));
  if (Math.max(...r.byHour) >= 3) out.push(`Heure la plus chargée : ${peak} h (${r.byHour[peak]} commandes). Préparez la mise en place avant cette heure.`);
  if (r.topItems[0]) out.push(`Plat le plus commandé : ${r.topItems[0].label} (${r.topItems[0].qty}). Vérifiez son stock en priorité.`);
  return out;
}
