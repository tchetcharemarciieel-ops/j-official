/**
 * Module « MiniSoft Transport & Delivery » : commandes et colis, suivi, livreurs, véhicules,
 * tarification, paiements, finances. Modèle partagé par le serveur, le navigateur et les tests.
 *
 * Les données sont rangées dans la table `records` existante sous des identifiants réservés
 * (« tr:… »). Chaque entreprise est un projet MiniSoft : l'isolation repose sur `project_id`.
 * Aucune valeur n'est inventée : indicateurs calculés sur les fiches enregistrées, positions
 * GPS uniquement celles partagées par les livreurs avec leur accord.
 */

export const COLLECTIONS = ["settings", "order", "courier", "vehicle", "transaction", "file", "counter"] as const;
export type Col = (typeof COLLECTIONS)[number];
export const entityKey = (c: Col) => `tr:${c}`;
export const colFromEntity = (e: string): Col | null => {
  const c = e.startsWith("tr:") ? e.slice(3) : "";
  return (COLLECTIONS as readonly string[]).includes(c) ? (c as Col) : null;
};
export type Doc<T = Record<string, unknown>> = { id: string; data: T; created_at: string; updated_at: string };
export type TransportData = { [K in Col]: Doc[] };
export const emptyData = (): TransportData => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as TransportData;
export const round2 = (n: number) => Math.round(n * 100) / 100;
export const today = (d = new Date()) => d.toISOString().slice(0, 10);

export type TransportRole = "owner" | "admin" | "manager" | "employee" | "viewer";
export const LEVEL: Record<TransportRole, number> = { viewer: 0, employee: 1, manager: 2, admin: 2, owner: 2 };

export const CURRENCIES = {
  XAF: { label: "FCFA", name: "Franc CFA (XAF)", decimals: 0 },
  XOF: { label: "FCFA", name: "Franc CFA (XOF)", decimals: 0 },
  EUR: { label: "€", name: "Euro", decimals: 2 },
  USD: { label: "$", name: "Dollar américain", decimals: 2 },
  CDF: { label: "FC", name: "Franc congolais", decimals: 0 },
  GNF: { label: "GNF", name: "Franc guinéen", decimals: 0 },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;
export const money = (n: number | null | undefined, code: CurrencyCode = "XAF") => {
  if (n === null || n === undefined) return "—";
  const c = CURRENCIES[code] ?? CURRENCIES.XAF;
  const v = c.decimals ? n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : Math.round(n).toLocaleString("fr-FR");
  return `${v} ${c.label}`;
};

// ---------- Types d'entreprise ----------
export const TRANSPORT_TYPES = {
  livraison: { label: "Service de livraison", icon: "📦" },
  coursier: { label: "Coursier / livreur indépendant", icon: "🛵" },
  marchandises: { label: "Transport de marchandises", icon: "🚚" },
  restaurant: { label: "Livraison de restaurant", icon: "🍽️" },
  boutique: { label: "Boutique avec livraison à domicile", icon: "🛍️" },
  logistique: { label: "Société de logistique", icon: "🏭" },
  agence: { label: "Agence de transport", icon: "🚌" },
} as const;
export type TransportType = keyof typeof TRANSPORT_TYPES;
export const TRANSPORT_TYPE_IDS = Object.keys(TRANSPORT_TYPES) as TransportType[];

export const VEHICLE_KINDS = { moto: "Moto", voiture: "Voiture", camionnette: "Camionnette", camion: "Camion" } as const;
export type VehicleKind = keyof typeof VEHICLE_KINDS;
export const URGENCY = { normal: "Normale", express: "Express", urgent: "Urgente" } as const;
export type Urgency = keyof typeof URGENCY;

// ---------- Tarification ----------
export type Tariff = {
  base: number;
  per_km: number;
  per_kg: number;
  /** Poids inclus dans le prix de base (kg). */
  free_kg: number;
  min_price: number;
  zones: { name: string; fee: number }[];
  parcel_types: { name: string; mult: number }[];
  vehicle_mult: Record<VehicleKind, number>;
  urgency_mult: Record<Urgency, number>;
};
export const defaultTariff = (): Tariff => ({
  base: 0, per_km: 0, per_kg: 0, free_kg: 5, min_price: 0,
  zones: [], parcel_types: [{ name: "Colis standard", mult: 1 }],
  vehicle_mult: { moto: 1, voiture: 1, camionnette: 1, camion: 1 },
  urgency_mult: { normal: 1, express: 1, urgent: 1 },
});
export type PriceInput = { distance_km?: number | null; zone?: string; parcel_type?: string; weight_kg?: number | null; vehicle_kind?: VehicleKind; urgency?: Urgency };
export type PriceResult = { total: number; lines: { label: string; amount: number }[]; configured: boolean };

/**
 * Prix calculé uniquement avec les tarifs définis par l'entreprise. Tant qu'aucun tarif n'est
 * renseigné, `configured` est faux : aucun prix n'est inventé.
 */
export function computePrice(i: PriceInput, t: Tariff, currency: CurrencyCode = "XAF"): PriceResult {
  const configured = t.base > 0 || t.per_km > 0 || t.per_kg > 0 || t.min_price > 0 || t.zones.some((z) => z.fee > 0);
  const lines: { label: string; amount: number }[] = [];
  const dec = CURRENCIES[currency]?.decimals ?? 0;
  const r = (n: number) => (dec ? round2(n) : Math.round(n));
  let sub = 0;
  if (t.base > 0) { lines.push({ label: "Prix de base", amount: r(t.base) }); sub += t.base; }
  const km = i.distance_km && i.distance_km > 0 ? i.distance_km : 0;
  if (km && t.per_km > 0) { const a = r(km * t.per_km); lines.push({ label: `Distance ${km} km`, amount: a }); sub += km * t.per_km; }
  const z = t.zones.find((x) => x.name === i.zone);
  if (z && z.fee > 0) { lines.push({ label: `Zone ${z.name}`, amount: r(z.fee) }); sub += z.fee; }
  const w = i.weight_kg && i.weight_kg > 0 ? i.weight_kg : 0;
  if (w > t.free_kg && t.per_kg > 0) { const a = r((w - t.free_kg) * t.per_kg); lines.push({ label: `Poids ${w} kg`, amount: a }); sub += (w - t.free_kg) * t.per_kg; }
  let mult = 1;
  const p = t.parcel_types.find((x) => x.name === i.parcel_type);
  if (p && p.mult !== 1) { mult *= p.mult; lines.push({ label: `Colis « ${p.name} » ×${p.mult}`, amount: 0 }); }
  const v = i.vehicle_kind ? t.vehicle_mult[i.vehicle_kind] ?? 1 : 1;
  if (v !== 1) { mult *= v; lines.push({ label: `Véhicule ${VEHICLE_KINDS[i.vehicle_kind!]} ×${v}`, amount: 0 }); }
  const u = i.urgency ? t.urgency_mult[i.urgency] ?? 1 : 1;
  if (u !== 1) { mult *= u; lines.push({ label: `Urgence ${URGENCY[i.urgency!]} ×${u}`, amount: 0 }); }
  let total = r(sub * mult);
  if (t.min_price > 0 && total < t.min_price) { total = r(t.min_price); lines.push({ label: `Minimum de facturation`, amount: 0 }); }
  return { total: configured ? total : 0, lines, configured };
}

/** Distance à vol d'oiseau (km) entre deux points : indication seulement, pas un itinéraire routier. */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return round2(2 * R * Math.asin(Math.sqrt(h)));
}

// ---------- Paramètres ----------
export type Settings = {
  name: string;
  transport_type: TransportType;
  address: string;
  phone: string;
  email: string;
  logo_id: string | null;
  couriers_count: number;
  vehicles_count: number;
  goods: string[];
  currency: CurrencyCode;
  primary: string;
  tariff: Tariff;
  /** Délai de livraison annoncé (heures) selon l'urgence : sert à la date estimée et aux retards. */
  hours: Record<Urgency, number>;
  /** Part du prix reversée au livreur (%), pour le calcul des commissions. */
  commission_rate: number;
  tracking: { show_courier: boolean; show_eta: boolean };
  /** Page publique de demande de livraison. */
  online: { open: boolean; mobile_money_info: string; pay_delivery: boolean; pay_cash: boolean; pay_mobile: boolean };
  invoice_note: string;
};
export const defaultSettings = (name = "Mon service de livraison", type: TransportType = "livraison"): Settings => ({
  name, transport_type: type, address: "", phone: "", email: "", logo_id: null, couriers_count: 1, vehicles_count: 1, goods: [], currency: "XAF", primary: "#2563eb",
  tariff: defaultTariff(), hours: { normal: 24, express: 6, urgent: 2 }, commission_rate: 0,
  tracking: { show_courier: true, show_eta: true },
  online: { open: false, mobile_money_info: "", pay_delivery: true, pay_cash: true, pay_mobile: false },
  invoice_note: "",
});
export function settingsOf(doc: Doc | undefined, fallbackName = "Mon service de livraison"): Settings {
  const d = defaultSettings(fallbackName);
  const s = (doc?.data ?? {}) as Partial<Settings>;
  return { ...d, ...s, tariff: { ...d.tariff, ...(s.tariff ?? {}), vehicle_mult: { ...d.tariff.vehicle_mult, ...(s.tariff?.vehicle_mult ?? {}) }, urgency_mult: { ...d.tariff.urgency_mult, ...(s.tariff?.urgency_mult ?? {}) } }, hours: { ...d.hours, ...(s.hours ?? {}) }, tracking: { ...d.tracking, ...(s.tracking ?? {}) }, online: { ...d.online, ...(s.online ?? {}) } };
}

// ---------- Commandes ----------
export const ORDER_STATUS = {
  nouvelle: "Nouvelle commande",
  attente: "En attente d'affectation",
  affecte: "Livreur affecté",
  recupere: "Colis récupéré",
  en_cours: "En cours de livraison",
  arrive: "Arrivé à destination",
  livre: "Livré",
  echec: "Échec de livraison",
  retour: "Retour en agence",
  annule: "Annulé",
} as const;
export type OrderStatus = keyof typeof ORDER_STATUS;
export const ORDER_FLOW: OrderStatus[] = ["nouvelle", "attente", "affecte", "recupere", "en_cours", "arrive", "livre"];
export const PROGRESS: Record<OrderStatus, number> = { nouvelle: 5, attente: 12, affecte: 28, recupere: 50, en_cours: 70, arrive: 90, livre: 100, echec: 70, retour: 100, annule: 0 };
export const TERMINAL: OrderStatus[] = ["livre", "annule", "retour"];
export const ACTIVE: OrderStatus[] = ["nouvelle", "attente", "affecte", "recupere", "en_cours", "arrive", "echec"];
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  nouvelle: ["attente", "affecte", "annule"],
  attente: ["affecte", "annule"],
  affecte: ["recupere", "attente", "annule"],
  recupere: ["en_cours", "echec", "annule"],
  en_cours: ["arrive", "livre", "echec"],
  arrive: ["livre", "echec"],
  echec: ["affecte", "attente", "retour", "annule"],
  retour: ["attente", "annule"],
  livre: [],
  annule: [],
};
/** Statuts qu'un livreur peut poser lui-même sur sa mission. */
export const COURIER_STEPS: Partial<Record<OrderStatus, OrderStatus[]>> = {
  affecte: ["recupere"], recupere: ["en_cours", "echec"], en_cours: ["arrive", "livre", "echec"], arrive: ["livre", "echec"],
};

export const PAY_METHODS = { especes: "Espèces", livraison: "Paiement à la livraison", mobile_money: "Paiement mobile", en_ligne: "Paiement en ligne", deja_paye: "Déjà payé" } as const;
export type PayMethod = keyof typeof PAY_METHODS;
export const PAY_STATUS = { en_attente: "En attente", confirme: "Confirmé", echoue: "Échoué" } as const;
export type Payment = { id: string; amount: number; method: PayMethod; status: keyof typeof PAY_STATUS; ref: string; date: string; by: string; note: string; tx_id: string | null };

export type Place = { address: string; lat: number | null; lng: number | null };
export type Person = { name: string; phone: string };
export type HistoryEntry = { at: string; by: string; from: OrderStatus | null; to: OrderStatus; note: string };
export type Order = {
  number: string;
  tracking: string;
  status: OrderStatus;
  sender: Person;
  recipient: Person;
  pickup: Place;
  dropoff: Place;
  parcel: { desc: string; weight_kg: number | null; dims: string; type: string; photo_ids: string[] };
  zone: string;
  urgency: Urgency;
  vehicle_kind: VehicleKind;
  distance_km: number | null;
  price: number;
  price_lines: { label: string; amount: number }[];
  instructions: string;
  courier_id: string | null;
  accepted: boolean;
  eta: string | null;
  pay_mode: PayMethod;
  payments: Payment[];
  proof: { photo_id: string | null; note: string; at: string; by: string } | null;
  fail_reason: string;
  problem: { note: string; at: string; by: string } | null;
  history: HistoryEntry[];
  source: "interne" | "public";
  created_by: string;
  at: string;
  delivered_at: string | null;
};
export const paidOf = (o: Pick<Order, "payments">) => round2(o.payments.filter((p) => p.status === "confirme").reduce((a, p) => a + p.amount, 0));
export const dueOf = (o: Pick<Order, "payments" | "price" | "status">) => (o.status === "annule" ? 0 : Math.max(0, round2(o.price - paidOf(o))));
export const orderLate = (o: Order, now = new Date()) => Boolean(o.eta && !TERMINAL.includes(o.status) && Date.parse(o.eta) < now.getTime());
export const isActive = (o: Order) => ACTIVE.includes(o.status);

// ---------- Livreurs, véhicules, finances ----------
export type Courier = { name: string; phone: string; email: string; user_id: string | null; zones: string[]; vehicle_id: string | null; available: boolean; status: "actif" | "inactif"; sharing: boolean; pos: { lat: number; lng: number; at: string } | null; commission_rate: number | null; notes: string };
export const VEHICLE_STATE = { bon: "Bon état", entretien: "À entretenir", panne: "En panne", reforme: "Réformé" } as const;
export type MaintenanceEntry = { id: string; date: string; kind: string; cost: number; note: string };
export type FuelEntry = { id: string; date: string; liters: number | null; cost: number };
export type Vehicle = { brand: string; model: string; plate: string; kind: VehicleKind; driver_id: string | null; state: keyof typeof VEHICLE_STATE; available: boolean; next_maintenance: string | null; maintenance: MaintenanceEntry[]; fuel: FuelEntry[]; notes: string };
export const TX_CATEGORIES = { livraison: "Livraisons", carburant: "Carburant", entretien: "Entretien", paiement_livreur: "Paiements des livreurs", commission: "Commissions", assurance: "Assurance", loyer: "Loyer", autre: "Autres" } as const;
export type TxCategory = keyof typeof TX_CATEGORIES;
export type Transaction = { type: "recette" | "depense"; amount: number; category: TxCategory; date: string; description: string; method: PayMethod; order_id: string | null; courier_id: string | null; vehicle_id: string | null; by: string };
export type FileDoc = { name: string; mime: string; size: number; data: string };

// ---------- Calculs ----------
export function dayStats(orders: Doc<Order>[], txs: Doc<Transaction>[], day: string, now = new Date()) {
  const o = orders.map((d) => d.data);
  const count = (s: OrderStatus[]) => o.filter((x) => s.includes(x.status)).length;
  const recDay = txs.filter((t) => t.data.type === "recette" && t.data.date === day).reduce((a, t) => a + t.data.amount, 0);
  const depDay = txs.filter((t) => t.data.type === "depense" && t.data.date === day).reduce((a, t) => a + t.data.amount, 0);
  const rec = txs.filter((t) => t.data.type === "recette").reduce((a, t) => a + t.data.amount, 0);
  const dep = txs.filter((t) => t.data.type === "depense").reduce((a, t) => a + t.data.amount, 0);
  return {
    total: o.length,
    waiting: count(["nouvelle", "attente"]),
    assigned: count(["affecte"]),
    inProgress: count(["recupere", "en_cours", "arrive"]),
    done: count(["livre"]),
    cancelled: count(["annule"]),
    failed: count(["echec", "retour"]),
    late: o.filter((x) => orderLate(x, now)).length,
    revenueDay: round2(recDay), expenseDay: round2(depDay), revenue: round2(rec), expense: round2(dep),
  };
}
export function courierStats(orders: Doc<Order>[], courierId: string) {
  const mine = orders.filter((o) => o.data.courier_id === courierId);
  const done = mine.filter((o) => o.data.status === "livre");
  const failed = mine.filter((o) => o.data.status === "echec" || o.data.status === "retour");
  const settled = done.length + failed.length;
  const onTime = done.filter((o) => !o.data.eta || !o.data.delivered_at || Date.parse(o.data.delivered_at) <= Date.parse(o.data.eta)).length;
  const mins = done.map((o) => {
    const rec = o.data.history.find((h) => h.to === "recupere");
    return rec && o.data.delivered_at ? (Date.parse(o.data.delivered_at) - Date.parse(rec.at)) / 60000 : null;
  }).filter((x): x is number => x !== null && x >= 0);
  return {
    assigned: mine.length, done: done.length, failed: failed.length, active: mine.filter((o) => ACTIVE.includes(o.data.status)).length,
    successRate: settled ? Math.round((done.length / settled) * 100) : null,
    onTimeRate: done.length ? Math.round((onTime / done.length) * 100) : null,
    avgMinutes: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null,
    revenue: round2(done.reduce((a, o) => a + o.data.price, 0)),
  };
}
export function monthlySeries(txs: Doc<Transaction>[], now = new Date(), months = 6) {
  const out: { ym: string; label: string; income: number; expense: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const list = txs.filter((t) => t.data.date.startsWith(ym));
    out.push({ ym, label: d.toLocaleDateString("fr-FR", { month: "short" }), income: round2(list.filter((t) => t.data.type === "recette").reduce((a, t) => a + t.data.amount, 0)), expense: round2(list.filter((t) => t.data.type === "depense").reduce((a, t) => a + t.data.amount, 0)) });
  }
  return out;
}
export const normPhone = (p: string) => p.replace(/\D/g, "");
export function monthRange(ym: string) {
  const [y, m] = ym.split("-").map(Number) as [number, number];
  const last = new Date(y, m, 0).getDate();
  return { from: `${ym}-01`, to: `${ym}-${String(last).padStart(2, "0")}` };
}
