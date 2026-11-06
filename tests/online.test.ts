import { describe, expect, it } from "vitest";
import { OpError, runOp, type OpContext } from "@/lib/venue/engine";
import { MemoryStore } from "@/lib/venue/memory-store";
import { type Doc, type Payment, type Table } from "@/lib/venue/model";
import { DEFAULT_MENU_STYLE, menuStyle, menuTokens, onColor } from "@/lib/venue/menu-style";
import { kitchenReport, onlineSettings, publicOrder, type DayStat, type FullOrder, type OnlineItem } from "@/lib/venue/online";

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const COOK = "00000000-0000-4000-8000-0000000000cc";
const WAITER = "00000000-0000-4000-8000-0000000000dd";

function setup(opts: { demo?: boolean } = {}) {
  const store = new MemoryStore();
  const staff = (role: "owner" | "employee", id: string): OpContext => ({ store, actor: { id, role }, members: [OWNER, COOK, WAITER], kind: "restaurant", demo: opts.demo });
  const pub: OpContext = { store, actor: { id: OWNER, role: "employee" }, members: [], kind: "restaurant", public: true, demo: opts.demo };
  const own = (op: string, input: unknown) => runOp(staff("owner", OWNER), op, input);
  return { store, own, staff, pub };
}
const k = () => crypto.randomUUID();

async function restaurant(own: ReturnType<typeof setup>["own"], extra: Record<string, unknown> = {}) {
  await own("online.settings", { published: true, ordering: true, pay_counter: true, kitchen_after_payment: false, welcome: "", ...extra });
  const dish = (await own("menu.save", { name: "Poulet braisé", category: "plat", price: 4000 })).id!;
  await own("online.item", { menu_id: dish, description: "Avec alloco", options: [{ name: "Piment", price: 0 }, { name: "Double portion", price: 2000 }], available: true });
  const table = (await own("table.save", { zone: "salle", number: "4", seats: 4 })).id!;
  await own("qr.table", { table_id: table, action: "generate" });
  await own("staff.save", { name: "Koffi", role: "Cuisinier", phone: "", member_id: COOK, notes: "", schedule: [] });
  await own("staff.save", { name: "Ines", role: "Serveuse", phone: "", member_id: WAITER, notes: "", schedule: [] });
  return { dish, table };
}

describe("Restaurant en ligne : commande du client", () => {
  it("la table vient du jeton du QR code et les prix (options comprises) viennent du serveur", async () => {
    const { store, own, pub } = setup();
    const { dish, table } = await restaurant(own);
    const t = store.data.table.find((x) => x.id === table)!.data as Table;
    const m = store.data.menu.find((x) => x.id === dish)!.data as OnlineItem;
    const dbl = m.options!.find((o) => o.name === "Double portion")!;
    const r = await runOp(pub, "online.order", { table_token: t.qr_token, lines: [{ menu_id: dish, qty: 2, options: [dbl.id], note: "sans oignon", unit_price: 1 }], pay: "caisse", idem: k() });
    const o = store.data.order[0]!.data as FullOrder;
    expect(o.table_id).toBe(table);
    expect(o.total).toBe(12000);
    expect(o.channel).toBe("qr");
    expect(r.secret).toBe(o.tracking_token);
    expect(o.tracking_token!.length).toBeGreaterThanOrEqual(30);
  });

  it("refuse un QR code désactivé ou inconnu, un plat épuisé et un menu non publié", async () => {
    const { store, own, pub } = setup();
    const { dish, table } = await restaurant(own);
    const token = (store.data.table.find((x) => x.id === table)!.data as Table).qr_token;
    await expect(runOp(pub, "online.order", { table_token: "inconnu-0000", lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() })).rejects.toMatchObject({ status: 410 });
    await own("qr.table", { table_id: table, action: "disable" });
    await expect(runOp(pub, "online.order", { table_token: token, lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() })).rejects.toMatchObject({ status: 410 });
    await own("qr.table", { table_id: table, action: "enable" });
    await own("online.available", { menu_id: dish, available: false });
    await expect(runOp(pub, "online.order", { table_token: token, lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() })).rejects.toThrow(/plus disponible/);
    await own("online.available", { menu_id: dish, available: true });
    await own("online.settings", { published: false, ordering: true, pay_counter: true, kitchen_after_payment: false });
    await expect(runOp(pub, "online.order", { table_token: token, lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() })).rejects.toThrow(/pas ouverte/);
  });

  it("régénérer un QR code invalide l'ancien lien", async () => {
    const { store, own, pub } = setup();
    const { dish, table } = await restaurant(own);
    const old = (store.data.table.find((x) => x.id === table)!.data as Table).qr_token;
    await own("qr.table", { table_id: table, action: "generate" });
    await expect(runOp(pub, "online.order", { table_token: old, lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() })).rejects.toMatchObject({ status: 410 });
  });

  it("ALETCHCARD n'est pas simulé, et le paiement de démonstration n'existe qu'en démonstration", async () => {
    const { own, pub } = setup();
    const { dish } = await restaurant(own);
    await expect(runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "aletchcard", idem: k() })).rejects.toMatchObject({ status: 503 });
    await expect(runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "demo", idem: k() })).rejects.toMatchObject({ status: 403 });
    const r = await runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() });
    await expect(runOp(pub, "online.demo_pay", { tracking_token: r.secret })).rejects.toMatchObject({ status: 403 });
  });

  it("les opérations publiques sont refusées hors du menu en ligne, et l'inverse", async () => {
    const { own, staff, pub } = setup();
    const { dish } = await restaurant(own);
    await expect(runOp(staff("owner", OWNER), "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() })).rejects.toBeInstanceOf(OpError);
    await expect(runOp(pub, "online.settings", { published: true, ordering: true, pay_counter: true, kitchen_after_payment: false })).rejects.toBeInstanceOf(OpError);
  });
});

describe("Restaurant en ligne : paiement et cuisine", () => {
  it("commande retenue jusqu'au paiement confirmé, puis envoyée en cuisine ; une redirection ne paie rien", async () => {
    const { store, own, pub, staff } = setup();
    const { dish } = await restaurant(own, { kitchen_after_payment: true });
    await runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() });
    const id = store.data.order[0]!.id;
    expect((store.data.order[0]!.data as FullOrder).held).toBe(true);
    await expect(runOp(staff("employee", COOK), "online.accept", { id })).rejects.toThrow(/Paiement non confirmé/);
    // Mobile money annoncé mais non vérifié : toujours retenue.
    const p = await runOp(staff("employee", WAITER), "payment.add", { target: "order", target_id: id, amount: 4000, method: "mobile_money", reference: "MM123", verified: false, idem: k() });
    expect((store.data.order[0]!.data as FullOrder).held).toBe(true);
    await runOp(staff("employee", WAITER), "payment.confirm", { id: p.id, reference: "MM123" });
    const o = store.data.order[0]!.data as FullOrder;
    expect(o.pay_status).toBe("paye");
    expect(o.held).toBe(false);
    expect(o.sent_at).toBeTruthy();
    expect(publicOrder(store.data.order[0] as Doc<FullOrder>, null).paid).toBe(true);
  });

  it("en démonstration, la confirmation simulée marque la commande payée (fournisseur « demo »)", async () => {
    const { store, own, pub } = setup({ demo: true });
    const { dish } = await restaurant(own, { kitchen_after_payment: true });
    const r = await runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "demo", idem: k() });
    await runOp(pub, "online.demo_pay", { tracking_token: r.secret });
    expect((store.data.payment[0]!.data as Payment).provider).toBe("demo");
    expect((store.data.order[0]!.data as FullOrder).held).toBe(false);
  });

  it("la cuisine accepte et signale un problème ; un serveur sans poste cuisine ne peut pas", async () => {
    const { store, own, pub, staff } = setup();
    const { dish } = await restaurant(own);
    await runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() });
    const id = store.data.order[0]!.id;
    await expect(runOp(staff("employee", WAITER), "online.accept", { id })).rejects.toMatchObject({ status: 403 });
    await runOp(staff("employee", COOK), "online.accept", { id });
    await runOp(staff("employee", COOK), "online.problem", { id, text: "Plat épuisé" });
    const view = publicOrder(store.data.order[0] as Doc<FullOrder>, "4");
    expect(view.steps.acceptee).toBeTruthy();
    expect(view.problem?.text).toBe("Plat épuisé");
    expect(view.paid).toBe(false);
    expect(JSON.stringify(view)).not.toContain(COOK);
    expect(JSON.stringify(view)).not.toContain("tracking_token");
  });

  it("une double validation du panier ne crée qu'une commande", async () => {
    const { store, own, pub } = setup();
    const { dish } = await restaurant(own);
    const key = k();
    const a = await runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: key });
    const b = await runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: key });
    expect(b.duplicate).toBe(true);
    expect(b.secret).toBe(a.secret);
    expect(store.data.order).toHaveLength(1);
  });
});

describe("Restaurant en ligne : statistiques et rapport", () => {
  it("compte scans, visiteurs uniques, plats consultés et commandes sans donnée personnelle", async () => {
    const { store, own, pub } = setup();
    const { dish } = await restaurant(own);
    await runOp(pub, "online.stat", { scan: "menu", visitor: "v1" });
    await runOp(pub, "online.stat", { scan: "menu", visitor: "v1", views: [dish, dish] });
    await runOp(pub, "online.stat", { scan: "table:abc", visitor: "v2" });
    await runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "caisse", idem: k() });
    const s = store.data.qstat[0]!.data as DayStat;
    expect(s.scans).toEqual({ menu: 2, "table:abc": 1 });
    expect(s.visitors).toHaveLength(2);
    expect(s.visitors).not.toContain("v1");
    expect(s.views[dish]).toBe(1);
    expect(s.orders).toBe(1);
    const r = kitchenReport(store.data.order as Doc<FullOrder>[], { from: "2000-01-01", to: "2999-12-31" }, 20);
    expect(r.orders).toBe(1);
    expect(r.qr).toBe(1);
    expect(r.topItems[0]).toEqual({ label: "Poulet braisé", qty: 1 });
  });
});

describe("Restaurant en ligne : apparence du menu", () => {
  const style = { theme: "nuit", accent: "#e11d48", layout: "grille", font: "elegant", animation: "rebond", corners: "ronds" };
  it("le gérant enregistre thème, couleur, disposition, police, animation et couverture", async () => {
    const { store, own } = setup();
    await own("online.style", { ...style, cover: "data:image/jpeg;base64,AAAA" });
    const saved = menuStyle(onlineSettings(store.data.settings[0]!.data as never).style);
    expect(saved).toEqual({ ...style, cover: "data:image/jpeg;base64,AAAA" });
    // Sans « cover », la couverture existante est conservée ; null la retire.
    await own("online.style", { ...style, layout: "cartes" });
    expect(menuStyle(onlineSettings(store.data.settings[0]!.data as never).style)).toMatchObject({ layout: "cartes", cover: "data:image/jpeg;base64,AAAA" });
    await own("online.style", { ...style, cover: null });
    expect(menuStyle(onlineSettings(store.data.settings[0]!.data as never).style).cover).toBeNull();
  });

  it("refuse un thème inconnu, une couleur invalide, et un employé sans droit de paramétrage", async () => {
    const { own, staff, pub } = setup();
    await expect(own("online.style", { ...style, theme: "pirate" })).rejects.toBeTruthy();
    await expect(own("online.style", { ...style, accent: "red; background:url(x)" })).rejects.toBeTruthy();
    await expect(runOp(pub, "online.style", style)).rejects.toBeInstanceOf(OpError);
    await expect(runOp({ ...staff("employee", WAITER), perms: ["caisse"] }, "online.style", style)).rejects.toMatchObject({ status: 403 });
  });

  it("un ancien menu sans réglage garde l'apparence par défaut, avec un texte lisible sur la couleur", () => {
    expect(menuStyle(undefined)).toEqual(DEFAULT_MENU_STYLE);
    expect(menuStyle({ theme: "inconnu", accent: "bleu" })).toMatchObject({ theme: "clair", accent: null });
    expect(onColor("#d4af37")).toBe("#111111");
    expect(onColor("#2563eb")).toBe("#ffffff");
    expect(menuTokens(DEFAULT_MENU_STYLE, "#7c3aed").accent).toBe("#7c3aed");
    // Bleu nuit sur le thème Nuit : boutons invisibles, on garde la couleur du thème.
    expect(menuTokens({ ...DEFAULT_MENU_STYLE, theme: "nuit", accent: "#0f172a" }).accent).toBe("#f59e0b");
    expect(menuTokens({ ...DEFAULT_MENU_STYLE, theme: "nuit", accent: "#e11d48" }).accent).toBe("#e11d48");
  });
});
