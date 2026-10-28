import { describe, expect, it } from "vitest";
import { OpError, runOp, type OpContext } from "@/lib/venue/engine";
import { MemoryStore } from "@/lib/venue/memory-store";
import { activeZones, coldLimits, defaultSettings, finances, occupancy, roomState, type Doc, type Item, type Order, type Room, type Settings, type Stay, type Task } from "@/lib/venue/model";

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const STAFF = "00000000-0000-4000-8000-0000000000bb";
const NOW = new Date("2026-10-28T10:00:00Z");

function setup(kind: "restaurant" | "hotel" = "restaurant") {
  const store = new MemoryStore();
  let n = 0;
  const ctx = (role: "owner" | "employee" | "viewer" = "owner", id = role === "owner" ? OWNER : STAFF): OpContext => ({ store, actor: { id, role }, members: [OWNER, STAFF], kind, now: () => NOW, uuid: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
  const run = (op: string, input: unknown, role: "owner" | "employee" | "viewer" = "owner") => runOp(ctx(role), op, input);
  return { store, run };
}
const k = () => crypto.randomUUID();

describe("questionnaire du plan", () => {
  it("n'affiche la terrasse que si le restaurant en a une", async () => {
    const { store, run } = setup();
    await run("settings.save", { answered: true, terrace: false });
    let s = store.data.settings[0]!.data as Settings;
    expect(activeZones(s)).not.toContain("terrasse");
    await run("settings.save", { terrace: true });
    s = store.data.settings[0]!.data as Settings;
    expect(activeZones(s)).toContain("terrasse");
    expect(store.data.settings).toHaveLength(1);
  });
  it("hôtel sans restaurant : ni restaurant ni cuisine, pas de service en chambre", async () => {
    const { store, run } = setup("hotel");
    await run("settings.save", { answered: true, has_restaurant: false, room_service: true });
    const s = store.data.settings[0]!.data as Settings;
    expect(activeZones(s)).toEqual(["reception", "chambres", "bureau"]);
    expect(s.room_service).toBe(false);
  });
  it("seuls les gérants configurent le plan", async () => {
    const { run } = setup();
    await expect(run("settings.save", { terrace: true }, "employee")).rejects.toBeInstanceOf(OpError);
  });
});

describe("tables et réservations", () => {
  it("refuse une réservation qui chevauche une autre sur la même table", async () => {
    const { run } = setup();
    const t = await run("table.save", { zone: "salle", number: "1", seats: 4 });
    await run("booking.save", { table_id: t.id, date: "2026-10-30", start: "19:00", minutes: 90, guests: 2, name: "Awa", idem: k() });
    await expect(run("booking.save", { table_id: t.id, date: "2026-10-30", start: "20:00", minutes: 60, guests: 2, name: "Paul", idem: k() })).rejects.toThrow(/déjà réservée/);
    const later = await run("booking.save", { table_id: t.id, date: "2026-10-30", start: "20:30", minutes: 60, guests: 2, name: "Paul", idem: k() });
    expect(later.id).toBeTruthy();
    await expect(run("booking.save", { table_id: t.id, date: "2026-10-31", start: "12:00", guests: 9, name: "Groupe", idem: k() })).rejects.toThrow(/place/);
  });
  it("un double envoi n'enregistre qu'une réservation", async () => {
    const { store, run } = setup();
    const t = await run("table.save", { zone: "terrasse", number: "T1", seats: 2 });
    const key = k();
    await run("booking.save", { table_id: t.id, date: "2026-10-30", start: "12:00", guests: 2, name: "A", idem: key });
    const again = await run("booking.save", { table_id: t.id, date: "2026-10-30", start: "12:00", guests: 2, name: "A", idem: key });
    expect(again.duplicate).toBe(true);
    expect(store.data.booking).toHaveLength(1);
  });
});

describe("commandes, stock et paiements", () => {
  async function withOrder() {
    const env = setup();
    const flour = await env.run("item.save", { zone: "stock", name: "Riz", category: "ingredient", unit: "kg", unit_price: 800, min_qty: 2, initial_qty: 10 });
    const dish = await env.run("menu.save", { name: "Riz sauce", category: "plat", price: 2500, portions: 1, recipe: [{ item_id: flour.id, qty: 0.5 }] });
    const order = await env.run("order.create", { source: "caisse", lines: [{ menu_id: dish.id, qty: 2 }], idem: k() }, "employee");
    return { ...env, flour: flour.id!, order: order.id! };
  }
  it("prix repris de la carte et ingrédients déduits une seule fois", async () => {
    const { store, run, flour, order } = await withOrder();
    expect((store.data.order[0]!.data as Order).total).toBe(5000);
    await run("order.status", { id: order, to: "en_preparation" }, "employee");
    await run("order.status", { id: order, to: "prete" }, "employee");
    await run("order.status", { id: order, to: "servie" }, "employee");
    const item = store.data.item.find((i) => i.id === flour)!.data as Item;
    expect(item.qty).toBe(9);
    expect(store.data.move.filter((m) => m.data.order_id === order)).toHaveLength(1);
  });
  it("commande prête : effet pour prévenir le service", async () => {
    const { run, order } = await withOrder();
    const r = await run("order.status", { id: order, to: "prete" }, "employee");
    expect(r.effects[0]?.type).toBe("order_ready");
  });
  it("empêche les doubles paiements et le dépassement du total", async () => {
    const { store, run, order } = await withOrder();
    const key = k();
    const p = await run("payment.add", { target: "order", target_id: order, amount: 3000, method: "especes", tendered: 5000, idem: key }, "employee");
    expect(p.message).toMatch(/monnaie à rendre : 2\s000/);
    expect((await run("payment.add", { target: "order", target_id: order, amount: 3000, method: "especes", idem: key }, "employee")).duplicate).toBe(true);
    await expect(run("payment.add", { target: "order", target_id: order, amount: 2500, method: "especes", idem: k() }, "employee")).rejects.toThrow(/dépasse/);
    await run("payment.add", { target: "order", target_id: order, amount: 2000, method: "mobile_money", idem: k() }, "employee");
    expect((store.data.order[0]!.data as Order).pay_status).toBe("partiel");
    // Le paiement mobile money en attente ne compte pas dans les recettes.
    expect(finances(store.data, { from: "2026-01-01", to: "2026-12-31" }).receipts).toBe(3000);
    await expect(run("payment.add", { target: "order", target_id: order, amount: 1, method: "especes", idem: k() }, "employee")).rejects.toThrow(/attente/);
    const pending = store.data.payment.find((x) => x.data.status === "en_attente")!;
    await run("payment.confirm", { id: pending.id }, "employee");
    expect((store.data.order[0]!.data as Order).pay_status).toBe("paye");
    expect(finances(store.data, { from: "2026-01-01", to: "2026-12-31" }).receipts).toBe(5000);
  });
  it("refuse une sortie supérieure au stock", async () => {
    const { run, flour } = await withOrder();
    await expect(run("item.move", { id: flour, type: "retrait", qty: 50, idem: k() }, "employee")).rejects.toThrow(/insuffisant/);
  });
});

describe("chambre froide", () => {
  it("alerte quand le relevé manuel sort des seuils (produit le plus exigeant)", async () => {
    const { store, run } = setup();
    await run("settings.save", { cold_min: 0, cold_max: 6 });
    await run("item.save", { zone: "froid", name: "Poisson", category: "ingredient", unit: "kg", temp_max: 2, initial_qty: 3 });
    const lim = coldLimits({ ...defaultSettings("restaurant"), ...(store.data.settings[0]!.data as Settings) }, store.data.item as Doc<Item>[]);
    expect(lim.max).toBe(2);
    const r = await run("temp.add", { value: 4, idem: k() }, "employee");
    expect(r.effects[0]?.type).toBe("temp_alert");
    expect(store.data.temp[0]!.data.source).toBe("manuel");
    const fine = await run("temp.add", { value: 1, idem: k() }, "employee");
    expect(fine.effects).toHaveLength(0);
  });
});

describe("tâches répétées", () => {
  it("crée la prochaine occurrence une seule fois", async () => {
    const { store, run } = setup();
    const t = await run("task.save", { zone: "toilettes", kind: "nettoyage", title: "Nettoyer les toilettes", frequency: "quotidienne", due: "2026-10-28" });
    await run("task.status", { id: t.id, to: "fait" });
    const open = (store.data.task as Doc<Task>[]).filter((x) => x.data.status === "a_faire");
    expect(open).toHaveLength(1);
    expect(open[0]!.data.due).toBe("2026-10-29");
  });
});

describe("hôtel", () => {
  async function hotel() {
    const env = setup("hotel");
    await env.run("settings.save", { answered: true, has_restaurant: true, room_service: true });
    const room = await env.run("room.save", { number: "101", type: "Double", capacity: 2, price_night: 25000 });
    return { ...env, room: room.id! };
  }
  it("empêche les doubles réservations d'une chambre (jour de départ libre)", async () => {
    const { run, room } = await hotel();
    await run("stay.save", { room_id: room, guest: { name: "M. Doko" }, arrival: "2026-10-28", departure: "2026-10-30", adults: 2, rate: 25000, idem: k() }, "employee");
    await expect(run("stay.save", { room_id: room, guest: { name: "Mme Yassi" }, arrival: "2026-10-29", departure: "2026-10-31", adults: 1, rate: 25000, idem: k() }, "employee")).rejects.toThrow(/déjà réservée/);
    const next = await run("stay.save", { room_id: room, guest: { name: "Mme Yassi" }, arrival: "2026-10-30", departure: "2026-10-31", adults: 1, rate: 25000, idem: k() }, "employee");
    expect(next.id).toBeTruthy();
  });
  it("arrivée, consommation sur la note, départ et état de la chambre", async () => {
    const { store, run, room } = await hotel();
    const st = await run("stay.save", { room_id: room, guest: { name: "M. Doko" }, arrival: "2026-10-28", departure: "2026-10-30", adults: 1, rate: 25000, idem: k() }, "employee");
    const roomDoc = () => store.data.room.find((r) => r.id === room) as Doc<Room>;
    expect(roomState(roomDoc(), store.data.stay as Doc<Stay>[], NOW)).toBe("reservee");
    await run("stay.status", { id: st.id, to: "arrivee" }, "employee");
    expect(roomState(roomDoc(), store.data.stay as Doc<Stay>[], NOW)).toBe("occupee");
    const dish = await run("menu.save", { name: "Petit déjeuner", category: "plat", price: 3000 });
    const o = await run("order.create", { source: "room_service", stay_id: st.id, lines: [{ menu_id: dish.id, qty: 1 }], idem: k() }, "employee");
    await run("order.charge_room", { id: o.id, stay_id: st.id }, "employee");
    expect((await run("order.charge_room", { id: o.id, stay_id: st.id }, "employee")).duplicate).toBe(true);
    const stay = store.data.stay.find((s) => s.id === st.id)!.data as Stay;
    expect(stay.charges).toHaveLength(1);
    await expect(run("payment.add", { target: "order", target_id: o.id, amount: 3000, method: "especes", idem: k() }, "employee")).rejects.toThrow(/note de chambre/);
    await run("payment.add", { target: "stay", target_id: st.id, amount: 53000, method: "especes", idem: k() }, "employee");
    await run("stay.status", { id: st.id, to: "partie" }, "employee");
    expect(roomState(roomDoc(), store.data.stay as Doc<Stay>[], NOW)).toBe("a_nettoyer");
    const f = finances(store.data, { from: "2026-01-01", to: "2026-12-31" });
    expect(f.lodging).toBe(53000);
    expect(f.restaurant).toBe(0);
    expect(f.roomCharged).toBe(3000);
    await run("room.clean", { id: room, idem: k() }, "employee");
    expect(roomState(roomDoc(), store.data.stay as Doc<Stay>[], NOW)).toBe("disponible");
  });
  it("taux d'occupation calculé sur les séjours enregistrés", async () => {
    const { store, run, room } = await hotel();
    await run("stay.save", { room_id: room, guest: { name: "A" }, arrival: "2026-10-01", departure: "2026-10-03", adults: 1, rate: 1000, idem: k() }, "employee");
    expect(occupancy(store.data.room as Doc<Room>[], store.data.stay as Doc<Stay>[], { from: "2026-10-01", to: "2026-10-10" }).rate).toBe(20);
  });
  it("lecture seule : aucune écriture", async () => {
    const { run, room } = await hotel();
    await expect(run("stay.save", { room_id: room, guest: { name: "A" }, arrival: "2026-11-01", departure: "2026-11-02", adults: 1, rate: 1000, idem: k() }, "viewer")).rejects.toThrow(/lecture seule/);
  });
});
