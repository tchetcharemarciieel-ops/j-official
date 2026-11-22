import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/shop/memory-store";
import { runOp, type OpContext } from "@/lib/shop/engine";
import { availableOf, dueOf, expectedCash, finance, periodRange, stockOf, type Doc, type Order, type Product, type Register, type Sale } from "@/lib/shop/model";
import type { Permission } from "@/lib/team";

const OWNER = "00000000-0000-4000-8000-0000000000aa";
const ctxOf = (store: MemoryStore, role: OpContext["actor"]["role"] = "owner", perms: Permission[] | null = null, extra: Partial<OpContext> = {}): OpContext => ({ store, actor: { id: role === "owner" ? OWNER : `${role}-1`, role }, perms, ...extra });
const uid = () => crypto.randomUUID();

async function shop() {
  const store = new MemoryStore();
  const o = ctxOf(store);
  await runOp(o, "settings.save", {
    type: "vetements",
    name: "Chez Awa Mode",
    units: ["pièce", "carton"],
    delivery: { enabled: true, fee: 1000, info: "Bangui" },
    pickup: { enabled: true, info: "" },
    online: { published: true, ordering: true, pay_delivery: true, zingopay: false },
    allow_credit: true,
  });
  const robe = await runOp(o, "product.save", { name: "Robe pagne", sell_price: 15000, buy_price: 9000, unit: "pièce", min_qty: 2, initial_stock: 5, barcode: "123456" });
  const tshirt = await runOp(o, "product.save", {
    name: "T-shirt",
    sell_price: 5000,
    buy_price: 2500,
    unit: "pièce",
    variant_attrs: ["Taille", "Couleur"],
    variants: [
      { values: { Taille: "M", Couleur: "Bleu" }, initial: 3 },
      { values: { Taille: "L", Couleur: "Bleu" }, price: 5500, initial: 1 },
    ],
  });
  const reg = await runOp(o, "register.open", { float: 10000 });
  return { store, o, robe: robe.id!, tshirt: tshirt.id!, reg: reg.id! };
}
const prod = async (s: MemoryStore, id: string) => (await s.get("product", id))!.data as unknown as Product;

describe("MiniSoft Shop : produits", () => {
  it("crée un produit avec stock initial, refuse un code-barres en double, modifie sans toucher au stock", async () => {
    const { store, o, robe } = await shop();
    expect((await prod(store, robe)).stock).toBe(5);
    expect(store.data.move.filter((m) => m.data.product_id === robe)).toHaveLength(1);
    await expect(runOp(o, "product.save", { name: "Autre", sell_price: 1, unit: "pièce", barcode: "123456" })).rejects.toThrow(/déjà utilisé/);
    await runOp(o, "product.save", { id: robe, name: "Robe pagne wax", sell_price: 16000, buy_price: 9000, unit: "pièce", barcode: "123456" });
    const p = await prod(store, robe);
    expect(p.name).toBe("Robe pagne wax");
    expect(p.stock).toBe(5);
    await expect(runOp(o, "product.save", { name: "X", sell_price: 1, unit: "litre" })).rejects.toThrow(/Unité/);
  });
  it("variantes : stock par variante, prix propre, suppression interdite si stock", async () => {
    const { store, o, tshirt } = await shop();
    const p = await prod(store, tshirt);
    expect(p.variants.map((v) => v.stock)).toEqual([3, 1]);
    await expect(runOp(o, "product.save", { id: tshirt, name: "T-shirt", sell_price: 5000, unit: "pièce", variant_attrs: ["Taille", "Couleur"], variants: [{ id: p.variants[0]!.id, values: { Taille: "M", Couleur: "Bleu" } }] })).rejects.toThrow(/encore du stock/);
  });
  it("un produit vendu ne se supprime pas : il s'archive", async () => {
    const { o, robe, reg } = await shop();
    await runOp(o, "sale.create", { id: uid(), items: [{ product_id: robe, qty: 1 }], payments: [{ method: "especes", amount: 15000 }], register_id: reg });
    await expect(runOp(o, "product.delete", { id: robe })).rejects.toThrow(/archivez/);
    await runOp(o, "product.archive", { id: robe, archived: true });
  });
});

describe("MiniSoft Shop : caisse et ventes", () => {
  it("vente au prix du produit (jamais celui de l'appareil), stock diminué, monnaie et caisse justes", async () => {
    const { store, o, robe, tshirt, reg } = await shop();
    const p = await prod(store, tshirt);
    const id = uid();
    const r = await runOp(o, "sale.create", { id, items: [{ product_id: robe, qty: 2, unit_price: 1 }, { product_id: tshirt, variant_id: p.variants[1]!.id, qty: 1 }], payments: [{ method: "especes", amount: 35500 }], register_id: reg });
    expect(r.number).toMatch(/^V-\d{4}-0001$/);
    const sale = (await store.get("sale", id))!.data as unknown as Sale;
    expect(sale.total).toBe(35500);
    expect((await prod(store, robe)).stock).toBe(3);
    expect(stockOf(await prod(store, tshirt), p.variants[1]!.id)).toBe(0);
    const regDoc = (await store.get("register", reg)) as Doc<Register>;
    expect(expectedCash(regDoc, store.data.sale as Doc<Sale>[])).toBe(45500);
    await runOp(o, "register.move", { register_id: reg, type: "sortie", amount: 2000, reason: "Transport" });
    const close = await runOp(o, "register.close", { register_id: reg, counted: 43000 });
    expect(close.message).toMatch(/écart de -500/);
  });
  it("même vente envoyée deux fois (réseau coupé) : enregistrée une seule fois, stock déduit une seule fois", async () => {
    const { store, o, robe, reg } = await shop();
    const id = uid();
    const body = { id, items: [{ product_id: robe, qty: 1 }], payments: [{ method: "especes", amount: 15000 }], register_id: reg };
    await runOp(o, "sale.create", body);
    const again = await runOp(o, "sale.create", body);
    expect(again.duplicate).toBe(true);
    expect(store.data.sale).toHaveLength(1);
    expect((await prod(store, robe)).stock).toBe(4);
  });
  it("deux ventes simultanées sur la dernière unité : une seule passe", async () => {
    const { store, o, tshirt, reg } = await shop();
    const v = (await prod(store, tshirt)).variants[1]!.id;
    const one = () => runOp(o, "sale.create", { id: uid(), items: [{ product_id: tshirt, variant_id: v, qty: 1 }], payments: [{ method: "especes", amount: 5500 }], register_id: reg });
    const res = await Promise.allSettled([one(), one()]);
    expect(res.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(stockOf(await prod(store, tshirt), v)).toBe(0);
    expect(store.data.sale).toHaveLength(1);
  });
  it("refuse stock insuffisant, paiement supérieur au total, espèces sans caisse ouverte", async () => {
    const { o, robe, reg } = await shop();
    await expect(runOp(o, "sale.create", { id: uid(), items: [{ product_id: robe, qty: 9 }], payments: [], register_id: reg })).rejects.toThrow(/Stock insuffisant/);
    await expect(runOp(o, "sale.create", { id: uid(), items: [{ product_id: robe, qty: 1 }], payments: [{ method: "especes", amount: 20000 }], register_id: reg })).rejects.toThrow(/dépassent/);
    await expect(runOp(o, "sale.create", { id: uid(), items: [{ product_id: robe, qty: 1 }], payments: [{ method: "especes", amount: 15000 }] })).rejects.toThrow(/Ouvrez la caisse/);
  });
  it("paiement partiel : client obligatoire, reste dû, puis règlement", async () => {
    const { store, o, robe, reg } = await shop();
    await expect(runOp(o, "sale.create", { id: uid(), items: [{ product_id: robe, qty: 1 }], payments: [{ method: "mobile_money", amount: 5000, ref: "MM1" }] })).rejects.toThrow(/indiquez le client/);
    const id = uid();
    await runOp(o, "sale.create", { id, items: [{ product_id: robe, qty: 1 }], payments: [{ method: "mobile_money", amount: 5000, ref: "MM1" }], customer: { name: "Mme Yakité", phone: "+236 72 00 00 00" } });
    let s = (await store.get("sale", id))!.data as unknown as Sale;
    expect(dueOf(s)).toBe(10000);
    await runOp(o, "sale.pay", { sale_id: id, method: "especes", amount: 10000, register_id: reg });
    s = (await store.get("sale", id))!.data as unknown as Sale;
    expect(dueOf(s)).toBe(0);
    expect(store.data.customer).toHaveLength(1);
  });
  it("retour : remise en stock, remboursement, chiffre d'affaires corrigé ; annulation : vente conservée", async () => {
    const { store, o, robe, reg } = await shop();
    const id = uid();
    await runOp(o, "sale.create", { id, items: [{ product_id: robe, qty: 2 }], payments: [{ method: "especes", amount: 30000 }], register_id: reg });
    const r = await runOp(o, "sale.return", { sale_id: id, lines: [{ index: 0, qty: 1 }], method: "especes", reason: "Taille", register_id: reg, op_key: "retour-0001" });
    expect(r.message).toMatch(/15 000|15 000|15000/);
    expect((await prod(store, robe)).stock).toBe(4);
    await expect(runOp(o, "sale.return", { sale_id: id, lines: [{ index: 0, qty: 2 }], method: "especes", reason: "x", register_id: reg, op_key: "retour-0002" })).rejects.toThrow(/que 1/);
    const f = finance(store.data.sale as Doc<Sale>[], [], periodRange("today"));
    expect(f.revenue).toBe(15000);
    expect(f.gross).toBe(15000 - 9000);
    const id2 = uid();
    await runOp(o, "sale.create", { id: id2, items: [{ product_id: robe, qty: 1 }], payments: [{ method: "especes", amount: 15000 }], register_id: reg });
    await runOp(o, "sale.cancel", { sale_id: id2, reason: "Erreur de saisie", register_id: reg });
    expect(((await store.get("sale", id2))!.data as unknown as Sale).status).toBe("annulee");
    expect((await prod(store, robe)).stock).toBe(4);
    expect(store.data.sale).toHaveLength(2);
  });
  it("hors connexion : vente synchronisée même si le stock a manqué, conflit signalé", async () => {
    const { store, o, robe } = await shop();
    const id = uid();
    await runOp(o, "sale.create", { id, items: [{ product_id: robe, qty: 7 }], payments: [{ method: "especes", amount: 105000 }], register_id: null, offline_at: new Date().toISOString() });
    const s = (await store.get("sale", id))!.data as unknown as Sale;
    expect(s.conflict).toMatch(/stock insuffisant/);
    expect((await prod(store, robe)).stock).toBe(-2);
  });
});

describe("MiniSoft Shop : stock et achats", () => {
  it("entrée, perte, inventaire, mouvements tracés, clé d'opération unique", async () => {
    const { store, o, robe } = await shop();
    await runOp(o, "stock.move", { product_id: robe, type: "entree", qty: 10, unit_cost: 8500, op_key: "entree-0001" });
    const dup = await runOp(o, "stock.move", { product_id: robe, type: "entree", qty: 10, unit_cost: 8500, op_key: "entree-0001" });
    expect(dup.duplicate).toBe(true);
    expect((await prod(store, robe)).stock).toBe(15);
    expect((await prod(store, robe)).buy_price).toBe(8500);
    await runOp(o, "stock.move", { product_id: robe, type: "perte", qty: 1, reason: "Tache", op_key: "perte-0001" });
    await runOp(o, "stock.inventory", { counts: [{ product_id: robe, counted: 12 }], op_key: "inv-00001" });
    expect((await prod(store, robe)).stock).toBe(12);
    expect(store.data.move.map((m) => m.data.type)).toEqual(expect.arrayContaining(["entree", "perte", "inventaire"]));
  });
  it("bon de commande : réception partielle puis totale, stock et dette fournisseur", async () => {
    const { store, o, robe } = await shop();
    const sup = await runOp(o, "supplier.save", { name: "Grossiste Dubaï" });
    const po = await runOp(o, "po.save", { supplier_id: sup.id, items: [{ product_id: robe, qty: 10, cost: 8000 }] });
    await runOp(o, "po.status", { id: po.id, to: "commandee" });
    await runOp(o, "po.receive", { id: po.id, lines: [{ index: 0, qty: 4 }], op_key: "rec-000001" });
    await runOp(o, "po.receive", { id: po.id, lines: [{ index: 0, qty: 4 }], op_key: "rec-000001" });
    expect((await prod(store, robe)).stock).toBe(9);
    await runOp(o, "po.receive", { id: po.id, lines: [{ index: 0, qty: 6 }], op_key: "rec-000002" });
    expect((await prod(store, robe)).stock).toBe(15);
    expect(((await store.get("po", po.id!))!.data as { status: string }).status).toBe("recue");
    await expect(runOp(o, "po.pay", { id: po.id, amount: 90000 })).rejects.toThrow(/80 000|80 000|80000/);
  });
});

describe("MiniSoft Shop : boutique en ligne", () => {
  const pub = (store: MemoryStore, now?: () => Date) => ctxOf(store, "employee", null, { public: true, now });
  const order = (robe: string, extra = {}) => ({ id: uid(), items: [{ product_id: robe, qty: 2 }], customer: { name: "Jean", phone: "+236 75 11 22 33", address: "PK5" }, mode: "livraison", pay_mode: "livraison", ...extra });

  it("commande : stock réservé (pas vendable en caisse), confirmée, livrée → vente et stock déduit", async () => {
    const { store, o, robe, reg } = await shop();
    const r = await runOp(pub(store), "public.order", order(robe));
    expect(r.number).toMatch(/^CMD-/);
    expect(r.token).toHaveLength(18);
    let p = await prod(store, robe);
    expect(p.stock).toBe(5);
    expect(availableOf(p, null)).toBe(3);
    await expect(runOp(o, "sale.create", { id: uid(), items: [{ product_id: robe, qty: 4 }], payments: [], register_id: reg })).rejects.toThrow(/Stock insuffisant/);
    const ord = (await store.get("order", r.id!))!.data as unknown as Order;
    expect(ord.total).toBe(31000);
    expect(ord.status).toBe("attente");
    await runOp(o, "order.status", { id: r.id, to: "confirmee" });
    await runOp(o, "order.status", { id: r.id, to: "prete" });
    await runOp(o, "order.status", { id: r.id, to: "livraison" });
    await runOp(o, "order.status", { id: r.id, to: "livree" });
    // Livrée mais l'argent n'est pas encore encaissé : la vente reste à encaisser.
    expect(dueOf(store.data.sale[0]!.data as unknown as Sale)).toBe(31000);
    await runOp(o, "order.collect", { id: r.id, method: "especes", register_id: reg });
    expect(dueOf(store.data.sale[0]!.data as unknown as Sale)).toBe(0);
    expect(((await store.get("order", r.id!))!.data as unknown as Order).pay_status).toBe("paye");
    p = await prod(store, robe);
    expect(p.stock).toBe(3);
    expect(p.reservations).toHaveLength(0);
    const sale = store.data.sale[0]!.data as unknown as Sale;
    expect(sale.channel).toBe("en_ligne");
    expect(sale.total).toBe(31000);
    await expect(runOp(o, "order.status", { id: r.id, to: "preparation" })).rejects.toThrow(/Impossible/);
  });
  it("réservation expirée : le stock redevient vendable ; annulation : réservation levée", async () => {
    const { store, o, robe } = await shop();
    const t0 = Date.now();
    await runOp(pub(store, () => new Date(t0)), "public.order", order(robe));
    expect(availableOf(await prod(store, robe), null, t0)).toBe(3);
    expect(availableOf(await prod(store, robe), null, t0 + 3 * 3600_000)).toBe(5);
    const r2 = await runOp(pub(store), "public.order", order(robe));
    await runOp(o, "order.status", { id: r2.id, to: "annulee", note: "Produit épuisé" });
    expect((await prod(store, robe)).reservations.some((x) => x.key === r2.id)).toBe(false);
  });
  it("refuse : boutique non publiée, produit masqué, trop de quantité, moyen de paiement non proposé", async () => {
    const { store, o, robe } = await shop();
    await expect(runOp(pub(store), "public.order", order(robe, { items: [{ product_id: robe, qty: 6 }] }))).rejects.toThrow(/Stock insuffisant/);
    await expect(runOp(pub(store), "public.order", order(robe, { pay_mode: "zingopay" }))).rejects.toThrow(/moyen de paiement/);
    await runOp(o, "product.save", { id: robe, name: "Robe pagne", sell_price: 15000, unit: "pièce", online: false, barcode: "123456" });
    await expect(runOp(pub(store), "public.order", order(robe))).rejects.toThrow(/plus disponible/);
    // Une opération interne de la boutique n'est jamais accessible depuis la vitrine publique.
    await expect(runOp(pub(store), "stock.move", { product_id: robe, type: "entree", qty: 1, op_key: "pirate-001" })).rejects.toThrow(/non autorisée/);
  });
  it("ZingoPay : commande en attente tant que ZingoPay ne confirme pas ; confirmée seulement par l'opération interne", async () => {
    const { store, o, robe } = await shop();
    await runOp(o, "settings.save", { type: "vetements", name: "Chez Awa Mode", units: ["pièce"], delivery: { enabled: true, fee: 0, info: "" }, pickup: { enabled: true, info: "" }, online: { published: true, ordering: true, pay_delivery: true, zingopay: true } });
    const r = await runOp(ctxOf(store, "employee", null, { public: true, zingopay: true }), "public.order", order(robe, { pay_mode: "zingopay" }));
    await expect(runOp(o, "order.status", { id: r.id, to: "confirmee" })).rejects.toThrow(/n'est pas confirmé par ZingoPay/);
    await runOp(ctxOf(store, "employee", null, { internal: "zingopay" }), "order.zp_paid", { order_id: r.id, payment_id: "zp_1" });
    const ord = (await store.get("order", r.id!))!.data as unknown as Order;
    expect(ord.pay_status).toBe("paye");
    expect(ord.status).toBe("attente");
    expect(ord.payments).toHaveLength(1);
    expect(ord.payments![0]).toMatchObject({ method: "zingopay", verified: true, amount: 15000 * 2 });
  });
});

describe("MiniSoft Shop : permissions", () => {
  it("caissier : vend, mais ne touche ni au stock ni aux remises ; magasinier : stock mais pas la caisse ; lecteur : rien", async () => {
    const { store, robe } = await shop();
    const cashier = ctxOf(store, "employee", ["caisse", "clients", "commandes"]);
    const keeper = ctxOf(store, "employee", ["stock", "achats"]);
    const reg = await runOp(cashier, "register.open", { float: 0 });
    await runOp(cashier, "sale.create", { id: uid(), items: [{ product_id: robe, qty: 1 }], payments: [{ method: "especes", amount: 15000 }], register_id: reg.id });
    await expect(runOp(cashier, "sale.create", { id: uid(), items: [{ product_id: robe, qty: 1, discount: 1000 }], payments: [], register_id: reg.id })).rejects.toThrow(/remises/i);
    await expect(runOp(cashier, "stock.move", { product_id: robe, type: "entree", qty: 1, op_key: "c-000001" })).rejects.toThrow(/poste/);
    await runOp(keeper, "stock.move", { product_id: robe, type: "entree", qty: 1, op_key: "k-000001" });
    await expect(runOp(keeper, "register.open", { float: 0 })).rejects.toThrow(/poste/);
    await expect(runOp(keeper, "expense.save", { amount: 1, category: "transport", date: "2026-11-21" })).rejects.toThrow(/poste/);
    await expect(runOp(ctxOf(store, "viewer"), "customer.save", { name: "X" })).rejects.toThrow(/lecture seule/);
    // Employé sans poste : pas d'annulation de vente ni de réglages (réservés aux responsables).
    await expect(runOp(ctxOf(store, "employee", null), "settings.save", { type: "autre", name: "X", units: ["pièce"], delivery: { enabled: false, fee: 0, info: "" }, pickup: { enabled: true, info: "" }, online: { published: false, ordering: false, pay_delivery: false, pay_pickup: false, zingopay: false } })).rejects.toThrow(/responsable/);
  });
  it("deux boutiques ne partagent rien", async () => {
    const a = await shop();
    const b = await shop();
    await runOp(a.o, "sale.create", { id: uid(), items: [{ product_id: a.robe, qty: 1 }], payments: [{ method: "especes", amount: 15000 }], register_id: a.reg });
    expect(b.store.data.sale).toHaveLength(0);
    await expect(runOp(b.o, "sale.create", { id: uid(), items: [{ product_id: a.robe, qty: 1 }], payments: [], register_id: b.reg })).rejects.toThrow(/introuvable/);
  });
});

describe("MiniSoft Shop : facture PDF", () => {
  it("génère un vrai fichier PDF avec le numéro, les articles et le total", async () => {
    const { store, o, robe, reg } = await shop();
    const id = uid();
    await runOp(o, "sale.create", { id, items: [{ product_id: robe, qty: 2 }], payments: [{ method: "especes", amount: 30000 }], register_id: reg, customer: { name: "Mme Yakité", phone: "+236 72 00 00 00" } });
    const inv = await runOp(o, "sale.invoice", { sale_id: id });
    expect(inv.number).toMatch(/^F-\d{4}-0001$/);
    expect((await runOp(o, "sale.invoice", { sale_id: id })).number).toBe(inv.number);
    const { invoicePdf } = await import("@/lib/shop/pdf");
    const { settingsOf } = await import("@/lib/shop/model");
    const sale = (await store.get("sale", id))!.data as unknown as Sale;
    const pdf = invoicePdf(sale, settingsOf(store.data.settings[0]), { name: "Mme Yakité", phone: "+236 72 00 00 00", address: "" });
    const text = pdf.toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toContain("FACTURE");
    expect(text).toContain(inv.number!);
    expect(text).toContain("Robe pagne");
    expect(text).toMatch(/30\s000 FCFA/);
    // Table de références croisées cohérente : chaque décalage pointe sur « n 0 obj ».
    const xref = text.slice(text.lastIndexOf("xref\n"));
    const offs = [...xref.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    offs.forEach((off, i) => expect(text.slice(off, off + 12)).toContain(`${i + 1} 0 obj`));
  });
});

describe("MiniSoft Shop : intégration à MiniSoft RCA", () => {
  it("la spécification d'une boutique passe tous les tests de publication et se valide", async () => {
    const { shopSpec } = await import("@/lib/shop/spec");
    const { runChecks, summarize } = await import("@/lib/checks");
    const { parseSpec } = await import("@/lib/spec");
    const spec = shopSpec("Chez Awa Mode", "vetements");
    expect(parseSpec(spec).ok).toBe(true);
    expect(summarize(runChecks(spec)).failed).toBe(0);
    expect(spec.module).toBe("shop");
  });
  it("le secteur « shop » a ses postes (caissier, magasinier, vendeur) et ses permissions", async () => {
    const { sectorOf, positionsFor, SECTOR_PERMISSIONS } = await import("@/lib/team");
    expect(sectorOf("boutique", "shop")).toBe("shop");
    expect(sectorOf("boutique")).toBe("autre");
    expect(positionsFor("shop").map((p) => p.key)).toEqual(expect.arrayContaining(["caissier", "magasinier", "vendeur", "responsable", "administrateur"]));
    expect(SECTOR_PERMISSIONS.shop).toContain("caisse");
  });
});


describe("MiniSoft Shop : deux moyens de paiement (livraison, ZingoPay)", () => {
  const pub = (store: MemoryStore, zingopay = false) => ctxOf(store, "employee", null, { public: true, zingopay });
  const ord = (robe: string, extra = {}) => ({ id: uid(), items: [{ product_id: robe, qty: 1 }], customer: { name: "Jean", phone: "+236 75 11 22 33", address: "PK5" }, mode: "livraison", pay_mode: "livraison", ...extra });

  it("paiement à la livraison : commande « en attente de confirmation », rien d'encaissé tant que le commerçant ne confirme pas avoir reçu l'argent", async () => {
    const { store, o, robe, reg } = await shop();
    const r = await runOp(pub(store), "public.order", ord(robe));
    let od = (await store.get("order", r.id!))!.data as unknown as Order;
    expect(od.status).toBe("attente");
    expect(od.pay_status).toBe("en_attente");
    expect(od.payments).toEqual([]);
    // Pas d'encaissement avant confirmation de la commande.
    await expect(runOp(o, "order.collect", { id: r.id, method: "especes", register_id: reg })).rejects.toThrow(/Confirmez d'abord/);
    await runOp(o, "order.status", { id: r.id, to: "confirmee" });
    await runOp(o, "order.status", { id: r.id, to: "prete" });
    await runOp(o, "order.status", { id: r.id, to: "livraison" });
    // Espèces : caisse ouverte obligatoire.
    await expect(runOp(o, "order.collect", { id: r.id, method: "especes" })).rejects.toThrow(/Ouvrez la caisse/);
    await runOp(o, "order.collect", { id: r.id, method: "especes", register_id: reg });
    od = (await store.get("order", r.id!))!.data as unknown as Order;
    expect(od.pay_status).toBe("paye");
    expect(od.payments).toHaveLength(1);
    expect(((await runOp(o, "order.collect", { id: r.id, method: "especes", register_id: reg })).duplicate)).toBe(true);
    expect(od.payments).toHaveLength(1);
    await runOp(o, "order.status", { id: r.id, to: "livree" });
    const sale = store.data.sale[0]!.data as unknown as Sale;
    expect(sale.payments).toHaveLength(1);
    expect(dueOf(sale)).toBe(0);
    // Les espèces comptent dans la caisse.
    expect(expectedCash((await store.get("register", reg)) as Doc<Register>, store.data.sale as Doc<Sale>[])).toBe(10000 + 16000);
  });
  it("refus : motif obligatoire, stock libéré, commande conservée dans l'historique", async () => {
    const { store, o, robe } = await shop();
    const r = await runOp(pub(store), "public.order", ord(robe));
    await expect(runOp(o, "order.status", { id: r.id, to: "annulee" })).rejects.toThrow(/motif du refus/);
    await runOp(o, "order.status", { id: r.id, to: "annulee", note: "Hors zone de livraison" });
    const od = (await store.get("order", r.id!))!.data as unknown as Order;
    expect(od.status).toBe("annulee");
    expect(od.history.at(-1)!.note).toBe("Hors zone de livraison");
    expect((await prod(store, robe)).reservations).toHaveLength(0);
    expect(store.data.order).toHaveLength(1);
  });
  it("ZingoPay : échec → paiement « non confirmé » mais commande conservée ; payée puis refusée → « à rembourser »", async () => {
    const { store, o, robe } = await shop();
    await runOp(o, "settings.save", { type: "vetements", name: "Chez Awa Mode", units: ["pièce"], delivery: { enabled: true, fee: 0, info: "" }, pickup: { enabled: true, info: "" }, online: { published: true, ordering: true, pay_delivery: true, zingopay: true } });
    const r = await runOp(pub(store, true), "public.order", ord(robe, { pay_mode: "zingopay" }));
    const internal = ctxOf(store, "employee", null, { internal: "zingopay" });
    await runOp(internal, "order.zp_failed", { order_id: r.id, reason: "le lien de paiement a expiré", status: "expired" });
    let od = (await store.get("order", r.id!))!.data as unknown as Order;
    expect(od.pay_status).toBe("non_confirme");
    expect(od.status).toBe("attente");
    expect(od.payments).toEqual([]);
    await expect(runOp(o, "order.collect", { id: r.id, method: "especes" })).rejects.toThrow(/ZingoPay/);
    // Nouvel essai (lien recréé) puis paiement confirmé par ZingoPay.
    await runOp(internal, "order.zp_attach", { order_id: r.id, zp: { id: "zp_2", pay_url: "https://pay.example/x", status: "pending", expires_at: null } });
    expect(((await store.get("order", r.id!))!.data as unknown as Order).pay_status).toBe("en_attente");
    await runOp(internal, "order.zp_paid", { order_id: r.id, payment_id: "zp_2" });
    await runOp(o, "order.status", { id: r.id, to: "annulee", note: "Produit abîmé" });
    od = (await store.get("order", r.id!))!.data as unknown as Order;
    expect(od.pay_status).toBe("a_rembourser");
    await runOp(o, "order.refund_done", { id: r.id, note: "Remboursé via ZingoPay" });
    expect(((await store.get("order", r.id!))!.data as unknown as Order).pay_status).toBe("rembourse");
  });
  it("exactement deux moyens : « retrait » n'existe plus, ZingoPay refusé s'il n'est pas activé, au moins un moyen requis", async () => {
    const { store, o, robe } = await shop();
    await expect(runOp(pub(store), "public.order", ord(robe, { pay_mode: "retrait" }))).rejects.toThrow();
    await expect(runOp(pub(store), "public.order", ord(robe, { pay_mode: "zingopay" }))).rejects.toThrow(/moyen de paiement/);
    await expect(runOp(o, "settings.save", { type: "vetements", name: "X", units: ["pièce"], delivery: { enabled: true, fee: 0, info: "" }, pickup: { enabled: true, info: "" }, online: { published: true, ordering: true, pay_delivery: false, zingopay: false } })).rejects.toThrow(/moyen de paiement/);
    // Retrait en boutique : le paiement à la livraison s'applique à la remise.
    const r = await runOp(pub(store), "public.order", ord(robe, { mode: "retrait", pay_mode: "livraison" }));
    expect(((await store.get("order", r.id!))!.data as unknown as Order).mode).toBe("retrait");
  });
});
