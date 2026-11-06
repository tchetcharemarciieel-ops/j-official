import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({}) }));
import { keyHint, orderReference, parseReference, seal, unseal, validSignature } from "@/lib/zingopay";
import { OpError, runOp, type OpContext } from "@/lib/venue/engine";
import { MemoryStore } from "@/lib/venue/memory-store";
import type { Doc, Payment } from "@/lib/venue/model";
import type { FullOrder } from "@/lib/venue/online";

process.env.PAYMENT_SECRETS_KEY = "cle-de-test-uniquement";
const OWNER = "00000000-0000-4000-8000-0000000000aa";

describe("ZingoPay : signature, référence et chiffrement des clés", () => {
  const secret = "whsec_test";
  const body = '{"type":"payment.paid","data":{"id":"p1"}}';
  const sign = (t: number, b = body, s = secret) => `t=${t},v1=${createHmac("sha256", s).update(`${t}.${b}`).digest("hex")}`;
  const now = Date.parse("2026-11-06T20:00:00Z");
  const t = Math.floor(now / 1000);

  it("accepte une signature valide et refuse un corps modifié, un mauvais secret ou une signature trop ancienne", () => {
    expect(validSignature(body, sign(t), secret, now)).toBe(true);
    expect(validSignature(body.replace("p1", "p2"), sign(t), secret, now)).toBe(false);
    expect(validSignature(body, sign(t, body, "autre"), secret, now)).toBe(false);
    expect(validSignature(body, sign(t - 301), secret, now)).toBe(false);
    expect(validSignature(body, null, secret, now)).toBe(false);
    expect(validSignature(body, "n'importe quoi", secret, now)).toBe(false);
  });

  it("la référence relie le paiement à la commande et au bon jeu de données", () => {
    const id = "0b9c1c0e-5d5e-4a39-9a7c-3f1c2b7d9e11";
    expect(parseReference(orderReference(id, false))).toEqual({ orderId: id, demo: false });
    expect(parseReference(orderReference(id, true))).toEqual({ orderId: id, demo: true });
    expect(parseReference(null)).toBeNull();
    expect(parseReference("CMD-2041")).toBeNull();
  });

  it("la clé est chiffrée (jamais en clair) et seul un aperçu court est affiché", () => {
    const key = "zp_test_E9HWhqFXxjBwgX7ZcU1Ql_exemple";
    const s = seal(key);
    expect(s).not.toContain("E9HW");
    expect(unseal(s)).toBe(key);
    expect(unseal(s.slice(0, -4) + "AAAA")).toBeNull();
    expect(keyHint(key)).toBe("zp_test_…mple");
  });
});

describe("ZingoPay : commande du menu", () => {
  async function setup(zingopay: boolean) {
    const store = new MemoryStore();
    const own = (op: string, input: unknown) => runOp({ store, actor: { id: OWNER, role: "owner" }, members: [OWNER], kind: "restaurant" }, op, input);
    await own("online.settings", { published: true, ordering: true, pay_counter: true, kitchen_after_payment: true, welcome: "" });
    const dish = (await own("menu.save", { name: "Poulet crispy", category: "plat", price: 10000 })).id!;
    const pub: OpContext = { store, actor: { id: OWNER, role: "employee" }, members: [], kind: "restaurant", public: true, zingopay };
    return { store, own, pub, dish };
  }

  it("refuse ZingoPay si le restaurant ne l'a pas activé", async () => {
    const { pub, dish } = await setup(false);
    await expect(runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 1 }], pay: "zingopay", idem: crypto.randomUUID() })).rejects.toMatchObject({ status: 409 });
  });

  it("seul le serveur, après vérification, marque la commande payée ; le montant doit être exact", async () => {
    const { store, own, pub, dish } = await setup(true);
    const r = await runOp(pub, "online.order", { lines: [{ menu_id: dish, qty: 2 }], pay: "zingopay", idem: crypto.randomUUID() });
    const order = () => store.data.order.find((x) => x.id === r.id)! as Doc<FullOrder>;
    expect(order().data).toMatchObject({ pay_mode: "zingopay", held: true, total: 20000, pay_status: "non_paye" });
    const internal: OpContext = { ...pub, internal: "zingopay" };
    // Ni le client du menu, ni un membre de l'équipe ne peuvent appeler les opérations internes.
    await expect(runOp(pub, "online.zp_attach", { order_id: r.id, zp: { id: "p1", pay_url: "https://aletchcard.site/payer/ABCDEFGHIJ", status: "pending", expires_at: null, mode: "test" } })).rejects.toBeInstanceOf(OpError);
    await expect(own("online.zp_paid", { order_id: r.id, payment_id: "p1", amount: 20000, receipt: null, paid_at: null })).rejects.toBeInstanceOf(OpError);
    await runOp(internal, "online.zp_attach", { order_id: r.id, zp: { id: "p1", pay_url: "https://aletchcard.site/payer/ABCDEFGHIJ", status: "pending", expires_at: null, mode: "test" } });
    await expect(runOp(internal, "online.zp_paid", { order_id: r.id, payment_id: "p1", amount: 5000, receipt: null, paid_at: null })).rejects.toMatchObject({ status: 409 });
    await expect(runOp(internal, "online.zp_paid", { order_id: r.id, payment_id: "autre", amount: 20000, receipt: null, paid_at: null })).rejects.toMatchObject({ status: 409 });
    expect(order().data.pay_status).toBe("non_paye");
    await runOp(internal, "online.zp_paid", { order_id: r.id, payment_id: "p1", amount: 20000, receipt: "ZP-123", paid_at: null });
    await runOp(internal, "online.zp_paid", { order_id: r.id, payment_id: "p1", amount: 20000, receipt: "ZP-123", paid_at: null });
    expect(order().data).toMatchObject({ pay_status: "paye", paid: 20000, held: false });
    const pays = store.data.payment.filter((p) => (p.data as Payment).target_id === r.id);
    expect(pays).toHaveLength(1);
    expect(pays[0]!.data).toMatchObject({ provider: "zingopay", status: "confirme", amount: 20000 });
  });
});
