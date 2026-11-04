/**
 * Gestion des équipes : postes par secteur, permissions (RBAC) et règles de sécurité.
 * Module pur (serveur, navigateur et tests) : chaque décision d'accès passe par ces fonctions,
 * appliquées côté serveur sur chaque route.
 *
 * Compatibilité : un membre sans poste (équipes existantes) garde exactement les droits de son
 * rôle, comme avant. Les postes restreignent l'accès ; ils n'en ajoutent jamais au-delà du rôle.
 */

import type { Role } from "./spec";

export type Sector = "restaurant" | "hotel" | "garage" | "autre";

/** Permissions : une par grande fonction de l'entreprise. */
export const PERMISSIONS = {
  caisse: { label: "Accueil / Caisse", hint: "Prendre les commandes, encaisser, reçus, commandes en ligne" },
  cuisine: { label: "Cuisine", hint: "Écran cuisine, commandes à préparer, hygiène" },
  stock: { label: "Stock", hint: "Produits, entrées et sorties, chambre froide, inventaire" },
  salle: { label: "Salle de restaurant", hint: "Tables, réservations, service en salle" },
  vision: { label: "Vision IA", hint: "Occupation des tables, délais de service, alertes" },
  reception: { label: "Réception", hint: "Réservations, arrivées et départs, fiches clients" },
  chambres: { label: "Gestion des chambres", hint: "Chambres, état, équipements" },
  menage: { label: "Ménage", hint: "Nettoyage des chambres et des espaces" },
  restaurant: { label: "Restaurant (hôtel)", hint: "Salle et commandes du restaurant de l'hôtel" },
  atelier: { label: "Atelier", hint: "Interventions, temps, contrôle qualité" },
  pieces: { label: "Gestion des pièces", hint: "Stock des pièces, fournisseurs, commandes" },
  accueil_garage: { label: "Accueil du garage", hint: "Clients, véhicules, devis, factures, paiements" },
  rapports: { label: "Rapports", hint: "Tableau de bord et rapports (consultation)" },
  finances: { label: "Dépenses et finances", hint: "Dépenses, recettes, bénéfice" },
  personnel: { label: "Personnel", hint: "Fiches du personnel et horaires" },
  donnees: { label: "Interface classique", hint: "Tables de données du logiciel (toutes les fiches)" },
  parametres: { label: "Paramètres", hint: "Configuration, menu en ligne, QR codes, caméras" },
  equipe: { label: "Gestion des équipes", hint: "Inviter, modifier, suspendre des employés" },
} as const;
export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Permissions proposées pour chaque secteur (les autres ne servent à rien dans ce métier). */
export const SECTOR_PERMISSIONS: Record<Sector, Permission[]> = {
  restaurant: ["caisse", "cuisine", "stock", "salle", "vision", "rapports", "finances", "personnel", "donnees", "parametres", "equipe"],
  hotel: ["reception", "chambres", "menage", "restaurant", "cuisine", "caisse", "stock", "vision", "rapports", "finances", "personnel", "donnees", "parametres", "equipe"],
  garage: ["accueil_garage", "atelier", "pieces", "rapports", "finances", "personnel", "donnees", "parametres", "equipe"],
  autre: ["donnees", "rapports", "finances", "personnel", "parametres", "equipe"],
};

export type Position = { key: string; label: string; role: Exclude<Role, "owner">; permissions: Permission[]; custom?: boolean };

/** Postes prédéfinis. « Administrateur » et « Responsable » gardent tous les droits de leur rôle. */
export const POSITIONS: Record<Sector, Position[]> = {
  restaurant: [
    { key: "administrateur", label: "Administrateur", role: "admin", permissions: [] },
    { key: "responsable", label: "Responsable", role: "manager", permissions: [] },
    { key: "caisse", label: "Accueil / Caisse", role: "employee", permissions: ["caisse", "salle", "vision", "rapports"] },
    { key: "cuisine", label: "Cuisine", role: "employee", permissions: ["cuisine"] },
    { key: "stock", label: "Gestion du stock", role: "employee", permissions: ["stock"] },
    { key: "salle", label: "Salle de restaurant", role: "employee", permissions: ["salle"] },
    { key: "reception", label: "Réception", role: "employee", permissions: ["salle", "caisse"] },
  ],
  hotel: [
    { key: "administrateur", label: "Administrateur", role: "admin", permissions: [] },
    { key: "reception", label: "Réception", role: "employee", permissions: ["reception", "chambres", "caisse"] },
    { key: "menage", label: "Ménage", role: "employee", permissions: ["menage"] },
    { key: "cuisine", label: "Cuisine", role: "employee", permissions: ["cuisine", "stock"] },
    { key: "restaurant", label: "Restaurant", role: "employee", permissions: ["restaurant", "caisse", "vision"] },
    { key: "chambres", label: "Gestion des chambres", role: "employee", permissions: ["chambres", "menage"] },
  ],
  garage: [
    { key: "administrateur", label: "Administrateur", role: "admin", permissions: [] },
    { key: "responsable", label: "Responsable", role: "manager", permissions: [] },
    { key: "accueil", label: "Accueil", role: "employee", permissions: ["accueil_garage"] },
    { key: "mecanicien", label: "Mécanicien", role: "employee", permissions: ["atelier"] },
    { key: "pieces", label: "Gestion des pièces", role: "employee", permissions: ["pieces"] },
  ],
  autre: [
    { key: "administrateur", label: "Administrateur", role: "admin", permissions: [] },
    { key: "responsable", label: "Responsable", role: "manager", permissions: [] },
    { key: "employe", label: "Employé", role: "employee", permissions: ["donnees"] },
    { key: "lecteur", label: "Consultation", role: "viewer", permissions: ["donnees", "rapports"] },
  ],
};

export function sectorOf(layout: string | null | undefined): Sector {
  return layout === "restaurant" || layout === "hotel" || layout === "garage" ? layout : "autre";
}

export function positionsFor(sector: Sector, custom: { key: string; label: string; permissions: string[] }[] = []): Position[] {
  const allowed = new Set<string>(SECTOR_PERMISSIONS[sector]);
  return [...POSITIONS[sector], ...custom.map((c) => ({ key: c.key, label: c.label, role: "employee" as const, permissions: c.permissions.filter((p) => allowed.has(p)) as Permission[], custom: true }))];
}

export type MemberRow = { role: Role; position?: string | null; permissions?: string[] | null; status?: string | null };

/**
 * Permissions effectives : `null` = aucune restriction (propriétaire, administrateur, responsable
 * sans liste, ou membre sans poste comme avant) ; sinon la liste exacte des fonctions autorisées.
 */
export function effectivePerms(m: MemberRow): Permission[] | null {
  if (m.role === "owner" || m.role === "admin") return null;
  if (!m.position) return null;
  const list = (m.permissions ?? []).filter((p): p is Permission => p in PERMISSIONS);
  if (m.role === "manager" && list.length === 0) return null;
  return list;
}

export const has = (perms: Permission[] | null, p: Permission | Permission[]) => perms === null || (Array.isArray(p) ? p.some((x) => perms.includes(x)) : perms.includes(p));
export const isSuspended = (m: MemberRow) => m.status === "suspended";

/** Rôles que chaque gestionnaire peut attribuer : jamais au-delà de son propre niveau. */
const RANK: Record<Role, number> = { viewer: 0, employee: 1, manager: 2, admin: 3, owner: 4 };
/** Propriétaire et administrateurs ; un responsable seulement si « Gestion des équipes » lui a été donnée explicitement. */
export function canManageTeam(actor: MemberRow) {
  if (isSuspended(actor)) return false;
  if (actor.role === "owner" || actor.role === "admin") return true;
  const p = effectivePerms(actor);
  return actor.role === "manager" && p !== null && p.includes("equipe");
}

/**
 * Peut-on attribuer ce rôle et ces permissions ? Règles :
 * - personne ne modifie son propre accès (pas d'auto-promotion) ;
 * - seul le propriétaire nomme ou modifie un administrateur ;
 * - un responsable ne donne ni « Gestion des équipes » ni un rôle supérieur ou égal au sien ;
 * - on ne donne jamais une permission que l'on n'a pas soi-même.
 */
export function canAssign(actor: MemberRow & { id: string }, target: { id: string | null; role: Role | null }, next: { role: Role; permissions: string[] }): { ok: true } | { ok: false; reason: string } {
  if (!canManageTeam(actor)) return { ok: false, reason: "Votre accès ne permet pas de gérer l'équipe." };
  if (target.id && target.id === actor.id) return { ok: false, reason: "Vous ne pouvez pas modifier votre propre accès : demandez au propriétaire." };
  if (target.role === "owner" || next.role === "owner") return { ok: false, reason: "Le propriétaire ne peut pas être modifié." };
  if ((next.role === "admin" || target.role === "admin") && actor.role !== "owner") return { ok: false, reason: "Seul le propriétaire nomme ou modifie un administrateur." };
  if (actor.role === "manager") {
    if (RANK[next.role] >= RANK.manager || (target.role && RANK[target.role] >= RANK.manager)) return { ok: false, reason: "Un responsable ne peut gérer que des employés." };
    const mine = effectivePerms(actor);
    if (next.permissions.includes("equipe")) return { ok: false, reason: "Seuls le propriétaire et les administrateurs donnent l'accès « Gestion des équipes »." };
    if (mine && next.permissions.some((p) => !mine.includes(p as Permission))) return { ok: false, reason: "Vous ne pouvez pas donner une permission que vous n'avez pas." };
  }
  return { ok: true };
}

/** Invitation utilisable : ni acceptée, ni annulée, ni expirée, et pour cette adresse. */
export function invitationState(inv: { accepted_at: string | null; revoked_at: string | null; expires_at: string }, now = Date.now()): "en_attente" | "acceptee" | "annulee" | "expiree" {
  if (inv.accepted_at) return "acceptee";
  if (inv.revoked_at) return "annulee";
  if (Date.parse(inv.expires_at) < now) return "expiree";
  return "en_attente";
}
export const INVITATION_STATE_LABELS = { en_attente: "En attente", acceptee: "Acceptée", annulee: "Annulée", expiree: "Expirée" } as const;
export const INVITE_DAYS = 7;

/** Places : membres (propriétaire compris, suspendus compris) + invitations en attente. */
export function seats(maxMembers: number, extra: number, members: number, pending: number) {
  const total = Math.max(1, maxMembers) + Math.max(0, extra);
  const used = members;
  return { total, used, pending, free: Math.max(0, total - used - pending), full: used + pending >= total };
}

/** Clé d'un poste personnalisé à partir de son nom. */
export function positionKey(label: string) {
  return label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}
