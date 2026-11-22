/**
 * Module « MiniSoft Shop » : gestion complète d'une boutique (caisse, stock, boutique en ligne,
 * commandes, clients, fournisseurs, dépenses, rapports). Modèle métier partagé par le serveur,
 * le navigateur et les tests.
 *
 * Les données sont rangées dans la table `records` existante sous des identifiants réservés
 * (« sh:… »), qui ne peuvent jamais entrer en conflit avec les tables d'un logiciel généré.
 * Chaque boutique est un projet MiniSoft : l'isolation entre commerces repose sur `project_id`
 * (politiques RLS existantes, écritures uniquement côté serveur).
 * Aucune valeur n'est inventée : tous les indicateurs sont calculés sur les fiches enregistrées.
 */

export const COLLECTIONS = ["settings", "category", "product", "move", "sale", "register", "customer", "supplier", "po", "order", "expense", "photo", "counter"] as const;
export type Col = (typeof COLLECTIONS)[number];
export const entityKey = (c: Col) => `sh:${c}`;
export const colFromEntity = (e: string): Col | null => {
  const c = e.startsWith("sh:") ? e.slice(3) : "";
  return (COLLECTIONS as readonly string[]).includes(c) ? (c as Col) : null;
};

export type Doc<T = Record<string, unknown>> = { id: string; data: T; created_at: string; updated_at: string };
export type ShopData = { [K in Col]: Doc[] };
export const emptyData = (): ShopData => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as ShopData;

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const money = (n: number) => `${Math.round(n).toLocaleString("fr-FR").replace(/ /g, " ")} FCFA`;
export const today = (d = new Date()) => d.toISOString().slice(0, 10);

// ---------- Rôles ----------

export type ShopRole = "owner" | "admin" | "manager" | "employee" | "viewer";
/** 0 lecture seule, 1 équipe (caisse, stock, vente), 2 gérant (responsable, administrateur, propriétaire). */
export const LEVEL: Record<ShopRole, number> = { viewer: 0, employee: 1, manager: 2, admin: 2, owner: 2 };

// ---------- Boutique ----------

export const SHOP_TYPES = {
  vetements: { label: "Boutique de vêtements", attrs: ["Taille", "Couleur"], icon: "👕" },
  alimentation: { label: "Magasin alimentaire", attrs: ["Format"], icon: "🥫" },
  superette: { label: "Supérette", attrs: ["Format"], icon: "🛒" },
  cosmetique: { label: "Parfumerie et cosmétiques", attrs: ["Format", "Parfum"], icon: "🧴" },
  telephones: { label: "Téléphones et électronique", attrs: ["Modèle", "Couleur"], icon: "📱" },
  chaussures: { label: "Boutique de chaussures", attrs: ["Pointure", "Couleur"], icon: "👟" },
  quincaillerie: { label: "Quincaillerie", attrs: ["Format"], icon: "🔨" },
  accessoires: { label: "Magasin d'accessoires", attrs: ["Couleur", "Modèle"], icon: "👜" },
  autre: { label: "Autre commerce", attrs: ["Modèle"], icon: "🏪" },
} as const;
export type ShopType = keyof typeof SHOP_TYPES;
export const SHOP_TYPE_IDS = Object.keys(SHOP_TYPES) as ShopType[];

export const DEFAULT_UNITS = ["pièce", "carton", "kg", "g", "litre", "mètre", "paquet"];
/** Attributs de variantes proposés (le commerçant peut en saisir d'autres). */
export const VARIANT_ATTRS = ["Taille", "Couleur", "Modèle", "Pointure", "Format", "Parfum"];

export type Settings = {
  type: ShopType;
  name: string;
  description: string;
  welcome: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  hours: string;
  primary: string;
  logo_id: string | null;
  banner_id: string | null;
  units: string[];
  low_stock_default: number;
  receipt_note: string;
  /** Vente à crédit (paiement différé ou partiel) autorisée en caisse. */
  allow_credit: boolean;
  delivery: { enabled: boolean; fee: number; info: string };
  pickup: { enabled: boolean; info: string };
  /** Deux moyens de paiement en ligne seulement : à la livraison (ou à la remise) et ZingoPay. */
  online: { published: boolean; ordering: boolean; pay_delivery: boolean; zingopay: boolean };
  /** Durée de réservation du stock d'une commande en ligne non confirmée. */
  reservation_minutes: number;
};

export function defaultSettings(name = "Ma boutique", type: ShopType = "autre"): Settings {
  return {
    type,
    name,
    description: "",
    welcome: "",
    phone: "",
    whatsapp: "",
    email: "",
    address: "",
    hours: "",
    primary: "#2563eb",
    logo_id: null,
    banner_id: null,
    units: [...DEFAULT_UNITS],
    low_stock_default: 3,
    receipt_note: "Merci pour votre achat !",
    allow_credit: false,
    delivery: { enabled: false, fee: 0, info: "" },
    pickup: { enabled: true, info: "" },
    online: { published: false, ordering: true, pay_delivery: true, zingopay: false },
    reservation_minutes: 120,
  };
}

/** Réglages enregistrés complétés par les valeurs par défaut (anciennes fiches incomplètes). */
export function settingsOf(doc: Doc | undefined, fallbackName = "Ma boutique"): Settings {
  const d = defaultSettings(fallbackName);
  const s = (doc?.data ?? {}) as Partial<Settings>;
  return { ...d, ...s, delivery: { ...d.delivery, ...s.delivery }, pickup: { ...d.pickup, ...s.pickup }, online: { ...d.online, ...s.online }, units: s.units?.length ? s.units : d.units };
}

// ---------- Catalogue ----------

export type Category = { name: string; sort: number };

export type Variant = { id: string; values: Record<string, string>; sku: string; barcode: string; price: number | null; buy_price: number | null; stock: number; active: boolean };
export type Lot = { id: string; number: string; expiry: string | null; qty: number };
/** Réservation de stock d'une commande en ligne (`key` : identifiant de la commande). */
export type Reservation = { key: string; variant_id: string | null; qty: number; until: string };

export type Product = {
  name: string;
  description: string;
  category_id: string | null;
  buy_price: number;
  sell_price: number;
  unit: string;
  min_qty: number;
  sku: string;
  barcode: string;
  supplier_id: string | null;
  /** Disponible à la vente. */
  active: boolean;
  /** Archivé : retiré du catalogue, historique conservé. */
  archived: boolean;
  /** Visible dans la boutique en ligne. */
  online: boolean;
  photo_ids: string[];
  variant_attrs: string[];
  variants: Variant[];
  /** Stock d'un produit sans variante. */
  stock: number;
  track_expiry: boolean;
  lots: Lot[];
  reservations: Reservation[];
  /** Clés des mouvements déjà appliqués : un mouvement n'est jamais compté deux fois. */
  op_keys: string[];
};

export const variantLabel = (v: Pick<Variant, "values">) => Object.values(v.values).filter(Boolean).join(" / ") || "Standard";
export const hasVariants = (p: Pick<Product, "variants">) => p.variants.length > 0;
export function findVariant(p: Product, variantId: string | null) {
  if (!hasVariants(p)) return null;
  return p.variants.find((v) => v.id === variantId) ?? null;
}
export const priceOf = (p: Product, variantId: string | null) => findVariant(p, variantId)?.price ?? p.sell_price;
export const costOf = (p: Product, variantId: string | null) => findVariant(p, variantId)?.buy_price ?? p.buy_price;
export function stockOf(p: Product, variantId: string | null): number {
  if (!hasVariants(p)) return p.stock;
  return findVariant(p, variantId)?.stock ?? 0;
}
export const totalStock = (p: Product) => (hasVariants(p) ? round2(p.variants.reduce((a, v) => a + v.stock, 0)) : p.stock);
const live = (r: Reservation, now: number) => Date.parse(r.until) > now;
export function reservedOf(p: Product, variantId: string | null, now = Date.now()) {
  return round2(p.reservations.filter((r) => live(r, now) && (hasVariants(p) ? r.variant_id === variantId : true)).reduce((a, r) => a + r.qty, 0));
}
/** Quantité vendable : stock moins les réservations encore valables des commandes en ligne. */
export const availableOf = (p: Product, variantId: string | null, now = Date.now()) => round2(stockOf(p, variantId) - reservedOf(p, variantId, now));
export const totalAvailable = (p: Product, now = Date.now()) => (hasVariants(p) ? round2(p.variants.filter((v) => v.active).reduce((a, v) => a + Math.max(0, availableOf(p, v.id, now)), 0)) : Math.max(0, availableOf(p, null, now)));
export function stockValue(p: Product) {
  if (!hasVariants(p)) return Math.max(0, p.stock) * p.buy_price;
  return p.variants.reduce((a, v) => a + Math.max(0, v.stock) * (v.buy_price ?? p.buy_price), 0);
}
export type StockState = "rupture" | "faible" | "ok";
export function stockState(p: Product): StockState {
  const q = totalStock(p);
  if (q <= 0) return "rupture";
  if (q <= p.min_qty) return "faible";
  return "ok";
}
export const STOCK_STATE_LABELS: Record<StockState, string> = { rupture: "Rupture", faible: "Presque épuisé", ok: "En stock" };
/** Lots qui périment dans `days` jours (ou déjà périmés), avec du stock restant. */
export function expiringLots(p: Product, days = 30, now = new Date()) {
  const limit = new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return p.lots.filter((l) => l.qty > 0 && l.expiry && l.expiry <= limit);
}

// ---------- Stock ----------

export const MOVE_TYPES = {
  entree: "Entrée de marchandises",
  sortie: "Sortie",
  vente: "Vente",
  retour: "Retour client",
  annulation: "Annulation de vente",
  reception: "Réception fournisseur",
  inventaire: "Inventaire",
  ajustement: "Ajustement",
  perte: "Perte",
  endommage: "Produit endommagé",
  commande: "Commande en ligne",
} as const;
export type MoveType = keyof typeof MOVE_TYPES;
export type Move = { product_id: string; variant_id: string | null; type: MoveType; qty: number; after: number; unit_cost: number | null; reason: string; ref: string; lot: string | null; by: string; at: string; op_key: string };

// ---------- Caisse et ventes ----------

export const PAY_METHODS = { especes: "Espèces", mobile_money: "Mobile Money", carte: "Carte bancaire", zingopay: "ZingoPay", autre: "Autre" } as const;
export type PayMethod = keyof typeof PAY_METHODS;
export type Pay = { id: string; method: PayMethod; amount: number; ref: string; at: string; by: string; register_id: string | null; /** ZingoPay : confirmé par le prestataire ; les autres moyens sont déclarés par le caissier. */ verified?: boolean };
export type SaleLine = { product_id: string; variant_id: string | null; name: string; unit: string; qty: number; unit_price: number; buy_price: number; discount: number };
export type ReturnLine = { index: number; qty: number };
/** `amount` : valeur des articles retournés ; `refund` : argent rendu au client (0 si la vente était à crédit). */
export type SaleReturn = { id: string; at: string; by: string; lines: ReturnLine[]; amount: number; refund: number; method: PayMethod; reason: string; restock: boolean; register_id: string | null };
export type SaleStatus = "validee" | "annulee";
export type Sale = {
  number: string;
  at: string;
  channel: "caisse" | "en_ligne";
  items: SaleLine[];
  subtotal: number;
  /** Remise globale (montant), en plus des remises par ligne. */
  discount: number;
  total: number;
  payments: Pay[];
  returns: SaleReturn[];
  status: SaleStatus;
  customer_id: string | null;
  customer_name: string;
  register_id: string | null;
  by: string;
  order_id: string | null;
  note: string;
  invoice_number: string | null;
  /** Vente enregistrée sans connexion, synchronisée plus tard. */
  offline_at: string | null;
  /** Conflit relevé à la synchronisation (ex. stock insuffisant) : à vérifier. */
  conflict: string | null;
  cancel?: { at: string; by: string; reason: string; register_id: string | null; cash_refund: number; other_refund: number };
};

export const lineTotal = (l: Pick<SaleLine, "qty" | "unit_price" | "discount">) => Math.max(0, Math.round(l.qty * l.unit_price - l.discount));
export function saleTotals(items: Pick<SaleLine, "qty" | "unit_price" | "discount">[], discount: number) {
  const subtotal = items.reduce((a, l) => a + lineTotal(l), 0);
  return { subtotal, total: Math.max(0, subtotal - Math.round(discount)) };
}
export const paidOf = (s: Pick<Sale, "payments">) => s.payments.reduce((a, p) => a + p.amount, 0);
export const refundedOf = (s: Pick<Sale, "returns">) => s.returns.reduce((a, r) => a + r.amount, 0);
/** Reste à payer par le client (vente à crédit). */
export const refundOutOf = (s: Pick<Sale, "returns">) => s.returns.reduce((a, r) => a + r.refund, 0);
export const dueOf = (s: Sale) => (s.status === "annulee" ? 0 : Math.max(0, s.total - refundedOf(s) - (paidOf(s) - refundOutOf(s))));
/** Quantité déjà retournée de chaque ligne. */
export function returnedQty(s: Sale, index: number) {
  return round2(s.returns.reduce((a, r) => a + r.lines.filter((l) => l.index === index).reduce((b, l) => b + l.qty, 0), 0));
}
/** Valeur d'une quantité retournée : prix net de la ligne au prorata, remise globale comprise. */
export function returnValue(s: Sale, index: number, qty: number) {
  const l = s.items[index]!;
  const share = s.subtotal > 0 ? s.total / s.subtotal : 1;
  return Math.round((lineTotal(l) / l.qty) * qty * share);
}

export type CashMove = { id: string; type: "entree" | "sortie"; amount: number; reason: string; at: string; by: string };
export type Register = { status: "ouverte" | "fermee"; opened_by: string; opened_at: string; float: number; moves: CashMove[]; closed_at: string | null; closed_by: string | null; counted: number | null; expected: number | null; note: string };

/** Espèces attendues dans le tiroir : fond + encaissements en espèces + entrées − sorties − remboursements en espèces. */
export function expectedCash(reg: Doc<Register>, sales: Doc<Sale>[]) {
  let cash = reg.data.float;
  for (const s of sales) {
    for (const p of s.data.payments) if (p.method === "especes" && p.register_id === reg.id) cash += p.amount;
    for (const r of s.data.returns) if (r.method === "especes" && r.register_id === reg.id) cash -= r.refund;
    if (s.data.cancel && s.data.cancel.register_id === reg.id) cash -= s.data.cancel.cash_refund;
  }
  for (const m of reg.data.moves) cash += m.type === "entree" ? m.amount : -m.amount;
  return cash;
}

// ---------- Clients, fournisseurs, achats ----------

export type Customer = { name: string; phone: string; address: string; notes: string; source: "caisse" | "en_ligne" | "manuel" };
export type Supplier = { name: string; phone: string; email: string; address: string; notes: string };
export const PO_STATUS = { brouillon: "Brouillon", commandee: "Commandée", partielle: "Reçue en partie", recue: "Reçue", annulee: "Annulée" } as const;
export type PoStatus = keyof typeof PO_STATUS;
export type PoLine = { product_id: string; variant_id: string | null; name: string; qty: number; cost: number; received: number };
export type Po = { number: string; supplier_id: string; status: PoStatus; items: PoLine[]; total: number; payments: { id: string; amount: number; at: string; by: string }[]; expected_date: string | null; note: string; by: string; at: string };
export const poPaid = (p: Po) => p.payments.reduce((a, x) => a + x.amount, 0);
/** Montant dû au fournisseur : marchandises reçues moins les paiements. */
export const poDue = (p: Po) => (p.status === "annulee" ? 0 : Math.max(0, Math.round(p.items.reduce((a, l) => a + l.received * l.cost, 0)) - poPaid(p)));

// ---------- Commandes en ligne ----------

export const ORDER_STATUS = {
  nouvelle: "Nouvelle commande",
  attente: "En attente de confirmation",
  confirmee: "Confirmée",
  preparation: "En préparation",
  prete: "Prête",
  livraison: "En livraison",
  livree: "Livrée",
  retiree: "Retirée",
  annulee: "Annulée",
  remboursee: "Remboursée",
} as const;
export type OrderStatus = keyof typeof ORDER_STATUS;
export const OPEN_ORDER: OrderStatus[] = ["nouvelle", "attente", "confirmee", "preparation", "prete", "livraison"];
export const PAY_STATUS_LABELS = { en_attente: "Paiement non encaissé", paye: "Payée", non_confirme: "Paiement non confirmé", a_rembourser: "À rembourser", rembourse: "Remboursée" } as const;
export const PAY_MODE_LABELS = { livraison: "Paiement à la livraison", retrait: "Paiement au retrait", zingopay: "ZingoPay" } as const;
export const ORDER_FLOW: Record<OrderStatus, OrderStatus[]> = {
  nouvelle: ["confirmee", "annulee"],
  attente: ["confirmee", "annulee"],
  confirmee: ["preparation", "prete", "annulee"],
  preparation: ["prete", "annulee"],
  prete: ["livraison", "retiree", "livree", "annulee"],
  livraison: ["livree", "annulee"],
  livree: ["remboursee"],
  retiree: ["remboursee"],
  annulee: [],
  remboursee: [],
};
export type OrderLine = { product_id: string; variant_id: string | null; name: string; qty: number; unit_price: number };
export type Order = {
  number: string;
  at: string;
  items: OrderLine[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  customer: { name: string; phone: string; address: string };
  customer_id: string | null;
  mode: "livraison" | "retrait";
  /** « livraison » : le client paie à la réception (livraison ou retrait) ; « retrait » : ancien libellé, lecture seule. */
  pay_mode: "livraison" | "retrait" | "zingopay";
  /** non_confirme : ZingoPay n'a pas confirmé (échec, expiration) ; a_rembourser : payée puis refusée/annulée. */
  pay_status: "en_attente" | "paye" | "non_confirme" | "a_rembourser" | "rembourse";
  /** Paiements encaissés (confirmés par le commerçant, ou par ZingoPay après vérification). */
  payments?: Pay[];
  zp_error?: string | null;
  status: OrderStatus;
  history: { to: OrderStatus; at: string; by: string | null; note: string }[];
  tracking_token: string;
  /** Réservation du stock (jusqu'à confirmation, puis jusqu'à la remise). */
  reserved_until: string | null;
  sale_id: string | null;
  note: string;
  zp?: { id: string; pay_url: string; status: string; expires_at: string | null };
};

// ---------- Dépenses ----------

export const EXPENSE_CATS = { transport: "Transport", loyer: "Loyer", electricite: "Électricité", salaires: "Salaires", approvisionnement: "Approvisionnement", autres: "Autres" } as const;
export type ExpenseCat = keyof typeof EXPENSE_CATS;
export type Expense = { amount: number; category: ExpenseCat; date: string; description: string; photo_id: string | null; by: string };

export type Photo = { data: string; kind: "product" | "logo" | "banner" | "receipt" };

// ---------- Indicateurs (tous calculés sur les fiches) ----------

export type Period = "today" | "week" | "month" | "year" | "custom";
export function periodRange(p: Period, now = new Date(), custom?: { from: string; to: string }): { from: number; to: number; label: string } {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  if (p === "custom" && custom) return { from: Date.parse(`${custom.from}T00:00:00`), to: Date.parse(`${custom.to}T23:59:59.999`), label: `du ${custom.from} au ${custom.to}` };
  if (p === "week") {
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return { from: d.getTime(), to: now.getTime(), label: "cette semaine" };
  }
  if (p === "month") return { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: now.getTime(), label: "ce mois-ci" };
  if (p === "year") return { from: new Date(d.getFullYear(), 0, 1).getTime(), to: now.getTime(), label: "cette année" };
  return { from: d.getTime(), to: now.getTime(), label: "aujourd'hui" };
}

const inRange = (iso: string, r: { from: number; to: number }) => {
  const t = Date.parse(iso);
  return t >= r.from && t <= r.to;
};

/** Ventes validées de la période (les ventes annulées ne comptent jamais). */
export const salesIn = (sales: Doc<Sale>[], r: { from: number; to: number }) => sales.filter((s) => s.data.status === "validee" && inRange(s.data.at, r));

/**
 * Chiffres financiers d'une période, sans confusion :
 * - chiffre d'affaires = ventes validées moins les remboursements ;
 * - coût des marchandises vendues = prix d'achat enregistré sur chaque ligne (retours déduits) ;
 * - marge brute = chiffre d'affaires − coût des marchandises ;
 * - bénéfice net estimé = marge brute − dépenses de la période.
 */
export function finance(sales: Doc<Sale>[], expenses: Doc<Expense>[], r: { from: number; to: number }) {
  const list = salesIn(sales, r);
  let revenue = 0;
  let cogs = 0;
  let items = 0;
  for (const s of list) {
    revenue += s.data.total - refundedOf(s.data);
    s.data.items.forEach((l, i) => {
      const q = l.qty - returnedQty(s.data, i);
      cogs += q * l.buy_price;
      items += q;
    });
  }
  const spent = expenses.filter((e) => {
    const t = Date.parse(`${e.data.date}T12:00:00`);
    return t >= r.from - 43_200_000 && t <= r.to;
  }).reduce((a, e) => a + e.data.amount, 0);
  const gross = revenue - Math.round(cogs);
  return { revenue, salesCount: list.length, items: round2(items), cogs: Math.round(cogs), gross, expenses: spent, net: gross - spent, average: list.length ? Math.round(revenue / list.length) : null };
}

export function topProducts(sales: Doc<Sale>[], r: { from: number; to: number }, limit = 5) {
  const m = new Map<string, { name: string; qty: number; revenue: number }>();
  for (const s of salesIn(sales, r)) {
    const share = s.data.subtotal > 0 ? s.data.total / s.data.subtotal : 1;
    s.data.items.forEach((l, i) => {
      const q = l.qty - returnedQty(s.data, i);
      if (q <= 0) return;
      const k = `${l.product_id}`;
      const cur = m.get(k) ?? { name: l.name.split(" — ")[0]!, qty: 0, revenue: 0 };
      cur.qty = round2(cur.qty + q);
      cur.revenue += Math.round((lineTotal(l) / l.qty) * q * share);
      m.set(k, cur);
    });
  }
  return [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

/** Série des ventes par jour (ou par mois sur l'année), pour le graphique. */
export function salesSeries(sales: Doc<Sale>[], r: { from: number; to: number }, by: "day" | "month") {
  const buckets: { key: string; label: string; revenue: number; count: number }[] = [];
  const start = new Date(r.from);
  if (by === "month") {
    for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d.getTime() <= r.to; d.setMonth(d.getMonth() + 1))
      buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), revenue: 0, count: 0 });
  } else {
    for (let d = new Date(start); d.getTime() <= r.to; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      buckets.push({ key, label: d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" }), revenue: 0, count: 0 });
    }
  }
  for (const s of salesIn(sales, r)) {
    const d = new Date(s.data.at);
    const key = by === "month" ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const b = buckets.find((x) => x.key === key);
    if (b) {
      b.revenue += s.data.total - refundedOf(s.data);
      b.count += 1;
    }
  }
  return buckets;
}

/** Ventes par vendeur sur la période (performance des employés). */
export function salesBySeller(sales: Doc<Sale>[], r: { from: number; to: number }) {
  const m = new Map<string, { count: number; revenue: number }>();
  for (const s of salesIn(sales, r)) {
    const cur = m.get(s.data.by) ?? { count: 0, revenue: 0 };
    cur.count += 1;
    cur.revenue += s.data.total - refundedOf(s.data);
    m.set(s.data.by, cur);
  }
  return [...m.entries()].map(([by, v]) => ({ by, ...v })).sort((a, b) => b.revenue - a.revenue);
}

export function customerStats(customerId: string, sales: Doc<Sale>[], orders: Doc<Order>[]) {
  const mine = sales.filter((s) => s.data.customer_id === customerId && s.data.status === "validee");
  return {
    purchases: mine.length,
    spent: mine.reduce((a, s) => a + s.data.total - refundedOf(s.data), 0),
    due: mine.reduce((a, s) => a + dueOf(s.data), 0),
    orders: orders.filter((o) => o.data.customer_id === customerId).length,
    last: mine[0]?.data.at ?? null,
  };
}

/** Normalise un numéro de téléphone pour retrouver un client (chiffres seulement, + initial gardé). */
export const normPhone = (p: string) => p.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
