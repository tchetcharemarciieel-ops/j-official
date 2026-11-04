/**
 * « MiniSoft Vision IA — Restaurant » : occupation des tables et délais de service.
 *
 * Modèle partagé par le serveur, le navigateur et les tests. Les statuts des tables sont
 * toujours déduits des fiches enregistrées (installations, réservations) : rien n'est inventé.
 *
 * Caméras : le logiciel ne reçoit jamais d'image ni de visage. Une passerelle installée sur
 * place (boîtier relié aux caméras, avec son propre modèle de détection) n'envoie que des états
 * de table déjà stabilisés : « occupée » ou « libre », et éventuellement un nombre de personnes.
 */

import { BOOKING_ACTIVE, LEVEL, inPeriod, toMin, today, type Booking, type Doc, type Order, type Period, type Staff, type Table, type TableZone, type VenueRole } from "./model";

/** Poste « caisse / accueil » dans la fiche du personnel (gère Vision IA avec les gérants). */
export const CASHIER_ROLE = "Caisse et accueil";
export const isCashierRole = (role: string) => /caiss|accueil|r[ée]ception/i.test(role);
/**
 * Vision IA est géré à l'accueil / caisse : gérants (propriétaire, administrateur, gestionnaire)
 * et employés dont la fiche du personnel, reliée à leur compte, indique un poste caisse ou accueil.
 */
export function canVision(role: VenueRole, me: string, staff: Doc<Staff>[]) {
  if (LEVEL[role] >= 2) return true;
  return LEVEL[role] >= 1 && staff.some((s) => s.data.active && s.data.member_id === me && isCashierRole(s.data.role));
}

// ---------- Statuts ----------

export const TABLE_STATUSES = ["libre", "occupee", "reservee", "attente", "attente_plat", "plat_pret", "nettoyage"] as const;
export type TableStatus = (typeof TABLE_STATUSES)[number];
export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  libre: "Libre",
  occupee: "Occupée",
  reservee: "Réservée",
  attente: "En attente de service",
  attente_plat: "En attente du plat",
  plat_pret: "Plat prêt",
  nettoyage: "À nettoyer",
};
export const TABLE_STATUS_HINTS: Record<TableStatus, string> = {
  libre: "Table disponible",
  occupee: "Clients installés et servis",
  reservee: "Réservation confirmée pour maintenant",
  attente: "Clients installés, pas encore servis ni commandé",
  attente_plat: "Commande envoyée en cuisine, plat attendu",
  plat_pret: "La cuisine a terminé : plat à servir",
  nettoyage: "Clients partis : table à débarrasser",
};
/** Couleurs distinctes (vert libre, rouge occupée, bleu réservée, orange attente, violet plat prêt). */
export const TABLE_STATUS_COLORS: Record<TableStatus, { fill: string; ring: string; text: string }> = {
  libre: { fill: "#dcfce7", ring: "#16a34a", text: "#166534" },
  occupee: { fill: "#fee2e2", ring: "#dc2626", text: "#7f1d1d" },
  reservee: { fill: "#dbeafe", ring: "#2563eb", text: "#1e3a8a" },
  attente: { fill: "#fef3c7", ring: "#d97706", text: "#78350f" },
  attente_plat: { fill: "#ffedd5", ring: "#ea580c", text: "#7c2d12" },
  plat_pret: { fill: "#f3e8ff", ring: "#9333ea", text: "#581c87" },
  nettoyage: { fill: "#f1f5f9", ring: "#64748b", text: "#334155" },
};

// ---------- Fiches ----------

/** Origine d'une installation : saisie par l'équipe, détectée par une caméra, ou simulée (démonstration). */
export type SeatSource = "manuel" | "camera" | "demo";
export const SEAT_SOURCE_LABELS: Record<SeatSource, string> = { manuel: "Saisie par l'équipe", camera: "Détectée par caméra", demo: "Simulation (démonstration)" };

/** Passage de clients à une table : de l'installation au départ. */
export type Seat = {
  table_id: string;
  zone: TableZone;
  guests: number;
  booking_id: string | null;
  source: SeatSource;
  arrived_at: string;
  served_at: string | null;
  served_by: string | null;
  ended_at: string | null;
  end_reason: "libere" | "parti" | null;
  /** Table débarrassée et remise en « Libre » après le départ (null = à nettoyer). */
  cleaned_at: string | null;
  /** Ancien champ (une alerte par passage) : conservé pour les fiches existantes. */
  alert_id: string | null;
  idem: string;
  by: string;
};

/** Types d'alertes de délai, chacun avec son seuil réglable. */
export const ALERT_KINDS = ["service", "commande", "preparation", "plat"] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];
export const ALERT_KIND_LABELS: Record<AlertKind, string> = {
  service: "Premier service",
  commande: "Commande non prise",
  preparation: "Préparation en cuisine",
  plat: "Plat prêt non servi",
};
export const ALERT_KIND_HINTS: Record<AlertKind, string> = {
  service: "Depuis l'installation, sans « Client servi »",
  commande: "Depuis l'installation, sans commande enregistrée",
  preparation: "Depuis l'envoi en cuisine, commande pas encore prête",
  plat: "Depuis « Prête », plat pas encore servi",
};

/** Alerte de délai. Une seule alerte par passage (ou par commande) et par type. */
export type VisionAlert = {
  kind?: AlertKind;
  /** Commande concernée (préparation, plat prêt). */
  order_id?: string | null;
  key?: string;
  table_id: string;
  table_number: string;
  seat_id: string;
  raised_at: string;
  /** Seuil configuré au moment de l'alerte (minutes). */
  threshold_min: number;
  ack_at: string | null;
  ack_by: string | null;
  resolved_at: string | null;
  resolution: "servi" | "libere" | null;
};

/**
 * Caméra déclarée par le gérant. Une caméra n'est « connectée » qu'après avoir réellement
 * envoyé des détections par la passerelle (`last_seen`) : jamais simulée.
 */
export type Camera = {
  name: string;
  zone: TableZone;
  table_ids: string[];
  /** Empreinte SHA-256 de la clé d'accès de la passerelle (la clé elle-même n'est jamais stockée). */
  token_hash: string | null;
  token_hint: string | null;
  last_seen: string | null;
  last_tables: number | null;
  /** Position sur le plan 2D (en %), orientation (degrés, 0 = vers la droite) et champ de vision. */
  pos?: { x: number; y: number } | null;
  angle?: number;
  fov?: number;
  range?: number;
  active: boolean;
  by: string;
};

/** Seuils en minutes ; 0 = alerte désactivée pour ce type. */
export type VisionSettings = { alert_minutes: number; order_minutes: number; prep_minutes: number; ready_minutes: number; sound: boolean };
export const DEFAULT_VISION: VisionSettings = { alert_minutes: 10, order_minutes: 10, prep_minutes: 25, ready_minutes: 5, sound: true };
export function visionSettings(s: { vision?: Partial<VisionSettings> } | undefined): VisionSettings {
  return { ...DEFAULT_VISION, ...(s?.vision ?? {}) };
}
export const thresholdOf = (vs: VisionSettings, k: AlertKind) => (k === "service" ? vs.alert_minutes : k === "commande" ? vs.order_minutes : k === "preparation" ? vs.prep_minutes : vs.ready_minutes);

/** Une caméra est considérée en ligne si elle a envoyé une détection dans les 2 dernières minutes. */
export const CAMERA_ONLINE_MS = 120_000;
export const cameraOnline = (c: Camera, now = Date.now()) => c.active && c.last_seen !== null && now - Date.parse(c.last_seen) < CAMERA_ONLINE_MS;

// ---------- Calculs ----------

export const seatActive = (s: Seat) => s.ended_at === null;
export const minutesBetween = (a: string, b: string | Date) => Math.max(0, ((typeof b === "string" ? Date.parse(b) : b.getTime()) - Date.parse(a)) / 60_000);

/** Réservation qui « occupe » la table maintenant : confirmée, aujourd'hui, de 60 min avant l'heure jusqu'à la fin prévue. */
export function currentBooking(tableId: string, bookings: Doc<Booking>[], now = new Date()): Doc<Booking> | undefined {
  const t = today(now);
  const m = now.getHours() * 60 + now.getMinutes();
  return bookings
    .filter((b) => b.data.table_id === tableId && b.data.date === t && b.data.status === "confirmee")
    .filter((b) => m >= toMin(b.data.start) - 60 && m < toMin(b.data.start) + b.data.minutes)
    .sort((a, b) => a.data.start.localeCompare(b.data.start))[0];
}

export type TableLive = {
  table: Doc<Table>;
  status: TableStatus;
  /** Passage en cours, ou dernier passage terminé si la table est à nettoyer. */
  seat: Doc<Seat> | null;
  booking: Doc<Booking> | null;
  /** Commandes du passage en cours (hors annulées). */
  orders: Doc<Order>[];
  /** Minutes écoulées depuis l'installation (passage en cours). */
  waited: number | null;
  /** Minutes depuis l'événement qui fixe le statut (envoi en cuisine, plat prêt…). */
  since: number | null;
  /** Un délai configuré est dépassé. */
  late: boolean;
  alerts: Doc<VisionAlert>[];
  /** Prochaine réservation du jour (information). */
  next: Doc<Booking> | null;
};

/** Commandes rattachées à un passage : même table, enregistrées pendant le passage. */
export function seatOrders(seat: Doc<Seat>, orders: Doc<Order>[]) {
  return orders.filter((o) => o.data.table_id === seat.data.table_id && o.data.status !== "annulee" && o.created_at >= seat.data.arrived_at && (!seat.data.ended_at || o.created_at <= seat.data.ended_at));
}
const readyAt = (o: Doc<Order>) => o.data.ready_at ?? [...o.data.history].reverse().find((h) => h.to === "prete")?.at ?? null;
const servedAt = (o: Doc<Order>) => [...o.data.history].reverse().find((h) => h.to === "servie")?.at ?? null;
/** Heure du premier service : « Client servi » cliqué par le serveur, ou commande marquée « Servie ». */
export function firstService(seat: Doc<Seat>, orders: Doc<Order>[]): string | null {
  const t = [seat.data.served_at, ...seatOrders(seat, orders).map(servedAt)].filter((x): x is string => Boolean(x)).sort();
  return t[0] ?? null;
}

/** Délais dépassés pour un passage en cours (types dont le seuil est actif). */
export function lateness(seat: Doc<Seat>, orders: Doc<Order>[], vs: VisionSettings, now = new Date()): { kind: AlertKind; minutes: number; order_id: string | null }[] {
  const out: { kind: AlertKind; minutes: number; order_id: string | null }[] = [];
  if (!seatActive(seat.data)) return out;
  const mine = seatOrders(seat, orders);
  const arrived = minutesBetween(seat.data.arrived_at, now);
  if (vs.alert_minutes > 0 && !firstService(seat, orders) && arrived >= vs.alert_minutes) out.push({ kind: "service", minutes: arrived, order_id: null });
  if (vs.order_minutes > 0 && mine.length === 0 && !seat.data.served_at && arrived >= vs.order_minutes) out.push({ kind: "commande", minutes: arrived, order_id: null });
  for (const o of mine) {
    const held = (o.data as { held?: boolean }).held === true;
    if (vs.prep_minutes > 0 && !held && (o.data.status === "en_attente" || o.data.status === "en_preparation")) {
      const m = minutesBetween((o.data as { sent_at?: string | null }).sent_at ?? o.created_at, now);
      if (m >= vs.prep_minutes) out.push({ kind: "preparation", minutes: m, order_id: o.id });
    }
    if (vs.ready_minutes > 0 && o.data.status === "prete") {
      const r = readyAt(o);
      const m = r ? minutesBetween(r, now) : 0;
      if (r && m >= vs.ready_minutes) out.push({ kind: "plat", minutes: m, order_id: o.id });
    }
  }
  return out;
}
export const alertKey = (kind: AlertKind, seatId: string, orderId: string | null) => `${kind}:${orderId ?? seatId}`;

/**
 * État en direct de chaque table active. Priorité : plat prêt > en attente du plat > en attente de
 * service > occupée > à nettoyer > réservée > libre. Les statuts de commande viennent uniquement
 * du système de commande et de la cuisine, jamais de la caméra.
 */
export function liveTables(tables: Doc<Table>[], seats: Doc<Seat>[], bookings: Doc<Booking>[], alerts: Doc<VisionAlert>[], vs: VisionSettings, now = new Date(), orders: Doc<Order>[] = []): TableLive[] {
  const t = today(now);
  const m = now.getHours() * 60 + now.getMinutes();
  return tables
    .filter((x) => x.data.active)
    .sort((a, b) => a.data.number.localeCompare(b.data.number, "fr", { numeric: true }))
    .map((table) => {
      const mine = seats.filter((s) => s.data.table_id === table.id).sort((a, b) => b.data.arrived_at.localeCompare(a.data.arrived_at));
      const active = mine.find((s) => seatActive(s.data)) ?? null;
      const dirty = !active && mine[0] && mine[0].data.ended_at && !mine[0].data.cleaned_at && mine[0].data.cleaned_at !== undefined ? mine[0] : null;
      const seat = active ?? dirty;
      const booking = active?.data.booking_id ? (bookings.find((b) => b.id === active.data.booking_id) ?? null) : !active ? (currentBooking(table.id, bookings, now) ?? null) : null;
      const os = active ? seatOrders(active, orders) : [];
      const waited = active ? minutesBetween(active.data.arrived_at, now) : null;
      let status: TableStatus = "libre";
      let since: number | null = null;
      if (active) {
        const ready = os.filter((o) => o.data.status === "prete");
        // Commande en ligne en attente de paiement : pas encore en cuisine.
        const cooking = os.filter((o) => (o.data.status === "en_attente" || o.data.status === "en_preparation") && (o.data as { held?: boolean }).held !== true);
        if (ready.length) {
          status = "plat_pret";
          const r = ready.map(readyAt).filter((x): x is string => Boolean(x)).sort()[0];
          since = r ? minutesBetween(r, now) : null;
        } else if (cooking.length) {
          status = "attente_plat";
          since = minutesBetween(cooking.map((o) => o.created_at).sort()[0]!, now);
        } else if (firstService(active, orders)) status = "occupee";
        else {
          status = "attente";
          since = waited;
        }
      } else if (dirty) status = "nettoyage";
      else if (booking) status = "reservee";
      const tableAlerts = active ? alerts.filter((a) => a.data.seat_id === active.id && !a.data.resolved_at) : [];
      const late = active ? lateness(active, orders, vs, now).length > 0 : false;
      const next =
        bookings
          .filter((b) => b.data.table_id === table.id && b.data.date === t && b.data.status === "confirmee" && toMin(b.data.start) >= m)
          .sort((a, b) => a.data.start.localeCompare(b.data.start))[0] ?? null;
      return { table, status, seat, booking, orders: os, waited, since, late, alerts: tableAlerts, next };
    });
}

export function countByStatus(live: TableLive[]) {
  const c: Record<TableStatus, number> = { libre: 0, occupee: 0, reservee: 0, attente: 0, attente_plat: 0, plat_pret: 0, nettoyage: 0 };
  for (const l of live) c[l.status]++;
  return c;
}

/** Statistiques sur une période (uniquement à partir des passages enregistrés). */
export function visionStats(seats: Doc<Seat>[], alerts: Doc<VisionAlert>[], tables: Doc<Table>[], p: Period, orders: Doc<Order>[] = []) {
  const inP = seats.filter((s) => inPeriod(s.data.arrived_at, p));
  const firsts = inP.map((s) => ({ s, at: firstService(s, orders) }));
  const served = firsts.filter((x) => x.at);
  const waits = served.map((x) => minutesBetween(x.s.data.arrived_at, x.at!));
  const avgWait = waits.length ? Math.round((waits.reduce((a, x) => a + x, 0) / waits.length) * 10) / 10 : null;
  const closed = inP.filter((s) => s.data.ended_at);
  const durations = closed.map((s) => minutesBetween(s.data.arrived_at, s.data.ended_at!));
  const avgStay = durations.length ? Math.round(durations.reduce((a, x) => a + x, 0) / durations.length) : null;
  const byHour = Array.from({ length: 24 }, () => 0);
  for (const s of inP) byHour[new Date(s.data.arrived_at).getHours()]++;
  const byTable = new Map<string, number>();
  for (const s of inP) byTable.set(s.data.table_id, (byTable.get(s.data.table_id) ?? 0) + 1);
  const alertsIn = alerts.filter((a) => inPeriod(a.data.raised_at, p));
  const ackDelays = alertsIn.filter((a) => a.data.ack_at).map((a) => minutesBetween(a.data.raised_at, a.data.ack_at!));
  return {
    seatings: inP.length,
    guests: inP.reduce((a, s) => a + s.data.guests, 0),
    served: served.length,
    leftUnserved: inP.filter((s) => s.data.end_reason === "parti").length,
    avgWait,
    maxWait: waits.length ? Math.round(Math.max(...waits)) : null,
    avgStay,
    byHour,
    byTable: tables.map((t) => ({ table: t, count: byTable.get(t.id) ?? 0 })).filter((x) => x.count > 0).sort((a, b) => b.count - a.count),
    alerts: alertsIn.length,
    alertsByKind: ALERT_KINDS.map((k) => ({ kind: k, count: alertsIn.filter((a) => (a.data.kind ?? "service") === k).length })),
    avgAck: ackDelays.length ? Math.round((ackDelays.reduce((a, x) => a + x, 0) / ackDelays.length) * 10) / 10 : null,
    bySource: { manuel: inP.filter((s) => s.data.source === "manuel").length, camera: inP.filter((s) => s.data.source === "camera").length, demo: inP.filter((s) => s.data.source === "demo").length },
  };
}

/** Positions automatiques (en %) des tables sans position enregistrée : grille par numéro. */
export function autoLayout(tables: Doc<Table>[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const free = tables.filter((t) => !t.data.pos);
  const cols = Math.max(2, Math.ceil(Math.sqrt(free.length * 1.6)));
  const rows = Math.max(1, Math.ceil(free.length / cols));
  free.forEach((t, i) => out.set(t.id, { x: Math.round(((i % cols) + 0.5) * (100 / cols)), y: Math.round((Math.floor(i / cols) + 0.5) * (100 / rows)) }));
  for (const t of tables) if (t.data.pos) out.set(t.id, t.data.pos);
  return out;
}

export const fmtMinutes = (m: number | null) => (m === null ? "—" : m < 1 ? "moins d'1 min" : m < 60 ? `${Math.floor(m)} min` : `${Math.floor(m / 60)} h ${String(Math.floor(m % 60)).padStart(2, "0")}`);
export { BOOKING_ACTIVE };
