import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/transport/memory-store";
import { runOp, type OpContext } from "@/lib/transport/engine";
import { visibleData, fileAllowed } from "@/lib/transport/visibility";
import { computePrice, courierStats, dayStats, defaultTariff, dueOf, haversineKm, orderLate, paidOf, type Courier, type Doc, type Order, type TransportRole, type Transaction, type Vehicle } from "@/lib/transport/model";
import { positionsFor, sectorOf, SECTOR_PERMISSIONS, type Permission } from "@/lib/team";

const MGR = "00000000-0000-4000-8000-0000000000d1";
const LIV = "00000000-0000-4000-8000-0000000000e1";
const LIV2 = "00000000-0000-4000-8000-0000000000e2";
const ACC = "00000000-0000-4000-8000-0000000000a1";
const MEMBERS = [MGR, LIV, LIV2, ACC];
const ctx = (store: MemoryStore, id: string, role: TransportRole, perms: Permission[] | null = null): OpContext => ({ store, actor: { id, role }, perms, members: MEMBERS });
const P_LIV: Permission[] = ["missions"];
const P_ACC: Permission[] = ["finances", "rapports"];
const uid = () => crypto.randomUUID();
const col = <T,>(s: MemoryStore, c: Parameters<MemoryStore["list"]>[0]) => s.data[c] as unknown as Doc<T>[];

const ORDER = { sender: { name: "Awa", phone: "+236 72 00 00 01" }, recipient: { name: "Paul", phone: "+236 75 00 00 02" }, pickup: { address: "Avenue des Martyrs" }, dropoff: { address: "PK5" }, parcel: { desc: "Carton de vêtements", weight_kg: 8, type: "Colis standard" }, zone: "Centre", urgency: "normal", vehicle_kind: "moto", pay_mode: "livraison" };
const SETTINGS = { name: "Express Bangui", transport_type: "livraison", currency: "XAF", couriers_count: 2, vehicles_count: 1, goods: ["Colis"], tariff: { base: 1000, per_km: 100, per_kg: 50, free_kg: 5, min_price: 1500, zones: [{ name: "Centre", fee: 500 }, { name: "Nord", fee: 1500 }], parcel_types: [{ name: "Colis standard", mult: 1 }, { name: "Fragile", mult: 1.5 }], vehicle_mult: { moto: 1, voiture: 1.5, camionnette: 2, camion: 3 }, urgency_mult: { normal: 1, express: 1.5, urgent: 2 } }, hours: { normal: 24, express: 6, urgent: 2 }, commission_rate: 10, tracking: { show_courier: true, show_eta: true }, online: { open: true, mobile_money_info: "", pay_delivery: true, pay_cash: true, pay_mobile: false } };

async function company() {
  const store = new MemoryStore();
  const mgr = ctx(store, MGR, "manager");
  await runOp(mgr, "settings.save", SETTINGS);
  const c1 = await runOp(mgr, "courier.save", { name: "Jean Livreur", user_id: LIV, zones: ["Centre"] });
  const c2 = await runOp(mgr, "courier.save", { name: "Marc Livreur", user_id: LIV2 });
  return { store, mgr, liv: ctx(store, LIV, "employee", P_LIV), liv2: ctx(store, LIV2, "employee", P_LIV), acc: ctx(store, ACC, "employee", P_ACC), c1: c1.id!, c2: c2.id! };
}

describe("Transport : tarification", () => {
  it("calcule avec les tarifs de l'entreprise et n'invente aucun prix sans tarif", () => {
    const t = SETTINGS.tariff as never;
    const r = computePrice({ distance_km: 10, zone: "Centre", parcel_type: "Colis standard", weight_kg: 8, vehicle_kind: "moto", urgency: "normal" }, t, "XAF");
    expect(r.total).toBe(1000 + 1000 + 500 + 150); // base + km + zone + (8-5)*50
    const urgent = computePrice({ distance_km: 10, zone: "Centre", weight_kg: 8, vehicle_kind: "camionnette", urgency: "urgent", parcel_type: "Fragile" }, t, "XAF");
    expect(urgent.total).toBe(Math.round(2650 * 1.5 * 2 * 2));
    expect(computePrice({ zone: "Centre" }, defaultTariff(), "XAF")).toMatchObject({ total: 0, configured: false });
    expect(computePrice({}, t, "XAF").total).toBe(1500); // minimum de facturation
    expect(haversineKm({ lat: 4.36, lng: 18.55 }, { lat: 4.36, lng: 18.55 })).toBe(0);
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeGreaterThan(110);
  });
});

describe("Transport : commandes, suivi et historique", () => {
  it("crée une commande avec numéro, suivi unique, prix et date estimée", async () => {
    const { store, mgr } = await company();
    const a = await runOp(mgr, "order.save", { ...ORDER, distance_km: 10 });
    const b = await runOp(mgr, "order.save", ORDER);
    expect(a.number).toBe(`LIV-${new Date().getFullYear()}-0001`);
    expect(b.number).toMatch(/-0002$/);
    expect(a.tracking).toMatch(/^TR[A-Z2-9]{9}$/);
    expect(a.tracking).not.toBe(b.tracking);
    const o = col<Order>(store, "order").find((x) => x.id === a.id)!.data;
    expect(o.price).toBe(2650);
    expect(o.status).toBe("nouvelle");
    expect(o.history).toHaveLength(1);
    expect(Date.parse(o.eta!)).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    await expect(runOp(mgr, "order.save", { ...ORDER, zone: "Lune" })).rejects.toThrow(/Zone/);
    await expect(runOp(mgr, "order.save", { ...ORDER, recipient: { name: "", phone: "1" } })).rejects.toThrow();
  });

  it("modifie, supprime seulement si nouvelle ou annulée, et refuse la modification d'une commande terminée", async () => {
    const { store, mgr, liv, c1 } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    await runOp(mgr, "order.save", { ...ORDER, id: a.id, instructions: "Sonner 2 fois" });
    expect(col<Order>(store, "order")[0]!.data.instructions).toBe("Sonner 2 fois");
    await runOp(mgr, "order.assign", { id: a.id, courier_id: c1 });
    await expect(runOp(mgr, "order.delete", { id: a.id })).rejects.toThrow(/nouvelle ou annulée/);
    await runOp(liv, "order.step", { id: a.id, status: "recupere" });
    await runOp(liv, "order.step", { id: a.id, status: "en_cours" });
    await runOp(liv, "order.deliver", { id: a.id, note: "Remis en main propre" });
    await expect(runOp(mgr, "order.save", { ...ORDER, id: a.id })).rejects.toThrow(/terminée/);
    const b = await runOp(mgr, "order.save", ORDER);
    await runOp(mgr, "order.delete", { id: b.id });
    expect(store.data.order).toHaveLength(1);
  });

  it("applique les transitions de statut et garde l'historique", async () => {
    const { store, mgr, c1 } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    await expect(runOp(mgr, "order.status", { id: a.id, status: "livre" })).rejects.toThrow(/Passage impossible/);
    await expect(runOp(mgr, "order.status", { id: a.id, status: "affecte" })).rejects.toThrow(/livreur/);
    await runOp(mgr, "order.status", { id: a.id, status: "attente" });
    await runOp(mgr, "order.assign", { id: a.id, courier_id: c1 });
    await expect(runOp(mgr, "order.status", { id: a.id, status: "annule" })).rejects.toThrow(/motif/);
    await runOp(mgr, "order.cancel", { id: a.id, reason: "Client injoignable" });
    const o = col<Order>(store, "order")[0]!.data;
    expect(o.status).toBe("annule");
    expect(o.history.map((h) => h.to)).toEqual(["nouvelle", "attente", "affecte", "annule"]);
    await expect(runOp(mgr, "order.status", { id: a.id, status: "attente" })).rejects.toThrow(/Passage impossible/);
  });
});

describe("Transport : application du livreur", () => {
  it("accepte, récupère, livre avec preuve et encaisse à la livraison (recette créée une fois)", async () => {
    const { store, mgr, liv, c1 } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    await runOp(mgr, "order.assign", { id: a.id, courier_id: c1 });
    await runOp(liv, "order.accept", { id: a.id });
    await expect(runOp(liv, "order.deliver", { id: a.id, note: "ok" })).rejects.toThrow(/Récupérez/);
    await runOp(liv, "order.step", { id: a.id, status: "recupere" });
    await runOp(liv, "order.step", { id: a.id, status: "en_cours" });
    await expect(runOp(liv, "order.deliver", { id: a.id })).rejects.toThrow(/preuve|commentaire/);
    const photo = await runOp(liv, "photo.add", { mime: "image/jpeg", data: "QUJD" });
    await runOp(liv, "order.deliver", { id: a.id, proof_photo_id: photo.id, note: "Reçu par Paul", collect: true });
    await runOp(liv, "order.deliver", { id: a.id, note: "encore", collect: true }).catch(() => undefined);
    const o = col<Order>(store, "order")[0]!.data;
    expect(o.status).toBe("livre");
    expect(o.delivered_at).toBeTruthy();
    expect(o.proof?.photo_id).toBe(photo.id);
    expect(paidOf(o)).toBe(o.price);
    expect(dueOf(o)).toBe(0);
    const txs = col<Transaction>(store, "transaction");
    expect(txs).toHaveLength(1);
    expect(txs[0]!.data).toMatchObject({ type: "recette", category: "livraison", amount: o.price });
    expect(o.history.at(-1)!.to).toBe("livre");
  });

  it("signale un problème (retour au responsable) et déclare un échec avec motif", async () => {
    const { store, mgr, liv, c1 } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    await runOp(mgr, "order.assign", { id: a.id, courier_id: c1 });
    await expect(runOp(liv, "order.problem", { id: a.id, note: "" })).rejects.toThrow();
    await runOp(liv, "order.problem", { id: a.id, note: "Moto en panne" });
    let o = col<Order>(store, "order")[0]!.data;
    expect(o).toMatchObject({ status: "attente", courier_id: null });
    expect(o.problem?.note).toBe("Moto en panne");
    await runOp(mgr, "order.assign", { id: a.id, courier_id: c1 });
    await runOp(liv, "order.step", { id: a.id, status: "recupere" });
    await expect(runOp(liv, "order.fail", { id: a.id, reason: "" })).rejects.toThrow();
    await runOp(liv, "order.fail", { id: a.id, reason: "Destinataire absent" });
    o = col<Order>(store, "order")[0]!.data;
    expect(o.status).toBe("echec");
    expect(o.fail_reason).toBe("Destinataire absent");
    await runOp(mgr, "order.status", { id: a.id, status: "retour", note: "Retour au dépôt" });
    expect(col<Order>(store, "order")[0]!.data.status).toBe("retour");
  });

  it("un livreur ne touche pas à la mission d'un autre ni aux fonctions de gestion", async () => {
    const { mgr, liv, liv2, c1 } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    await runOp(mgr, "order.assign", { id: a.id, courier_id: c1 });
    await expect(runOp(liv2, "order.step", { id: a.id, status: "recupere" })).rejects.toThrow(/ne vous est pas affectée/);
    await expect(runOp(liv, "order.save", ORDER)).rejects.toThrow(/poste/);
    await expect(runOp(liv, "order.assign", { id: a.id, courier_id: c1 })).rejects.toThrow(/poste/);
    await expect(runOp(liv, "transaction.save", { type: "depense", amount: 10, category: "autre", date: "2026-01-01" })).rejects.toThrow(/poste/);
    await expect(runOp(liv, "settings.save", SETTINGS)).rejects.toThrow(/poste/);
  });

  it("affecte seulement un livreur actif et disponible (sauf confirmation)", async () => {
    const { mgr, liv, c1 } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    await runOp(liv, "courier.availability", { available: false });
    await expect(runOp(mgr, "order.assign", { id: a.id, courier_id: c1 })).rejects.toThrow(/indisponible/);
    await runOp(mgr, "order.assign", { id: a.id, courier_id: c1, force: true });
    await runOp(mgr, "order.assign", { id: a.id, courier_id: null });
    await runOp(mgr, "courier.save", { id: c1, name: "Jean Livreur", user_id: LIV, status: "inactif" });
    await expect(runOp(mgr, "order.assign", { id: a.id, courier_id: c1, force: true })).rejects.toThrow(/inactif/);
  });

  it("la position n'est enregistrée que si le livreur a activé le partage", async () => {
    const { store, liv } = await company();
    await expect(runOp(liv, "courier.locate", { lat: 4.36, lng: 18.55 })).rejects.toThrow(/partage/);
    await runOp(liv, "courier.sharing", { on: true });
    await runOp(liv, "courier.locate", { lat: 4.36, lng: 18.55 });
    expect(col<Courier>(store, "courier").find((c) => c.data.user_id === LIV)!.data.pos).toMatchObject({ lat: 4.36, lng: 18.55 });
    await runOp(liv, "courier.sharing", { on: false });
    expect(col<Courier>(store, "courier").find((c) => c.data.user_id === LIV)!.data.pos).toBeNull();
  });
});

describe("Transport : paiements", () => {
  it("confirme espèces tout de suite ; mobile et en ligne seulement avec référence vérifiée", async () => {
    const { store, mgr, acc } = await company();
    const a = await runOp(mgr, "order.save", { ...ORDER, distance_km: 10 });
    const price = col<Order>(store, "order")[0]!.data.price;
    await runOp(acc, "order.payment", { id: a.id, pid: "p1", amount: 1000, method: "especes" });
    await runOp(acc, "order.payment", { id: a.id, pid: "p1", amount: 1000, method: "especes" }); // doublon ignoré
    await runOp(acc, "order.payment", { id: a.id, pid: "p2", amount: 500, method: "mobile_money", ref: "" });
    await runOp(acc, "order.payment", { id: a.id, pid: "p3", amount: 500, method: "en_ligne", ref: "TX123" }); // non vérifié
    let o = col<Order>(store, "order")[0]!.data;
    expect(o.payments.map((p) => p.status)).toEqual(["confirme", "en_attente", "en_attente"]);
    expect(paidOf(o)).toBe(1000);
    expect(col<Transaction>(store, "transaction")).toHaveLength(1);
    await expect(runOp(acc, "order.payment_confirm", { id: a.id, pid: "p2", ref: "", verified: true })).rejects.toThrow(/numéro de transaction/);
    await expect(runOp(acc, "order.payment_confirm", { id: a.id, pid: "p2", ref: "OM-998", verified: false })).rejects.toThrow(/vérifié/);
    await runOp(acc, "order.payment_confirm", { id: a.id, pid: "p2", ref: "OM-998", verified: true });
    o = col<Order>(store, "order")[0]!.data;
    expect(paidOf(o)).toBe(1500);
    expect(col<Transaction>(store, "transaction")).toHaveLength(2);
    await expect(runOp(acc, "order.payment", { id: a.id, pid: "p9", amount: price, method: "especes" })).rejects.toThrow(/il ne reste/i);
    await expect(runOp(acc, "order.payment_cancel", { id: a.id, pid: "p1", reason: "erreur" })).rejects.toThrow(/responsable/);
    await runOp(mgr, "order.payment_cancel", { id: a.id, pid: "p1", reason: "Saisie en double" });
    expect(col<Transaction>(store, "transaction")).toHaveLength(1);
    expect(paidOf(col<Order>(store, "order")[0]!.data)).toBe(500);
  });
});

describe("Transport : page publique", () => {
  it("n'accepte une demande que si la page est ouverte, avec les modes de paiement proposés", async () => {
    const { store, mgr } = await company();
    const pub: OpContext = { store, actor: { id: MGR, role: "employee" }, public: true, members: MEMBERS };
    const q = await runOp(pub, "order.quote", { zone: "Nord", urgency: "express", vehicle_kind: "moto", distance_km: 5, parcel: { weight_kg: 2, type: "Fragile" } });
    expect((q.data as { total: number }).total).toBe(Math.round((1000 + 500 + 1500) * 1.5 * 1.5));
    const r = await runOp(pub, "order.request", { ...ORDER, pay_mode: "livraison", hp: "" });
    expect(r.tracking).toBeTruthy();
    const o = col<Order>(store, "order")[0]!.data;
    expect(o).toMatchObject({ status: "nouvelle", source: "public", courier_id: null });
    await expect(runOp(pub, "order.request", { ...ORDER, pay_mode: "mobile_money" })).rejects.toThrow(/mode de paiement/);
    await expect(runOp(pub, "order.request", { ...ORDER, hp: "robot" })).rejects.toThrow();
    await expect(runOp(pub, "order.status", { id: "x", status: "livre" })).rejects.toThrow(/non autorisée/);
    await expect(runOp(pub, "order.delete", { id: "x" })).rejects.toThrow(/non autorisée/);
    await runOp(mgr, "settings.save", { ...SETTINGS, online: { ...SETTINGS.online, open: false } });
    await expect(runOp(pub, "order.request", ORDER)).rejects.toThrow(/n'accepte pas/);
    await expect(runOp(ctx(store, MGR, "manager"), "order.request", ORDER)).rejects.toThrow(/page publique/);
  });
});

describe("Transport : véhicules, finances, statistiques", () => {
  it("gère véhicules, entretien et carburant (dépenses créées une fois)", async () => {
    const { store, mgr } = await company();
    const v = await runOp(mgr, "vehicle.save", { brand: "Yamaha", model: "YBR", plate: "bg 123 a", kind: "moto" });
    await expect(runOp(mgr, "vehicle.save", { brand: "X", plate: "BG123A", kind: "moto" })).rejects.toThrow(/existe déjà/);
    const eid = uid();
    await runOp(mgr, "vehicle.maintenance", { id: v.id, eid, date: "2026-05-01", kind: "Vidange", cost: 15000, next: "2026-08-01" });
    await runOp(mgr, "vehicle.maintenance", { id: v.id, eid, date: "2026-05-01", kind: "Vidange", cost: 15000 });
    await runOp(mgr, "vehicle.fuel", { id: v.id, eid: uid(), date: "2026-05-02", liters: 5, cost: 4000 });
    const veh = col<Vehicle>(store, "vehicle")[0]!.data;
    expect(veh.maintenance).toHaveLength(1);
    expect(veh.next_maintenance).toBe("2026-08-01");
    const tx = col<Transaction>(store, "transaction");
    expect(tx.map((t) => t.data.category).sort()).toEqual(["carburant", "entretien"]);
    const c = await runOp(mgr, "courier.save", { name: "Zed", vehicle_id: v.id });
    await expect(runOp(mgr, "vehicle.delete", { id: v.id })).rejects.toThrow(/attribué/);
    await runOp(mgr, "courier.delete", { id: c.id });
  });

  it("calcule le tableau de bord et les performances sans rien inventer", async () => {
    const { store, mgr, liv, c1 } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    const b = await runOp(mgr, "order.save", ORDER);
    await runOp(mgr, "order.save", ORDER);
    for (const o of [a, b]) await runOp(mgr, "order.assign", { id: o.id, courier_id: c1 });
    await runOp(liv, "order.step", { id: a.id, status: "recupere" });
    await runOp(liv, "order.step", { id: a.id, status: "en_cours" });
    await runOp(liv, "order.deliver", { id: a.id, note: "ok", collect: true });
    await runOp(mgr, "order.cancel", { id: b.id, reason: "Test" });
    const orders = col<Order>(store, "order");
    const st = dayStats(orders, col<Transaction>(store, "transaction"), new Date().toISOString().slice(0, 10));
    expect(st).toMatchObject({ total: 3, waiting: 1, done: 1, cancelled: 1, inProgress: 0, late: 0 });
    expect(st.revenue).toBeGreaterThan(0);
    expect(courierStats(orders, c1)).toMatchObject({ assigned: 2, done: 1, successRate: 100 });
    const late = { ...orders[0]!.data, status: "en_cours" as const, eta: "2020-01-01T00:00:00.000Z" };
    expect(orderLate(late)).toBe(true);
    expect(orderLate({ ...late, status: "livre" })).toBe(false);
  });

  it("protège les écritures issues de commandes et valide les écritures manuelles", async () => {
    const { store, mgr, acc } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    await runOp(acc, "order.payment", { id: a.id, pid: "p1", amount: 500, method: "especes" });
    const tx = col<Transaction>(store, "transaction")[0]!;
    await expect(runOp(acc, "transaction.delete", { id: tx.id })).rejects.toThrow(/paiement de commande/);
    const d = await runOp(acc, "transaction.save", { type: "depense", amount: 25000, category: "paiement_livreur", date: "2026-05-05", description: "Salaire", courier_id: null });
    await expect(runOp(acc, "transaction.save", { type: "depense", amount: 0, category: "autre", date: "2026-05-05" })).rejects.toThrow();
    await runOp(acc, "transaction.delete", { id: d.id });
    await expect(runOp(acc, "order.save", ORDER)).rejects.toThrow(/poste/);
  });
});

describe("Transport : droits d'accès et séparation des données", () => {
  it("filtre les données par poste : livreur, comptable, responsable", async () => {
    const { store, mgr, liv, c1, c2 } = await company();
    const a = await runOp(mgr, "order.save", ORDER);
    const b = await runOp(mgr, "order.save", ORDER);
    await runOp(mgr, "order.assign", { id: a.id, courier_id: c1 });
    await runOp(mgr, "order.assign", { id: b.id, courier_id: c2 });
    await runOp(mgr, "order.payment", { id: a.id, pid: "p1", amount: 500, method: "especes" });
    void liv;
    const asLiv = visibleData(store.data, LIV, "employee", P_LIV);
    expect(asLiv.order.map((o) => o.id)).toEqual([a.id]);
    expect(asLiv.courier.map((c) => c.id)).toEqual([c1]);
    expect(asLiv.transaction).toHaveLength(0);
    expect(asLiv.file).toHaveLength(0);
    const asAcc = visibleData(store.data, ACC, "employee", P_ACC);
    expect(asAcc.order).toHaveLength(2);
    expect(asAcc.transaction).toHaveLength(1);
    const asMgr = visibleData(store.data, MGR, "manager", null);
    expect(asMgr.order).toHaveLength(2);
    expect(fileAllowed(asLiv.order as Doc<Order>[], P_LIV, null, "inconnu")).toBe(false);
  });

  it("isole deux entreprises et définit les postes du secteur transport", async () => {
    const a = await company();
    const b = await company();
    await runOp(a.mgr, "order.save", ORDER);
    expect(a.store.data.order).toHaveLength(1);
    expect(b.store.data.order).toHaveLength(0);
    expect(sectorOf(null, "transport")).toBe("transport");
    const keys = positionsFor("transport").map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["administrateur", "responsable", "livreur", "comptable"]));
    for (const p of positionsFor("transport")) for (const perm of p.permissions) expect(SECTOR_PERMISSIONS.transport).toContain(perm);
    await expect(runOp({ ...a.mgr, actor: { id: MGR, role: "viewer" } }, "order.save", ORDER)).rejects.toThrow(/lecture seule/);
  });
});
