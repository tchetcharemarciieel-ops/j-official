import { computeWidget, type Row } from "./stats";
import { workspaceSchema, type AppSpec, type Entity, type Role, type Station, type StationKind, type Workspace, type WorkspaceLayout } from "./spec";

/**
 * Espace de travail 3D d'un mini-logiciel : décor adapté au métier et postes reliés
 * aux modules réels. Fonctions pures, partagées par le générateur, les tests et l'affichage.
 */

export const LAYOUT_LABELS: Record<WorkspaceLayout, string> = {
  restaurant: "Restaurant",
  garage: "Garage",
  pharmacie: "Pharmacie",
  boutique: "Boutique",
  bureau: "Bureau / agence",
  services: "Salon / services",
  ecole: "École",
  hotel: "Hôtel",
  transport: "Transport / livraison",
};

export const KIND_LABELS: Record<StationKind, string> = {
  stats_board: "Tableau des statistiques",
  cashier: "Caisse",
  kitchen: "Cuisine",
  dining: "Salle",
  stock: "Réserve",
  counter: "Comptoir",
  repair_bay: "Poste de réparation",
  vehicle: "Véhicule",
  desk: "Bureau",
  reception: "Accueil",
  meeting: "Salle de réunion",
  bed: "Chambres",
  salon_chair: "Fauteuil",
  classroom: "Salle de classe",
};

/** Ambiance visuelle de chaque disposition (sol, murs, couleur d'accent, décor non cliquable). */
export const LAYOUT_STYLE: Record<WorkspaceLayout, { floor: string; wall: string; accent: string; decor: ("plants" | "dining_tables" | "car" | "shelves" | "sofa")[] }> = {
  restaurant: { floor: "#d9b98f", wall: "#f3efe7", accent: "#c2410c", decor: ["plants", "dining_tables"] },
  garage: { floor: "#9aa3ad", wall: "#e5e7eb", accent: "#1d4ed8", decor: ["car"] },
  pharmacie: { floor: "#e8eef2", wall: "#f8fafc", accent: "#15803d", decor: ["plants", "shelves"] },
  boutique: { floor: "#dcc7a6", wall: "#f5f1ea", accent: "#7c3aed", decor: ["plants", "shelves"] },
  bureau: { floor: "#d6bf9b", wall: "#f1f5f9", accent: "#2563eb", decor: ["plants", "sofa"] },
  services: { floor: "#e7d6cf", wall: "#fdf2f8", accent: "#be185d", decor: ["plants", "sofa"] },
  ecole: { floor: "#d4b896", wall: "#fefce8", accent: "#b45309", decor: ["plants"] },
  hotel: { floor: "#c9a77f", wall: "#f5f5f4", accent: "#0f766e", decor: ["plants", "sofa"] },
  transport: { floor: "#a8a29e", wall: "#e7e5e4", accent: "#dc2626", decor: ["car"] },
};

/** Emplacements au sol (pièce de 12 × 9) ; le tableau des statistiques est fixé au mur du fond. */
export const ROOM = { width: 12, depth: 9 };
export const BOARD_SLOT = { x: 3.4, z: -4.1 };
export const SLOTS: { x: number; z: number }[] = [
  { x: -3.9, z: -2.3 },
  { x: -0.9, z: -2.3 },
  { x: 2.1, z: -1.6 },
  { x: 4.6, z: -1.6 },
  { x: -3.9, z: 0.7 },
  { x: -0.9, z: 0.7 },
  { x: 2.1, z: 1.2 },
  { x: 4.6, z: 1.2 },
  { x: -3.9, z: 3.3 },
  { x: -0.9, z: 3.3 },
  { x: 2.1, z: 3.6 },
];

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const has = (e: Entity, re: RegExp) => re.test(normalize(`${e.key} ${e.label} ${e.labelPlural}`));

export function layoutForSector(sector: string): WorkspaceLayout {
  const s = normalize(sector);
  if (/restau|maquis|snack|traiteur|cuisine|bar\b/.test(s)) return "restaurant";
  if (/garage|mecani|atelier|auto|moto/.test(s)) return "garage";
  if (/pharma|officine|medic/.test(s)) return "pharmacie";
  if (/boutique|commerce|magasin|quincaill|superette|vente/.test(s)) return "boutique";
  if (/ecole|scol|college|lycee|formation/.test(s)) return "ecole";
  if (/hotel|auberge|residence|hebergement/.test(s)) return "hotel";
  if (/transport|livraison|logisti|flotte/.test(s)) return "transport";
  if (/salon|coiff|beaute|esthet|spa|service/.test(s)) return "services";
  return "bureau";
}

export function kindForEntity(e: Entity, layout: WorkspaceLayout): StationKind {
  if (has(e, /vente|paiement|encaiss|factur|caisse|recette/)) return "cashier";
  if (has(e, /commande/)) return layout === "restaurant" ? "kitchen" : "counter";
  if (has(e, /produit|stock|article|medicament|piece|inventaire|marchandise/)) return "stock";
  if (has(e, /reparation|intervention|entretien/)) return "repair_bay";
  if (has(e, /vehicule|livraison|flotte|colis/)) return "vehicle";
  if (has(e, /chambre|logement/)) return "bed";
  if (has(e, /eleve|classe|etudiant/)) return "classroom";
  if (has(e, /rendez|rdv|prestation|soin/)) return layout === "services" ? "salon_chair" : "reception";
  if (has(e, /client|locataire|patient|parent|reservation|visiteur/)) return "reception";
  if (has(e, /employe|personnel|equipe|staff/)) return "meeting";
  return "desk";
}

function areaLabel(kind: StationKind, layout: WorkspaceLayout): string {
  if (kind === "stock" && (layout === "pharmacie" || layout === "boutique")) return "Rayons";
  return KIND_LABELS[kind];
}

function stationFor(e: Entity, layout: WorkspaceLayout): Station {
  const kind = kindForEntity(e, layout);
  const area = areaLabel(kind, layout);
  const label = normalize(area) === normalize(e.labelPlural) ? e.labelPlural : `${area} · ${e.labelPlural}`;
  return { id: `st_${e.key}`.slice(0, 40), kind, label: label.slice(0, 40), target: e.key };
}

/** Espace par défaut : un poste par module, adapté au métier, plus le tableau des statistiques. */
export function buildWorkspace(spec: Pick<AppSpec, "sector" | "entities">): Workspace {
  const layout = layoutForSector(spec.sector);
  const stations: Station[] = [{ id: "st_tableau", kind: "stats_board", label: "Statistiques", target: "__dashboard" }];
  for (const e of spec.entities.slice(0, SLOTS.length)) stations.push(stationFor(e, layout));
  // Restaurant sans table des ventes : la caisse ouvre les commandes (où se trouvent montants et paiements).
  const orders = spec.entities.find((e) => has(e, /commande/));
  if (layout === "restaurant" && orders && !stations.some((s) => s.kind === "cashier") && stations.length <= SLOTS.length)
    stations.push({ id: "st_caisse", kind: "cashier", label: `Caisse · ${orders.labelPlural}`.slice(0, 40), target: orders.key });
  return { enabled: true, layout, title: "", stations, hiddenEntities: [] };
}

/**
 * Rend un espace cohérent avec le logiciel actuel : postes vers des modules supprimés retirés,
 * module visible sans poste ajouté, un seul tableau des statistiques, nombre de postes limité.
 */
export function sanitizeWorkspace(input: unknown, spec: Pick<AppSpec, "sector" | "entities">): Workspace {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) return buildWorkspace(spec);
  const ws = structuredClone(parsed.data);
  const keys = new Set(spec.entities.map((e) => e.key));
  ws.hiddenEntities = ws.hiddenEntities.filter((k) => keys.has(k));
  const hidden = new Set(ws.hiddenEntities);
  const seen = new Set<string>();
  let board = false;
  ws.stations = ws.stations.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    if (s.target === "__dashboard") {
      if (board) return false;
      board = true;
      s.kind = "stats_board";
      return true;
    }
    if (s.kind === "stats_board") return false;
    return keys.has(s.target) && !hidden.has(s.target);
  });
  if (!board) ws.stations.unshift({ id: "st_tableau", kind: "stats_board", label: "Statistiques", target: "__dashboard" });
  for (const e of spec.entities) {
    if (hidden.has(e.key) || ws.stations.some((s) => s.target === e.key)) continue;
    let st = stationFor(e, ws.layout);
    while (seen.has(st.id)) st = { ...st, id: `${st.id}_2`.slice(0, 40) };
    seen.add(st.id);
    ws.stations.push(st);
  }
  const boardStation = ws.stations.find((s) => s.kind === "stats_board")!;
  ws.stations = [boardStation, ...ws.stations.filter((s) => s !== boardStation).slice(0, SLOTS.length)];
  return ws;
}

/** Espace à afficher : celui du logiciel s'il existe, sinon l'espace par défaut (anciens logiciels). */
export function effectiveWorkspace(spec: AppSpec): Workspace {
  return spec.workspace ? sanitizeWorkspace(spec.workspace, spec) : buildWorkspace(spec);
}

/** Position au sol de chaque poste. */
export function placeStations(ws: Workspace): (Station & { x: number; z: number })[] {
  let i = 0;
  return ws.stations.map((s) => (s.kind === "stats_board" ? { ...s, ...BOARD_SLOT } : { ...s, ...SLOTS[Math.min(i++, SLOTS.length - 1)]! }));
}

// ---------- Indicateurs calculés sur les vraies données ----------

const DONE = /pay|regl|livr|termin|servi|annul|rendu|clos|fait|solde|parti|archiv/;

export type StationStats = { total: number; today: number; open: number | null; openLabel: string; alert: number; amountToday: number | null };

function isToday(iso: unknown, now: Date): boolean {
  if (typeof iso !== "string" || iso.length < 10) return false;
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function stationStats(spec: AppSpec, target: string, rows: Row[], now = new Date()): StationStats | null {
  const entity = spec.entities.find((e) => e.key === target);
  if (!entity) return null;
  const dateField = entity.fields.find((f) => f.type === "date");
  const todayRows = rows.filter((r) => isToday(r.created_at, now) || (dateField ? isToday(r.data[dateField.key], now) : false));
  const status = entity.fields.find((f) => f.type === "select" && /statut|etat|status/.test(f.key));
  const open = status ? rows.filter((r) => !DONE.test(normalize(String(r.data[status.key] ?? "")))).length : null;
  const low = spec.dashboard.find((w) => w.type === "low_stock" && w.entity === target);
  const lowResult = low ? computeWidget(spec, low, rows) : null;
  const money = entity.fields.find((f) => f.type === "money");
  return {
    total: rows.length,
    today: todayRows.length,
    open,
    openLabel: status ? "en cours" : "",
    alert: lowResult?.kind === "list" ? lowResult.items.length : 0,
    amountToday: money ? todayRows.reduce((a, r) => a + (Number(r.data[money.key]) || 0), 0) : null,
  };
}

/** Indicateurs chiffrés du tableau de bord (uniquement des valeurs calculées). */
export function boardKpis(spec: AppSpec, rowsFor: (entity: string) => Row[]): { label: string; value: number; unit: string | undefined }[] {
  return spec.dashboard
    .filter((w) => w.type === "count" || w.type === "sum")
    .slice(0, 4)
    .map((w) => {
      const r = computeWidget(spec, w, rowsFor(w.entity));
      return r.kind === "number" ? { label: w.label, value: r.value, unit: r.unit } : null;
    })
    .filter((x) => x !== null);
}

export type ActivityItem = { id: string; entity: string; entityLabel: string; label: string; at: string };

/** Dernières fiches créées dans les modules visibles de l'espace. */
export function recentActivity(spec: AppSpec, ws: Workspace, rowsFor: (entity: string) => Row[], max = 8): ActivityItem[] {
  const hidden = new Set(ws.hiddenEntities);
  const items: ActivityItem[] = [];
  for (const e of spec.entities) {
    if (hidden.has(e.key)) continue;
    const title = e.fields.find((f) => f.type === "text") ?? e.fields[0]!;
    for (const r of rowsFor(e.key)) items.push({ id: r.id, entity: e.key, entityLabel: e.label, label: String(r.data[title.key] ?? "—"), at: r.created_at });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, max);
}

// ---------- Équipe ----------

export type CrewMember = { id: string; name: string; role: Role; demo?: boolean };

/** Place chaque membre à un poste : le propriétaire près des statistiques, les autres répartis. */
export function assignCrew(stations: Station[], members: CrewMember[]): Map<string, CrewMember[]> {
  const out = new Map<string, CrewMember[]>();
  const board = stations.find((s) => s.kind === "stats_board");
  const work = stations.filter((s) => s.kind !== "stats_board");
  const order: Role[] = ["owner", "admin", "manager", "employee", "viewer"];
  const sorted = [...members].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role)).slice(0, 12);
  let i = 0;
  for (const m of sorted) {
    const st = (m.role === "owner" || m.role === "admin") && board ? board : (work[i++ % Math.max(1, work.length)] ?? board);
    if (!st) continue;
    out.set(st.id, [...(out.get(st.id) ?? []), m]);
  }
  return out;
}

/** Équipe fictive, clairement marquée, pour la démo publique sans compte. */
export function demoCrew(layout: WorkspaceLayout): CrewMember[] {
  const roles: Record<WorkspaceLayout, string[]> = {
    restaurant: ["Gérant", "Cuisinier", "Serveuse", "Caissier"],
    garage: ["Chef d'atelier", "Mécanicien", "Mécanicien", "Accueil"],
    pharmacie: ["Pharmacien", "Vendeuse", "Vendeur"],
    boutique: ["Gérante", "Vendeur", "Caissière"],
    bureau: ["Directeur", "Chargée de projet", "Assistant"],
    services: ["Gérante", "Coiffeuse", "Accueil"],
    ecole: ["Directeur", "Secrétaire", "Comptable"],
    hotel: ["Gérant", "Réception", "Femme de chambre"],
    transport: ["Responsable", "Chauffeur", "Livreur"],
  };
  return roles[layout].map((name, i) => ({ id: `demo-${i}`, name: `${name} (démo)`, role: i === 0 ? "owner" : "employee", demo: true }));
}
