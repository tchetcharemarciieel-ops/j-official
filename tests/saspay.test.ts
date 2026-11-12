import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mini base en mémoire, avec la même interface chaînée que le client Supabase (sous-ensemble utilisé).
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
function q(table: string) {
  const rows = () => (tables[table] ??= []);
  const filters: ((r: Row) => boolean)[] = [];
  let op: { kind: "select" } | { kind: "update"; patch: Row } | { kind: "insert"; row: Row } = { kind: "select" };
  let returning = false;
  let lim = Infinity;
  const run = () => {
    if (op.kind === "insert") {
      const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...op.row };
      rows().push(row);
      return [row];
    }
    const hit = rows().filter((r) => filters.every((f) => f(r)));
    if (op.kind === "update") {
      for (const r of hit) Object.assign(r, (op as { patch: Row }).patch);
      return returning ? hit : null;
    }
    return hit.slice(0, lim);
  };
  const b: Record<string, unknown> = {
    select: () => ((returning = true), b),
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    in: (k: string, v: unknown[]) => (filters.push((r) => v.includes(r[k])), b),
    order: () => b,
    limit: (n: number) => ((lim = n), b),
    update: (patch: Row) => ((op = { kind: "update", patch }), b),
    insert: (row: Row) => ((op = { kind: "insert", row }), b),
    maybeSingle: async () => ({ data: run()?.[0] ?? null }),
    single: async () => ({ data: run()?.[0] ?? null }),
    then: (res: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
  };
  return b;
}
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ from: (t: string) => q(t) }) }));
vi.mock("@/lib/config", async (orig) => ({ ...(await orig<object>()), serverConfigured: () => true }));

const { validSasSignature, sasAmount } = await import("@/lib/saspay");
const { reconcilePayment, startPlanCheckout } = await import("@/lib/billing");

const USER = "00000000-0000-4000-8000-0000000000aa";
const PLANS = [
  { id: "decouverte", name: "Découverte", price_xaf: 0, monthly_credits: 20, max_projects: 1, max_members: 200, can_publish: false, ai_modifications: true, description: "", sort: 1, active: true },
  { id: "pro", name: "Pro", price_xaf: 15000, monthly_credits: 200, max_projects: 5, max_members: 200, can_publish: true, ai_modifications: true, description: "", sort: 2, active: true },
];

/** Réponses SasPay simulées (format de la documentation : enveloppe { success, data, code }). */
let api: Record<string, unknown> = {};
const calls: { url: string; method: string; body?: unknown; auth?: string }[] = [];
beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.plans = PLANS.map((p) => ({ ...p }));
  tables.profiles = [{ id: USER, email: "client@example.com", full_name: "Client", plan: "decouverte", credits: 3 }];
  calls.length = 0;
  api = {};
  process.env.SASPAY_SECRET_KEY = "sk_test_cle_de_test_uniquement";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    const path = url.replace("https://api.saspay.me/api/v1", "");
    calls.push({ url: path, method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as Record<string, string>).authorization });
    const key = `${init.method ?? "GET"} ${path}`;
    if (!(key in api)) return new Response(JSON.stringify({ success: false, error: { message: "Introuvable", code: "not_found" }, code: 404 }), { status: 404 });
    return new Response(JSON.stringify({ success: true, data: api[key], code: 200 }), { status: 200 });
  });
});

const pending = (over: Row = {}) => {
  const row = { id: crypto.randomUUID(), user_id: USER, plan_id: "pro", provider: "saspay", provider_ref: "sess-1", amount_xaf: 15000, status: "pending", created_at: new Date().toISOString(), details: { checkout_url: "https://pay.saspay.me/checkout/x" }, ...over };
  (tables.payments ??= []).push(row);
  return row as unknown as Parameters<typeof reconcilePayment>[0];
};
const paidSession = { id: "sess-1", status: "PAID", transaction_id: "tx-1", transaction_status: "SUCCESS" };
const tx = (over: Row = {}) => ({ id: "tx-1", reference: "TXN-1", status: "SUCCESS", requested_amount: "15000.00", net_amount: "15000.00", currency: "XAF", flow_direction: "INBOUND", ...over });

describe("SasPay : signature des notifications", () => {
  const secret = "whsec_test";
  const body = '{"event":"transaction.success","data":{"id":"tx-1"}}';
  const now = Date.parse("2026-11-12T18:00:00Z");
  const t = String(Math.floor(now / 1000));
  const sign = (ts = t, b = body, s = secret) => createHmac("sha256", s).update(`${ts}.${b}`).digest("hex");
  it("accepte une signature valide et récente", () => expect(validSasSignature(body, sign(), t, secret, now)).toBe(true));
  it("refuse un corps modifié, un autre secret, un horodatage trop vieux", () => {
    expect(validSasSignature(body.replace("tx-1", "tx-2"), sign(), t, secret, now)).toBe(false);
    expect(validSasSignature(body, sign(t, body, "autre"), t, secret, now)).toBe(false);
    expect(validSasSignature(body, sign(t), t, secret, now + 301_000)).toBe(false);
    expect(validSasSignature(body, null, t, secret, now)).toBe(false);
  });
  it("lit les montants décimaux", () => expect(sasAmount("15000.00")).toBe(15000));
});

describe("SasPay : activation de la formule", () => {
  it("crée la session au nom du client, en XAF, avec la clé du serveur", async () => {
    api["POST /checkout-sessions/"] = { id: "sess-1", checkout_url: "https://pay.saspay.me/checkout/x", amount: "15000.00", currency: "XAF", status: "PENDING" };
    const url = await startPlanCheckout({ id: USER, email: "client@example.com", full_name: "Client" }, "pro", "https://minisoft-rca.onrender.com");
    expect(url).toBe("https://pay.saspay.me/checkout/x");
    expect(calls[0]!.auth).toBe("Bearer sk_test_cle_de_test_uniquement");
    expect(calls[0]!.body).toMatchObject({ amount: "15000.00", currency: "XAF", customer_email: "client@example.com", metadata: { user_id: USER, plan_id: "pro" }, return_url: "https://minisoft-rca.onrender.com/espace/abonnement?paiement=retour" });
    expect(tables.payments).toHaveLength(1);
    expect(tables.payments![0]).toMatchObject({ provider_ref: "sess-1", status: "pending", amount_xaf: 15000, user_id: USER });
  });

  it("active Pro seulement après vérification SUCCESS chez SasPay", async () => {
    const p = pending();
    api["GET /checkout-sessions/sess-1/status/"] = paidSession;
    api["GET /payments/tx-1/verify/"] = tx();
    expect(await reconcilePayment(p)).toBe("succeeded");
    expect(tables.profiles![0]).toMatchObject({ plan: "pro", credits: 200 });
    expect(tables.payments![0]!.status).toBe("succeeded");
    expect(tables.subscriptions).toHaveLength(1);
    expect(tables.notifications?.some((n) => n.user_id === USER)).toBe(true);
    // Deuxième vérification (notification + retour du client) : aucune double activation.
    expect(await reconcilePayment({ ...p, status: "pending" })).toBe("succeeded");
    expect(tables.subscriptions).toHaveLength(1);
  });

  it("n'active rien si le montant, la devise ou le statut ne correspondent pas", async () => {
    for (const bad of [tx({ requested_amount: "100.00" }), tx({ currency: "XOF" }), tx({ status: "PENDING" }), tx({ flow_direction: "OUTBOUND" })]) {
      for (const k of Object.keys(tables)) if (k !== "plans") delete tables[k];
      tables.profiles = [{ id: USER, email: "client@example.com", plan: "decouverte", credits: 3 }];
      const p = pending();
      api["GET /checkout-sessions/sess-1/status/"] = paidSession;
      api["GET /payments/tx-1/verify/"] = bad;
      expect(await reconcilePayment(p)).toBe("pending");
      expect(tables.profiles[0]!.plan).toBe("decouverte");
    }
  });

  it("laisse en attente une session non payée et clôt une session expirée", async () => {
    const p = pending();
    api["GET /checkout-sessions/sess-1/status/"] = { id: "sess-1", status: "PENDING", transaction_id: null, transaction_status: null };
    expect(await reconcilePayment(p)).toBe("pending");
    api["GET /checkout-sessions/sess-1/status/"] = { id: "sess-1", status: "EXPIRED", transaction_id: null, transaction_status: null };
    expect(await reconcilePayment(p)).toBe("failed");
    expect(tables.payments![0]!.status).toBe("failed");
    expect(tables.profiles![0]!.plan).toBe("decouverte");
  });
});
