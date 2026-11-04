import { describe, expect, it } from "vitest";
import { OpError, runOp, type OpContext } from "@/lib/venue/engine";
import { MemoryStore } from "@/lib/venue/memory-store";
import { periodPreset, type Booking, type Doc, type Order, type Table } from "@/lib/venue/model";
import { hashToken } from "@/lib/venue/vision-ops";
import { DEFAULT_VISION, liveTables, visionStats, type Camera, type Seat, type VisionAlert } from "@/lib/venue/vision";

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const STAFF = "00000000-0000-4000-8000-0000000000bb";

function setup(opts: { demo?: boolean } = {}) {
  const store = new MemoryStore();
  let clock = new Date();
  const ctx = (role: "owner" | "employee" | "viewer" = "owner", extra: Partial<OpContext> = {}): OpContext => ({ store, actor: { id: role === "owner" ? OWNER : STAFF, role }, members: [OWNER, STAFF], kind: "restaurant", now: () => clock, demo: opts.demo, ...extra });
  const run = (op: string, input: unknown, role: "owner" | "employee" | "viewer" = "owner", extra: Partial<OpContext> = {}) => runOp(ctx(role, extra), op, input);
  const advance = (min: number) => (clock = new Date(clock.getTime() + min * 60_000));
  const live = () => liveTables(store.data.table as Doc<Table>[], store.data.vseat as Doc<Seat>[], store.data.booking as Doc<Booking>[], store.data.valert as Doc<VisionAlert>[], DEFAULT_VISION, clock, store.data.order as Doc<Order>[]);
  return { store, run, advance, live, now: () => clock };
}
const k = () => crypto.randomUUID();

async function withTable(run: ReturnType<typeof setup>["run"], number = "4", seats = 4) {
  return (await run("table.save", { zone: "salle", number, seats })).id!;
}

describe("Vision IA : statuts des tables", () => {
  it("libre → en attente de service → occupée → à nettoyer → libre", async () => {
    const { run, live } = setup();
    const t = await withTable(run);
    expect(live()[0]!.status).toBe("libre");
    const seat = (await run("vision.seat", { table_id: t, guests: 2, idem: k() }, "employee")).id!;
    expect(live()[0]!.status).toBe("attente");
    await run("vision.served", { seat_id: seat }, "employee");
    expect(live()[0]!.status).toBe("occupee");
    await run("vision.release", { seat_id: seat }, "employee");
    expect(live()[0]!.status).toBe("nettoyage");
    await run("vision.clean", { seat_id: seat }, "employee");
    expect(live()[0]!.status).toBe("libre");
  });

  it("le statut de commande vient de la cuisine : en attente du plat puis plat prêt", async () => {
    const { run, live } = setup();
    const t = await withTable(run);
    const menu = (await run("menu.save", { name: "Poulet DG", category: "plat", price: 5000 })).id!;
    await run("vision.seat", { table_id: t, guests: 2, idem: k() });
    const order = (await run("order.create", { source: "salle", table_id: t, stay_id: null, customer: "", lines: [{ menu_id: menu, qty: 1 }], idem: k() })).id!;
    expect(live()[0]!.status).toBe("attente_plat");
    await run("order.status", { id: order, to: "prete" });
    expect(live()[0]!.status).toBe("plat_pret");
    await run("order.status", { id: order, to: "servie" });
    expect(live()[0]!.status).toBe("occupee");
    // Le paiement n'a rien changé : la commande reste « non payée » tant qu'aucun encaissement n'est confirmé.
    expect((live()[0]!.orders[0]!.data as Order).pay_status).toBe("non_paye");
  });

  it("une réservation confirmée apparaît « Réservée » et passe « Clients installés » à l'arrivée", async () => {
    const { run, live, now, store } = setup();
    const t = await withTable(run);
    const n = now();
    const hh = String(n.getHours()).padStart(2, "0");
    const date = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
    const b = (await run("booking.save", { table_id: t, date, start: `${hh}:00`, minutes: 120, guests: 3, name: "Réf. 1234", idem: k() })).id!;
    expect(live()[0]!.status).toBe("reservee");
    await run("vision.seat", { table_id: t, guests: 3, booking_id: b, idem: k() });
    expect((store.data.booking.find((x) => x.id === b)!.data as Booking).status).toBe("arrivee");
  });

  it("refuse deux installations sur la même table et ignore un double envoi", async () => {
    const { run, store } = setup();
    const t = await withTable(run);
    const key = k();
    await run("vision.seat", { table_id: t, guests: 2, idem: key });
    expect((await run("vision.seat", { table_id: t, guests: 2, idem: key })).duplicate).toBe(true);
    await expect(run("vision.seat", { table_id: t, guests: 2, idem: k() })).rejects.toBeInstanceOf(OpError);
    expect(store.data.vseat).toHaveLength(1);
  });

  it("refuse plus de personnes que de places et le rôle lecture seule", async () => {
    const { run } = setup();
    const t = await withTable(run, "1", 2);
    await expect(run("vision.seat", { table_id: t, guests: 5, idem: k() })).rejects.toBeInstanceOf(OpError);
    await expect(run("vision.seat", { table_id: t, guests: 1, idem: k() }, "viewer")).rejects.toBeInstanceOf(OpError);
  });
});

describe("Vision IA : alertes de délai", () => {
  it("une seule alerte par passage, prise en charge puis clôturée quand le client est servi", async () => {
    const { run, advance, store } = setup();
    const t = await withTable(run);
    await run("vision.settings", { alert_minutes: 10, order_minutes: 0, prep_minutes: 0, ready_minutes: 0, sound: true });
    const seat = (await run("vision.seat", { table_id: t, guests: 2, idem: k() })).id!;
    advance(5);
    expect((await run("vision.tick", {}, "employee")).effects).toHaveLength(0);
    advance(6);
    const r = await run("vision.tick", {}, "employee");
    expect(r.effects).toEqual([expect.objectContaining({ type: "vision_alert", table: "4" })]);
    // Plusieurs appareils vérifient en même temps : aucune alerte en double.
    await Promise.all([run("vision.tick", {}, "employee"), run("vision.tick", {}, "owner")]);
    expect(store.data.valert).toHaveLength(1);
    const alert = store.data.valert[0]!;
    await run("vision.ack", { alert_id: alert.id }, "employee");
    expect((store.data.valert[0]!.data as VisionAlert).ack_by).toBe(STAFF);
    await run("vision.served", { seat_id: seat }, "employee");
    expect((store.data.valert[0]!.data as VisionAlert).resolved_at).not.toBeNull();
    advance(30);
    await run("vision.tick", {});
    expect(store.data.valert).toHaveLength(1);
  });

  it("alertes de commande, de préparation et de plat prêt avec leurs propres seuils", async () => {
    const { run, advance, store } = setup();
    const t = await withTable(run);
    const menu = (await run("menu.save", { name: "Ndolé", category: "plat", price: 4000 })).id!;
    await run("vision.settings", { alert_minutes: 0, order_minutes: 5, prep_minutes: 20, ready_minutes: 3, sound: false });
    await run("vision.seat", { table_id: t, guests: 2, idem: k() });
    advance(6);
    await run("vision.tick", {});
    expect(store.data.valert.map((a) => (a.data as VisionAlert).kind)).toEqual(["commande"]);
    const order = (await run("order.create", { source: "salle", table_id: t, stay_id: null, customer: "", lines: [{ menu_id: menu, qty: 2 }], idem: k() })).id!;
    await run("vision.tick", {});
    expect((store.data.valert.find((a) => (a.data as VisionAlert).kind === "commande")!.data as VisionAlert).resolved_at).not.toBeNull();
    advance(21);
    await run("vision.tick", {});
    expect(store.data.valert.some((a) => (a.data as VisionAlert).kind === "preparation")).toBe(true);
    await run("order.status", { id: order, to: "prete" });
    advance(4);
    await run("vision.tick", {});
    const kinds = store.data.valert.map((a) => a.data as VisionAlert);
    expect(kinds.find((a) => a.kind === "preparation")!.resolved_at).not.toBeNull();
    expect(kinds.find((a) => a.kind === "plat")!.resolved_at).toBeNull();
  });
});

describe("Vision IA : caméra et démonstration", () => {
  it("la simulation est refusée sur les données réelles", async () => {
    const { run } = setup({ demo: false });
    const t = await withTable(run);
    await expect(run("vision.detect", { source: "demo", observations: [{ table_id: t, occupied: true }], idem: k() })).rejects.toThrow(/démonstration/);
  });

  it("en démonstration, une arrivée simulée ouvre un passage marqué « demo » et un départ le termine", async () => {
    const { run, store, live } = setup({ demo: true });
    const t = await withTable(run);
    await run("vision.detect", { source: "demo", observations: [{ table_id: t, occupied: true, people: 3 }], idem: k() });
    expect((store.data.vseat[0]!.data as Seat).source).toBe("demo");
    await run("vision.detect", { source: "demo", observations: [{ table_id: t, occupied: false }], idem: k() });
    expect(live()[0]!.status).toBe("nettoyage");
  });

  it("les détections caméra ne passent que par la passerelle de cette caméra et ne libèrent pas une table saisie à la main", async () => {
    const { run, store } = setup();
    const t = await withTable(run);
    const cam = (await run("vision.camera.save", { name: "Salle", zone: "salle", table_ids: [t] })).id!;
    const obs = { source: "camera", camera_id: cam, observations: [{ table_id: t, occupied: true }], idem: k() };
    await expect(run("vision.detect", obs)).rejects.toThrow(/passerelle/);
    await run("vision.detect", obs, "employee", { gateway: cam });
    expect((store.data.vseat[0]!.data as Seat).source).toBe("camera");
    expect((store.data.vcam[0]!.data as Camera).last_seen).not.toBeNull();
    // Table installée à la main : la caméra ne la libère pas.
    const t2 = await withTable(run, "5");
    await run("vision.camera.save", { id: cam, name: "Salle", zone: "salle", table_ids: [t, t2] });
    await run("vision.seat", { table_id: t2, guests: 2, idem: k() });
    await run("vision.detect", { ...obs, observations: [{ table_id: t2, occupied: false }], idem: k() }, "employee", { gateway: cam });
    expect(store.data.vseat.filter((s) => !(s.data as Seat).ended_at)).toHaveLength(2);
  });

  it("refuse les champs d'image et ne stocke que l'empreinte de la clé", async () => {
    const { run, store } = setup();
    const t = await withTable(run);
    const cam = (await run("vision.camera.save", { name: "Salle", zone: "salle", table_ids: [t] })).id!;
    await expect(run("vision.detect", { source: "camera", camera_id: cam, observations: [{ table_id: t, occupied: true, image: "data:image/png;base64,AAA" }], idem: k() }, "employee", { gateway: cam })).rejects.toBeInstanceOf(OpError);
    const r = await run("vision.camera.token", { id: cam });
    const c = store.data.vcam[0]!.data as Camera;
    expect(r.secret).toMatch(/^msv_[0-9a-f]{64}$/);
    expect(c.token_hash).toBe(await hashToken(r.secret!));
    expect(JSON.stringify(store.data.vcam)).not.toContain(r.secret!);
    await run("vision.camera.toggle", { id: cam, active: false });
    expect((store.data.vcam[0]!.data as Camera).token_hash).toBeNull();
  });
});

describe("Vision IA : statistiques", () => {
  it("temps moyen avant le premier service et passages partis sans être servis", async () => {
    const { run, advance, store } = setup();
    const t = await withTable(run);
    const s1 = (await run("vision.seat", { table_id: t, guests: 2, idem: k() })).id!;
    advance(8);
    await run("vision.served", { seat_id: s1 });
    await run("vision.release", { seat_id: s1 });
    await run("vision.clean", { seat_id: s1 });
    const s2 = (await run("vision.seat", { table_id: t, guests: 4, idem: k() })).id!;
    advance(3);
    await run("vision.release", { seat_id: s2 });
    const st = visionStats(store.data.vseat as Doc<Seat>[], store.data.valert as Doc<VisionAlert>[], store.data.table as Doc<Table>[], { from: "2000-01-01", to: "2999-12-31" }, store.data.order as Doc<Order>[]);
    expect(st.seatings).toBe(2);
    expect(st.guests).toBe(6);
    expect(st.avgWait).toBe(8);
    expect(st.leftUnserved).toBe(1);
    expect(periodPreset("today").from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
