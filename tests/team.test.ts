import { describe, expect, it } from "vitest";
import { runOp as venueOp, type OpContext } from "@/lib/venue/engine";
import { runOp as garageOp } from "@/lib/garage/engine";
import { MemoryStore } from "@/lib/venue/memory-store";
import { MemoryStore as GarageMemory } from "@/lib/garage/memory-store";
import { canAssign, canManageTeam, effectivePerms, invitationState, POSITIONS, positionsFor, seats, type Permission } from "@/lib/team";
import { optionAllowed, zoneAllowed } from "@/lib/zone-perms";

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const ADMIN = "00000000-0000-4000-8000-0000000000ab";
const CAISSE = "00000000-0000-4000-8000-0000000000ac";
const CUISINE = "00000000-0000-4000-8000-0000000000ad";
const posPerms = (key: string) => POSITIONS.restaurant.find((p) => p.key === key)!.permissions;

function venue() {
  const store = new MemoryStore();
  const ctx = (id: string, perms: Permission[] | null): OpContext => ({ store, actor: { id, role: id === OWNER ? "owner" : "employee" }, members: [OWNER, CAISSE, CUISINE], kind: "restaurant", perms });
  return { store, run: (id: string, perms: Permission[] | null, op: string, input: unknown) => venueOp(ctx(id, perms), op, input) };
}
const k = () => crypto.randomUUID();

describe("Gestion des équipes : administrateur", () => {
  it("le propriétaire et l'administrateur gèrent l'équipe ; un employé non", () => {
    expect(canManageTeam({ role: "owner" })).toBe(true);
    expect(canManageTeam({ role: "admin" })).toBe(true);
    expect(canManageTeam({ role: "employee", position: "caisse", permissions: posPerms("caisse") })).toBe(false);
    expect(canManageTeam({ role: "manager" })).toBe(false);
    expect(canManageTeam({ role: "manager", position: "responsable_equipe", permissions: ["equipe", "caisse"] })).toBe(true);
  });

  it("l'administrateur ajoute un caissier ; le propriétaire seul nomme un administrateur", () => {
    expect(canAssign({ id: ADMIN, role: "admin" }, { id: null, role: null }, { role: "employee", permissions: posPerms("caisse") })).toEqual({ ok: true });
    expect(canAssign({ id: ADMIN, role: "admin" }, { id: null, role: null }, { role: "admin", permissions: [] }).ok).toBe(false);
    expect(canAssign({ id: OWNER, role: "owner" }, { id: null, role: null }, { role: "admin", permissions: [] }).ok).toBe(true);
  });

  it("les membres existants sans poste gardent exactement les droits de leur rôle", () => {
    expect(effectivePerms({ role: "employee" })).toBeNull();
    expect(effectivePerms({ role: "manager", position: "" })).toBeNull();
    expect(effectivePerms({ role: "employee", position: "cuisine", permissions: ["cuisine"] })).toEqual(["cuisine"]);
  });

  it("calcule les places et propose les postes du secteur (avec postes personnalisés)", () => {
    expect(seats(5, 0, 3, 2)).toMatchObject({ total: 5, used: 3, pending: 2, free: 0, full: true });
    expect(seats(5, 2, 3, 1)).toMatchObject({ total: 7, free: 3, full: false });
    const p = positionsFor("restaurant", [{ key: "perso_livreur", label: "Livreur", permissions: ["caisse", "atelier"] }]);
    expect(p.map((x) => x.label)).toEqual(expect.arrayContaining(["Accueil / Caisse", "Cuisine", "Gestion du stock", "Salle de restaurant", "Réception", "Responsable", "Administrateur", "Livreur"]));
    // Une permission d'un autre secteur (atelier de garage) est ignorée.
    expect(p.find((x) => x.key === "perso_livreur")!.permissions).toEqual(["caisse"]);
  });
});

describe("Gestion des équipes : permissions par poste (serveur)", () => {
  it("un employé de caisse ne peut pas ouvrir la cuisine", async () => {
    const { run, store } = venue();
    await run(OWNER, null, "menu.save", { name: "Riz sauce", category: "plat", price: 1500 });
    const order = (await run(CAISSE, posPerms("caisse"), "order.create", { source: "caisse", table_id: null, stay_id: null, customer: "", lines: [{ menu_id: store.data.menu[0]!.id, qty: 1 }], idem: k() })).id!;
    await expect(run(CAISSE, posPerms("caisse"), "online.problem", { id: order, text: "test cuisine" })).rejects.toMatchObject({ status: 403 });
    await expect(run(CAISSE, posPerms("caisse"), "temp.add", { value: 4, idem: k() })).rejects.toMatchObject({ status: 403 });
    await expect(run(CAISSE, posPerms("caisse"), "item.save", { zone: "stock", name: "Riz", category: "ingredient", unit: "kg" })).rejects.toMatchObject({ status: 403 });
    expect(zoneAllowed("cuisine", posPerms("caisse"))).toBe(false);
    expect(zoneAllowed("stock", posPerms("caisse"))).toBe(false);
    expect(zoneAllowed("caisse", posPerms("caisse"))).toBe(true);
    // Paramètres administrateur et menu en ligne : interdits à la caisse.
    expect(optionAllowed("caisse", "menu_en_ligne", posPerms("caisse"))).toBe(false);
    expect(optionAllowed("caisse", "paiement", posPerms("caisse"))).toBe(true);
    await expect(run(CAISSE, posPerms("caisse"), "settings.save", { terrace: true })).rejects.toMatchObject({ status: 403 });
  });

  it("un employé de cuisine ne peut pas ouvrir la caisse", async () => {
    const { run, store } = venue();
    await run(OWNER, null, "menu.save", { name: "Poulet", category: "plat", price: 4000 });
    const order = (await run(OWNER, null, "order.create", { source: "caisse", table_id: null, stay_id: null, customer: "", lines: [{ menu_id: store.data.menu[0]!.id, qty: 1 }], idem: k() })).id!;
    await expect(run(CUISINE, posPerms("cuisine"), "payment.add", { target: "order", target_id: order, amount: 4000, method: "especes", idem: k() })).rejects.toMatchObject({ status: 403 });
    await expect(run(CUISINE, posPerms("cuisine"), "order.create", { source: "caisse", table_id: null, stay_id: null, customer: "", lines: [{ menu_id: store.data.menu[0]!.id, qty: 1 }], idem: k() })).rejects.toMatchObject({ status: 403 });
    expect(zoneAllowed("caisse", posPerms("cuisine"))).toBe(false);
    // Ce qui relève de son poste reste possible.
    await run(CUISINE, posPerms("cuisine"), "order.status", { id: order, to: "en_preparation" });
    expect(store.data.order[0]!.data.status).toBe("en_preparation");
  });

  it("dépenses et personnel restent réservés aux postes autorisés", async () => {
    const { run } = venue();
    await expect(run(CAISSE, posPerms("caisse"), "expense.save", { date: "2026-11-01", category: "Gaz", amount: 5000, description: "Bouteille", idem: k() })).rejects.toMatchObject({ status: 403 });
    await expect(run(CAISSE, posPerms("caisse"), "staff.save", { name: "X", role: "Administrateur", phone: "", member_id: CAISSE, notes: "", schedule: [] })).rejects.toMatchObject({ status: 403 });
  });

  it("au garage, un mécanicien ne fait pas les factures et l'accueil ne touche pas au stock", async () => {
    const store = new GarageMemory();
    const ctx = (perms: Permission[]) => ({ store, actor: { id: CAISSE, role: "employee" as const }, members: [CAISSE], perms });
    await expect(garageOp(ctx(POSITIONS.garage.find((p) => p.key === "mecanicien")!.permissions), "client.save", { name: "Client", phone: "" })).rejects.toMatchObject({ status: 403 });
    await expect(garageOp(ctx(POSITIONS.garage.find((p) => p.key === "accueil")!.permissions), "part.save", { name: "Filtre", ref: "F1" })).rejects.toMatchObject({ status: 403 });
  });
});

describe("Gestion des équipes : invitations et sécurité", () => {
  it("une invitation expirée, annulée ou déjà utilisée n'est plus utilisable", () => {
    const now = Date.parse("2026-11-04T12:00:00Z");
    expect(invitationState({ accepted_at: null, revoked_at: null, expires_at: "2026-11-11T12:00:00Z" }, now)).toBe("en_attente");
    expect(invitationState({ accepted_at: null, revoked_at: null, expires_at: "2026-11-03T12:00:00Z" }, now)).toBe("expiree");
    expect(invitationState({ accepted_at: null, revoked_at: "2026-11-04T10:00:00Z", expires_at: "2026-11-11T12:00:00Z" }, now)).toBe("annulee");
    expect(invitationState({ accepted_at: "2026-11-04T10:00:00Z", revoked_at: null, expires_at: "2026-11-11T12:00:00Z" }, now)).toBe("acceptee");
  });

  it("un membre suspendu ne gère plus rien, même administrateur", () => {
    expect(canManageTeam({ role: "admin", status: "suspended" })).toBe(false);
  });

  it("un employé ne peut pas devenir administrateur ni modifier son propre accès", () => {
    const self = { id: CAISSE, role: "employee" as const, position: "caisse", permissions: posPerms("caisse") };
    expect(canAssign(self, { id: CAISSE, role: "employee" }, { role: "admin", permissions: [] }).ok).toBe(false);
    // Même un administrateur ne modifie pas son propre accès.
    expect(canAssign({ id: ADMIN, role: "admin" }, { id: ADMIN, role: "admin" }, { role: "admin", permissions: [] })).toMatchObject({ ok: false });
    // Un responsable ne donne ni la gestion des équipes, ni une permission qu'il n'a pas, ni un rôle égal au sien.
    const mgr = { id: OWNER, role: "manager" as const, position: "resp", permissions: ["equipe", "caisse", "salle"] };
    expect(canAssign(mgr, { id: null, role: null }, { role: "employee", permissions: ["caisse"] }).ok).toBe(true);
    expect(canAssign(mgr, { id: null, role: null }, { role: "employee", permissions: ["equipe"] }).ok).toBe(false);
    expect(canAssign(mgr, { id: null, role: null }, { role: "employee", permissions: ["finances"] }).ok).toBe(false);
    expect(canAssign(mgr, { id: null, role: null }, { role: "manager", permissions: [] }).ok).toBe(false);
    expect(canAssign(mgr, { id: ADMIN, role: "admin" }, { role: "employee", permissions: [] }).ok).toBe(false);
  });

  it("une opération inconnue de la table des permissions est refusée aux postes restreints", async () => {
    const { run } = venue();
    await expect(run(CAISSE, ["caisse"], "photo.add", { category: "reception", data_url: "data:image/png;base64,AAAA", caption: "" })).rejects.toMatchObject({ status: 403 });
  });
});
