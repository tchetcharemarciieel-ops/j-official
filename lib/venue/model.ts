/**
 * Module « Restaurant / Hôtel » : modèle métier partagé par le serveur, le navigateur et les tests.
 * Même principe que le garage : données rangées dans la table `records` existante sous des
 * identifiants réservés (« hx:… »), indicateurs toujours calculés sur les fiches enregistrées,
 * aucune valeur inventée (prix, réservations, paiements, températures).
 */

import { inPeriod, round2, today, type Period } from "../garage/model";
export { fmtDate, fmtDateTime, fmtMoney, fmtQty, inPeriod, periodPreset, round2, searchable, today, type Period } from "../garage/model";

export const COLLECTIONS = [
  "settings",
  "item",
  "move",
  "lot",
  "equip",
  "table",
  "booking",
  "menu",
  "order",
  "payment",
  "temp",
  "task",
  "expense",
  "staff",
  "room",
  "guest",
  "stay",
  "photo",
  "counter",
] as const;
export type Col = (typeof COLLECTIONS)[number];
export const entityKey = (c: Col) => `hx:${c}`;
export const colFromEntity = (e: string): Col | null => {
  const c = e.startsWith("hx:") ? e.slice(3) : "";
  return (COLLECTIONS as readonly string[]).includes(c) ? (c as Col) : null;
};

export type Doc<T = Record<string, unknown>> = { id: string; data: T; created_at: string; updated_at: string };
export type VenueData = { [K in Col]: Doc[] };
export const emptyData = (): VenueData => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as VenueData;

// ---------- Rôles (mêmes niveaux que le garage) ----------

export type VenueRole = "owner" | "admin" | "manager" | "employee" | "viewer";
/** 0 lecture seule, 1 équipe, 2 gérant (gestionnaire, administrateur, propriétaire). */
export const LEVEL: Record<VenueRole, number> = { viewer: 0, employee: 1, manager: 2, admin: 2, owner: 2 };

// ---------- Zones ----------

export type VenueKind = "restaurant" | "hotel";
export const RESTAURANT_ZONES = ["cuisine", "salle", "stock", "froid", "toilettes", "caisse", "bureau", "terrasse"] as const;
export const HOTEL_ZONES = ["reception", "chambres", "restaurant", "cuisine", "bureau"] as const;
export type RestaurantZone = (typeof RESTAURANT_ZONES)[number];
export type HotelZone = (typeof HOTEL_ZONES)[number];
export type VenueZone = RestaurantZone | HotelZone;
/** Zones qui portent des données (tables, équipements, tâches…). « hotel_resto » = salle du restaurant de l'hôtel. */
export type DataZone = VenueZone | "chambre";

// ---------- Paramètres (questionnaire du plan) ----------

export const HOTEL_EXTRA_SPACES = ["parking", "piscine", "salle_reunion", "buanderie", "jardin", "spa"] as const;
export type HotelExtraSpace = (typeof HOTEL_EXTRA_SPACES)[number];
export const HOTEL_EXTRA_LABELS: Record<HotelExtraSpace, string> = { parking: "Parking", piscine: "Piscine", salle_reunion: "Salle de réunion", buanderie: "Buanderie", jardin: "Jardin", spa: "Spa / bien-être" };

export const PHOTO_CATEGORIES = ["exterieur", "reception", "chambres", "salles_bain", "restaurant", ...HOTEL_EXTRA_SPACES] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORIES)[number];
export const PHOTO_CATEGORY_LABELS: Record<PhotoCategory, string> = { exterieur: "Extérieur de l'hôtel", reception: "Réception et accueil", chambres: "Chambres", salles_bain: "Salles de bain", restaurant: "Restaurant", ...HOTEL_EXTRA_LABELS };

export type Settings = {
  kind: VenueKind;
  /** Questionnaire rempli : le plan 3D peut être affiché. */
  answered: boolean;
  /** Restaurant : terrasse déclarée (null = question pas encore posée). */
  terrace: boolean | null;
  /** Hôtel : restaurant sur place, service en chambre, espaces complémentaires. */
  has_restaurant: boolean | null;
  room_service: boolean | null;
  extra_spaces: HotelExtraSpace[];
  /** Étape photos de l'hôtel : terminée (avec ou sans photos). */
  photos_step: "fait" | "ignore" | null;
  /** Dimensions déclarées (mètres), affichées comme telles : le plan reste schématique. */
  dims: { length: number | null; width: number | null; note: string };
  /** Seuils de la chambre froide (°C), définis par le gérant. */
  cold_min: number | null;
  cold_max: number | null;
  /** Délai d'alerte avant la date limite de conservation (jours). */
  expiry_warn_days: number;
  /** Photos importées : nombre par catégorie et couleur dominante (référence visuelle du plan). */
  photo_counts: Partial<Record<PhotoCategory, number>>;
  tints: Partial<Record<PhotoCategory, string>>;
  updated_by: string;
};

export function defaultSettings(kind: VenueKind): Settings {
  return { kind, answered: false, terrace: null, has_restaurant: null, room_service: null, extra_spaces: [], photos_step: null, dims: { length: null, width: null, note: "" }, cold_min: null, cold_max: null, expiry_warn_days: 2, photo_counts: {}, tints: {}, updated_by: "" };
}

/** Zones affichées sur le plan, selon les réponses du questionnaire (aucune zone non déclarée). */
export function activeZones(s: Settings): VenueZone[] {
  if (s.kind === "restaurant") return RESTAURANT_ZONES.filter((z) => z !== "terrasse" || s.terrace === true);
  return HOTEL_ZONES.filter((z) => (z !== "restaurant" && z !== "cuisine") || s.has_restaurant === true);
}

// ---------- Produits et stock ----------

export const ITEM_CATEGORIES = ["ingredient", "boisson", "marchandise", "entretien", "autre"] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export const ITEM_CATEGORY_LABELS: Record<ItemCategory, string> = { ingredient: "Ingrédient", boisson: "Boisson", marchandise: "Marchandise", entretien: "Produit d'entretien", autre: "Autre" };

/** Zones où l'on stocke des produits : réserve, chambre froide, toilettes (fournitures). */
export const STOCK_ZONES = ["stock", "froid", "toilettes"] as const;
export type StockZone = (typeof STOCK_ZONES)[number];
export const STOCK_ZONE_LABELS: Record<StockZone, string> = { stock: "Réserve", froid: "Chambre froide", toilettes: "Toilettes" };

export type Item = {
  zone: StockZone;
  name: string;
  category: ItemCategory;
  unit: string;
  qty: number;
  /** Prix d'achat unitaire saisi (null = non renseigné : exclu de la valeur du stock). */
  unit_price: number | null;
  /** Seuil minimum (null = pas d'alerte). */
  min_qty: number | null;
  location: string;
  /** Chambre froide : plage de conservation du produit (°C). */
  temp_min: number | null;
  temp_max: number | null;
  active: boolean;
  /** Clés des derniers mouvements appliqués : un même mouvement n'est jamais compté deux fois. */
  op_keys: string[];
};

export const MOVE_TYPES = ["initial", "achat", "livraison", "utilisation", "retrait", "perte", "ajustement", "vente"] as const;
export type MoveType = (typeof MOVE_TYPES)[number];
export const MOVE_TYPE_LABELS: Record<MoveType, string> = { initial: "Quantité initiale", achat: "Achat", livraison: "Livraison reçue", utilisation: "Utilisé", retrait: "Retiré", perte: "Perte", ajustement: "Ajustement d'inventaire", vente: "Vente" };
export const MOVE_IN: MoveType[] = ["initial", "achat", "livraison"];
export type Move = { item_id: string; type: MoveType; qty: number; balance_after: number; reason: string; unit_cost: number | null; order_id: string | null; at: string; by: string; op_key: string };

/** Produit daté (réception et date limite de conservation). */
export type Lot = { item_id: string; qty: number; received: string; expires: string | null; note: string; closed: boolean; by: string };

export function expiryState(l: Lot, warnDays: number, now = new Date()): "expire" | "bientot" | "ok" | "sans_date" {
  if (!l.expires) return "sans_date";
  const t = today(now);
  if (l.expires < t) return "expire";
  const lim = new Date(now);
  lim.setDate(lim.getDate() + warnDays);
  return l.expires <= today(lim) ? "bientot" : "ok";
}

export function stockAlerts(items: Doc<Item>[]) {
  const act = items.filter((i) => i.data.active);
  return { out: act.filter((i) => i.data.min_qty !== null && i.data.qty <= 0), low: act.filter((i) => i.data.min_qty !== null && i.data.qty > 0 && i.data.qty <= i.data.min_qty!) };
}

/** Valeur estimée = Σ quantité × dernier prix d'achat saisi ; les produits sans prix sont listés à part. */
export function stockValue(items: Doc<Item>[]) {
  const act = items.filter((i) => i.data.active);
  const priced = act.filter((i) => i.data.unit_price !== null);
  return { value: Math.round(priced.reduce((a, i) => a + Math.max(0, i.data.qty) * i.data.unit_price!, 0)), unpriced: act.filter((i) => i.data.unit_price === null), count: act.length };
}

// ---------- Équipements, mobilier, aménagement ----------

export const EQUIP_CATEGORIES = ["equipement", "mobilier", "installation", "amenagement", "decoration", "eclairage", "parasol", "plante"] as const;
export type EquipCategory = (typeof EQUIP_CATEGORIES)[number];
export const EQUIP_CATEGORY_LABELS: Record<EquipCategory, string> = { equipement: "Équipement", mobilier: "Mobilier", installation: "Installation", amenagement: "Aménagement", decoration: "Décoration", eclairage: "Éclairage", parasol: "Parasol", plante: "Plante" };
export const EQUIP_CONDITIONS = ["bon", "use", "endommage", "panne", "maintenance"] as const;
export type EquipCondition = (typeof EQUIP_CONDITIONS)[number];
export const EQUIP_CONDITION_LABELS: Record<EquipCondition, string> = { bon: "Bon état", use: "Usé", endommage: "Endommagé", panne: "En panne", maintenance: "En maintenance" };
/** Équipement à acheter (pour le budget) ou déjà présent. */
export type Equip = { zone: DataZone; room_id: string | null; name: string; category: EquipCategory; qty: number; unit_price: number | null; owned: boolean; condition: EquipCondition; location: string; notes: string };

// ---------- Tables et réservations ----------

export type TableZone = "salle" | "terrasse" | "restaurant";
export type Table = { zone: TableZone; number: string; seats: number; shape: "carree" | "ronde" | "rectangulaire"; location: string; table_price: number | null; chair_price: number | null; active: boolean };
export const BOOKING_STATUSES = ["confirmee", "arrivee", "terminee", "annulee", "absente"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = { confirmee: "Confirmée", arrivee: "Clients installés", terminee: "Terminée", annulee: "Annulée", absente: "Clients absents" };
export type Booking = { zone: TableZone; table_id: string; date: string; start: string; minutes: number; guests: number; name: string; phone: string; note: string; status: BookingStatus; idem: string; by: string };
export const BOOKING_ACTIVE: BookingStatus[] = ["confirmee", "arrivee"];

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export function bookingsOverlap(a: Pick<Booking, "date" | "start" | "minutes">, b: Pick<Booking, "date" | "start" | "minutes">) {
  if (a.date !== b.date) return false;
  const a0 = toMin(a.start);
  const b0 = toMin(b.start);
  return a0 < b0 + b.minutes && b0 < a0 + a.minutes;
}

/** Capacité = somme des chaises des tables actives d'une zone. */
export function capacity(tables: Doc<Table>[], zone: TableZone) {
  const t = tables.filter((x) => x.data.active && x.data.zone === zone);
  return { tables: t.length, seats: t.reduce((a, x) => a + x.data.seats, 0), bySeats: [...new Set(t.map((x) => x.data.seats))].sort((a, b) => a - b).map((s) => ({ seats: s, count: t.filter((x) => x.data.seats === s).length })) };
}

// ---------- Carte, commandes, paiements ----------

export const MENU_CATEGORIES = ["entree", "plat", "dessert", "boisson", "accompagnement", "autre"] as const;
export type MenuCategory = (typeof MENU_CATEGORIES)[number];
export const MENU_CATEGORY_LABELS: Record<MenuCategory, string> = { entree: "Entrées", plat: "Plats", dessert: "Desserts", boisson: "Boissons", accompagnement: "Accompagnements", autre: "Autres" };
export type RecipeLine = { item_id: string; qty: number };
/** Plat ou boisson. La recette (facultative) indique les ingrédients pour `portions` portions. */
export type MenuItem = { name: string; category: MenuCategory; price: number; active: boolean; recipe: RecipeLine[]; portions: number; kitchen: boolean };

export function recipeCost(m: MenuItem, items: Doc<Item>[]) {
  const missing: string[] = [];
  let cost = 0;
  for (const l of m.recipe) {
    const it = items.find((i) => i.id === l.item_id);
    if (!it) missing.push("ingrédient supprimé");
    else if (it.data.unit_price === null) missing.push(it.data.name);
    else cost += l.qty * it.data.unit_price;
  }
  const portions = Math.max(1, m.portions);
  return { total: missing.length ? null : Math.round(cost), perPortion: missing.length ? null : Math.round(cost / portions), missing, defined: m.recipe.length > 0 };
}

export const ORDER_STATUSES = ["en_attente", "en_preparation", "prete", "servie", "annulee"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = { en_attente: "En attente", en_preparation: "En préparation", prete: "Prête", servie: "Servie", annulee: "Annulée" };
export type OrderLine = { id: string; menu_id: string; label: string; qty: number; unit_price: number; note: string; kitchen: boolean };
export type HistoryEntry = { from: string | null; to: string; at: string; by: string; note?: string };
export type PayStatus = "non_paye" | "partiel" | "paye" | "chambre";
export const PAY_STATUS_LABELS: Record<PayStatus, string> = { non_paye: "Non payée", partiel: "Partiellement payée", paye: "Payée", chambre: "Ajoutée à la note de chambre" };
export type Order = {
  number: string;
  source: "caisse" | "salle" | "terrasse" | "restaurant" | "room_service";
  table_id: string | null;
  stay_id: string | null;
  customer: string;
  lines: OrderLine[];
  total: number;
  note: string;
  status: OrderStatus;
  history: HistoryEntry[];
  /** Montant confirmé encaissé directement sur la commande. */
  paid: number;
  pay_status: PayStatus;
  stock_deducted: boolean;
  stock_note: string;
  ready_at: string | null;
  receipt_no: string | null;
  idem: string;
  by: string;
};
export const orderTotal = (lines: Pick<OrderLine, "qty" | "unit_price">[]) => Math.round(lines.reduce((a, l) => a + l.qty * l.unit_price, 0));

export const PAYMENT_METHODS = ["especes", "mobile_money", "carte", "virement", "cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { especes: "Espèces", mobile_money: "Mobile money", carte: "Carte bancaire", virement: "Virement", cheque: "Chèque" };
/**
 * Paiement saisi par l'équipe. « en_attente » : annoncé mais pas encore vérifié (mobile money,
 * virement) ; seul un paiement « confirme » compte dans les recettes.
 */
export type Payment = {
  target: "order" | "stay";
  target_id: string;
  amount: number;
  method: PaymentMethod;
  /** Espèces : somme remise par le client, et monnaie rendue. */
  tendered: number | null;
  change: number | null;
  reference: string;
  status: "en_attente" | "confirme" | "annule";
  receipt_no: string | null;
  at: string;
  confirmed_at: string | null;
  by: string;
  idem: string;
};
export const payable = (p: Doc<Payment>[], target: Payment["target"], id: string) => p.filter((x) => x.data.target === target && x.data.target_id === id);
export function paidSums(p: Doc<Payment>[], target: Payment["target"], id: string) {
  const mine = payable(p, target, id);
  return { confirmed: mine.filter((x) => x.data.status === "confirme").reduce((a, x) => a + x.data.amount, 0), pending: mine.filter((x) => x.data.status === "en_attente").reduce((a, x) => a + x.data.amount, 0) };
}

// ---------- Chambre froide ----------

/** Relevé de température. Toujours saisi à la main : aucun capteur n'est connecté. */
export type Temp = { value: number; at: string; by: string; source: "manuel"; zone: "froid" | "cuisine"; equipment: string; note: string; out: boolean; out_reason: string; treated: boolean; treated_by: string | null };

/** Seuils applicables : ceux de la chambre froide et ceux des produits qu'elle contient. */
export function coldLimits(s: Settings, items: Doc<Item>[]) {
  const stored = items.filter((i) => i.data.active && i.data.zone === "froid" && i.data.qty > 0);
  let min = s.cold_min;
  let max = s.cold_max;
  const from: string[] = [];
  for (const i of stored) {
    if (i.data.temp_min !== null && (min === null || i.data.temp_min > min)) {
      min = i.data.temp_min;
      from.push(i.data.name);
    }
    if (i.data.temp_max !== null && (max === null || i.data.temp_max < max)) {
      max = i.data.temp_max;
      from.push(i.data.name);
    }
  }
  return { min, max, from: [...new Set(from)], configured: min !== null || max !== null };
}
export function tempOut(value: number, lim: { min: number | null; max: number | null }) {
  if (lim.min !== null && value < lim.min) return `inférieure au minimum (${lim.min} °C)`;
  if (lim.max !== null && value > lim.max) return `supérieure au maximum (${lim.max} °C)`;
  return "";
}

// ---------- Tâches et alertes ----------

export const TASK_KINDS = ["nettoyage", "entretien", "reparation", "signalement", "tache"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_KIND_LABELS: Record<TaskKind, string> = { nettoyage: "Nettoyage", entretien: "Entretien", reparation: "Réparation", signalement: "Signalement", tache: "Tâche" };
export const FREQUENCIES = ["aucune", "quotidienne", "hebdomadaire", "mensuelle"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABELS: Record<Frequency, string> = { aucune: "Ponctuelle", quotidienne: "Chaque jour", hebdomadaire: "Chaque semaine", mensuelle: "Chaque mois" };
export const TASK_STATUSES = ["a_faire", "en_cours", "fait", "annule"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { a_faire: "À faire", en_cours: "En cours", fait: "Terminée", annule: "Annulée" };
export type Task = {
  zone: DataZone;
  kind: TaskKind;
  title: string;
  description: string;
  frequency: Frequency;
  assignee_id: string | null;
  staff_id: string | null;
  due: string | null;
  status: TaskStatus;
  done_at: string | null;
  done_by: string | null;
  cost: number | null;
  equipment_id: string | null;
  room_id: string | null;
  urgent: boolean;
  history: HistoryEntry[];
  by: string;
};
export const taskOpen = (t: Task) => t.status === "a_faire" || t.status === "en_cours";
export const taskLate = (t: Task, now = new Date()) => taskOpen(t) && t.due !== null && t.due < today(now);
export function nextDue(from: string, f: Frequency): string | null {
  if (f === "aucune") return null;
  const d = new Date(`${from}T12:00:00`);
  if (f === "quotidienne") d.setDate(d.getDate() + 1);
  if (f === "hebdomadaire") d.setDate(d.getDate() + 7);
  if (f === "mensuelle") d.setMonth(d.getMonth() + 1);
  return today(d);
}

// ---------- Dépenses et personnel ----------

export const EXPENSE_CATEGORIES = ["Achats alimentaires", "Boissons", "Pertes alimentaires", "Loyer", "Électricité / eau", "Gaz", "Salaires", "Entretien et réparations", "Fournitures", "Mobilier et équipement", "Linge et blanchisserie", "Transport", "Taxes", "Autre"] as const;
export type Expense = { date: string; category: string; amount: number; description: string; zone: DataZone | "general"; reference: string; proof: string | null; deleted: { at: string; by: string } | null; idem: string; by: string };

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"] as const;
export type Shift = { day: number; start: string; end: string };
/** Employé (avec ou sans compte sur le logiciel). */
export type Staff = { name: string; role: string; phone: string; member_id: string | null; active: boolean; schedule: Shift[]; notes: string };

// ---------- Hôtel ----------

export const ROOM_STATES = ["disponible", "occupee", "a_nettoyer", "maintenance"] as const;
export type RoomState = (typeof ROOM_STATES)[number];
export const ROOM_STATE_LABELS: Record<RoomState | "reservee", string> = { disponible: "Disponible", occupee: "Occupée", a_nettoyer: "À nettoyer", maintenance: "En maintenance", reservee: "Réservée" };
export type Room = { number: string; type: string; capacity: number; beds: string; amenities: string[]; price_night: number | null; floor: string; housekeeping: "propre" | "a_nettoyer"; maintenance: boolean; notes: string };

export const STAY_STATUSES = ["reservee", "arrivee", "partie", "annulee", "absent"] as const;
export type StayStatus = (typeof STAY_STATUSES)[number];
export const STAY_STATUS_LABELS: Record<StayStatus, string> = { reservee: "Réservée", arrivee: "En séjour", partie: "Partie", annulee: "Annulée", absent: "Non présenté" };
export const STAY_ACTIVE: StayStatus[] = ["reservee", "arrivee"];
export type Charge = { id: string; label: string; amount: number; order_id: string | null; at: string; by: string };
export type Stay = {
  ref: string;
  room_id: string;
  guest_id: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  rate: number;
  status: StayStatus;
  charges: Charge[];
  note: string;
  invoice_no: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  history: HistoryEntry[];
  idem: string;
  by: string;
};
export type Guest = { name: string; phone: string; email: string; id_type: string; id_number: string; nationality: string; address: string; notes: string };

export const nights = (arrival: string, departure: string) => Math.max(0, Math.round((Date.parse(`${departure}T12:00:00`) - Date.parse(`${arrival}T12:00:00`)) / 86_400_000));
export const stayTotal = (s: Pick<Stay, "arrival" | "departure" | "rate" | "charges">) => nights(s.arrival, s.departure) * s.rate + s.charges.reduce((a, c) => a + c.amount, 0);
/** Deux séjours se chevauchent si l'un commence avant le départ de l'autre (le jour du départ est libre). */
export const staysOverlap = (a: Pick<Stay, "arrival" | "departure">, b: Pick<Stay, "arrival" | "departure">) => a.arrival < b.departure && b.arrival < a.departure;

/**
 * État affiché d'une chambre, déduit des séjours enregistrés :
 * maintenance > occupée (client arrivé) > à nettoyer > réservée (séjour confirmé couvrant aujourd'hui) > disponible.
 */
export function roomState(room: Doc<Room>, stays: Doc<Stay>[], now = new Date()): RoomState | "reservee" {
  if (room.data.maintenance) return "maintenance";
  const mine = stays.filter((s) => s.data.room_id === room.id);
  if (mine.some((s) => s.data.status === "arrivee")) return "occupee";
  if (room.data.housekeeping === "a_nettoyer") return "a_nettoyer";
  const t = today(now);
  if (mine.some((s) => s.data.status === "reservee" && s.data.arrival <= t && s.data.departure > t)) return "reservee";
  return "disponible";
}

/** Taux d'occupation sur une période : nuits vendues (séjours non annulés) / nuits disponibles. */
export function occupancy(rooms: Doc<Room>[], stays: Doc<Stay>[], p: Period) {
  const days = nights(p.from, p.to) + 1;
  const available = rooms.length * days;
  let sold = 0;
  const end = new Date(`${p.to}T12:00:00`);
  end.setDate(end.getDate() + 1);
  const to = today(end);
  for (const s of stays) {
    if (!["reservee", "arrivee", "partie"].includes(s.data.status)) continue;
    const a = s.data.arrival > p.from ? s.data.arrival : p.from;
    const b = s.data.departure < to ? s.data.departure : to;
    sold += nights(a, b);
  }
  return { available, sold, rate: available ? Math.round((sold / available) * 1000) / 10 : null };
}

// ---------- Photos de l'établissement ----------

/** Photo réelle importée par le propriétaire (référence visuelle, jamais une mesure). */
export type Photo = { category: PhotoCategory; data_url: string; caption: string; tint: string | null; by: string };

// ---------- Indicateurs ----------

export function finances(d: VenueData, p: Period) {
  const pays = (d.payment as Doc<Payment>[]).filter((x) => x.data.status === "confirme" && inPeriod(x.data.confirmed_at ?? x.data.at, p));
  const restaurant = pays.filter((x) => x.data.target === "order").reduce((a, x) => a + x.data.amount, 0);
  const lodging = pays.filter((x) => x.data.target === "stay").reduce((a, x) => a + x.data.amount, 0);
  const pending = (d.payment as Doc<Payment>[]).filter((x) => x.data.status === "en_attente");
  const expenses = (d.expense as Doc<Expense>[]).filter((x) => !x.data.deleted && inPeriod(x.data.date, p));
  const spent = expenses.reduce((a, x) => a + x.data.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.data.category, (byCategory.get(e.data.category) ?? 0) + e.data.amount);
  const orders = (d.order as Doc<Order>[]).filter((o) => o.data.status !== "annulee" && inPeriod(o.created_at, p));
  const roomCharged = orders.filter((o) => o.data.pay_status === "chambre").reduce((a, o) => a + o.data.total, 0);
  return {
    receipts: restaurant + lodging,
    restaurant,
    lodging,
    /** Consommations ajoutées aux notes de chambre : encaissées avec le séjour, jamais comptées deux fois. */
    roomCharged,
    pendingCount: pending.length,
    pendingAmount: pending.reduce((a, x) => a + x.data.amount, 0),
    spent,
    profit: restaurant + lodging - spent,
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    payments: pays,
    expenses,
    orders,
  };
}

/** Résultats par jour, semaine ou mois (recettes confirmées, dépenses, commandes). */
export function series(d: VenueData, p: Period, step: "jour" | "semaine" | "mois") {
  const key = (iso: string) => {
    const s = iso.slice(0, 10);
    if (step === "jour") return s;
    if (step === "mois") return s.slice(0, 7);
    const dt = new Date(`${s}T12:00:00`);
    dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
    return today(dt);
  };
  const rows = new Map<string, { receipts: number; expenses: number; orders: number; ordersTotal: number }>();
  const row = (k: string) => rows.get(k) ?? (rows.set(k, { receipts: 0, expenses: 0, orders: 0, ordersTotal: 0 }), rows.get(k)!);
  for (const x of d.payment as Doc<Payment>[]) if (x.data.status === "confirme" && inPeriod(x.data.confirmed_at ?? x.data.at, p)) row(key(x.data.confirmed_at ?? x.data.at)).receipts += x.data.amount;
  for (const x of d.expense as Doc<Expense>[]) if (!x.data.deleted && inPeriod(x.data.date, p)) row(key(x.data.date)).expenses += x.data.amount;
  for (const o of d.order as Doc<Order>[])
    if (o.data.status !== "annulee" && inPeriod(o.created_at, p)) {
      const r = row(key(o.created_at));
      r.orders += 1;
      r.ordersTotal += o.data.total;
    }
  return [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ key: k, ...v, profit: v.receipts - v.expenses }));
}

export const orderDue = (o: Order, payments: Doc<Payment>[], id: string) => (o.status === "annulee" || o.pay_status === "chambre" ? 0 : Math.max(0, o.total - paidSums(payments, "order", id).confirmed));
export const stayDue = (s: Stay, payments: Doc<Payment>[], id: string) => (s.status === "annulee" || s.status === "absent" ? 0 : Math.max(0, stayTotal(s) - paidSums(payments, "stay", id).confirmed));
export { round2 as r2 };
