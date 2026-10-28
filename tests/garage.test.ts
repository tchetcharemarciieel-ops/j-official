import { describe, expect, it } from "vitest";
import { OpError, runOp, type OpContext } from "@/lib/garage/engine";
import { MemoryStore } from "@/lib/garage/memory-store";
import { dashboard, finances, stockAlerts, stockValue, type Doc, type GarageRole, type Invoice, type Job, type Move, type Part } from "@/lib/garage/model";

const MANAGER = "11111111-1111-4111-8111-111111111111";
const MECA = "22222222-2222-4222-8222-222222222222";
const VIEWER = "33333333-3333-4333-8333-333333333333";

function setup() {
  const store = new MemoryStore();
  const as = (id: string, role: GarageRole): OpContext => ({ store, actor: { id, role }, members: [MANAGER, MECA, VIEWER] });
  const boss = as(MANAGER, "owner");
  const meca = as(MECA, "employee");
  const viewer = as(VIEWER, "viewer");
  let n = 0;
  const key = () => `cle-unique-${++n}-${Math.random().toString(36).slice(2)}`;
  return { store, boss, meca, viewer, key };
}

async function fail(p: Promise<unknown>, status?: number): Promise<OpError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(OpError);
    if (status) expect((e as OpError).status).toBe(status);
    return e as OpError;
  }
  throw new Error("L'opération aurait dû échouer");
}

/** Client + véhicule + dossier + pièce « filtre à huile » (10 en stock). */
async function base() {
  const s = setup();
  const client = await runOp(s.meca, "client.save", { name: "Awa Diallo", phone: "+225 07 00 00 00", email: "" });
  const vehicle = await runOp(s.meca, "vehicle.save", { client_id: client.id, plate: "ab-123-cd", make: "Toyota", model: "Corolla", mileage: 85000 });
  const job = await runOp(s.meca, "job.create", { client_id: client.id, vehicle_id: vehicle.id, complaint: "Bruit au freinage", requested_work: "Vidange", mileage: 86000, priority: "normale", mechanic_id: MECA, requires_quote: true, idem: s.key() });
  const part = await runOp(s.boss, "part.save", { name: "Filtre à huile", ref: "FH-01", category: "Filtres", min_qty: 3, buy_price: 3000, sell_price: 5000, initial_qty: 10 });
  return { ...s, clientId: client.id!, vehicleId: vehicle.id!, jobId: job.id!, partId: part.id! };
}

const get = async <T,>(s: MemoryStore, col: Parameters<MemoryStore["get"]>[0], id: string) => (await s.get(col, id))! as Doc<T>;

describe("garage : accueil", () => {
  it("enregistre client, véhicules multiples, recherche de doublons et référence unique", async () => {
    const s = await base();
    const second = await runOp(s.meca, "vehicle.save", { client_id: s.clientId, plate: "XY 999 ZZ", make: "Peugeot", model: "208" });
    expect(second.id).toBeTruthy();
    await fail(runOp(s.meca, "vehicle.save", { client_id: s.clientId, plate: "AB123CD", make: "X", model: "Y" }), 409);
    await fail(runOp(s.meca, "client.save", { name: "Autre", phone: "+225 07 00 00 00" }), 409);
    const job = await get<Job>(s.store, "job", s.jobId);
    expect(job.data.ref).toMatch(/^GAR-\d{4}-0001$/);
    expect(job.data.status).toBe("attente");
    expect((await get<{ mileage: number }>(s.store, "vehicle", s.vehicleId)).data.mileage).toBe(86000);
    // Un second dossier ouvert pour le même véhicule est refusé ; le second véhicule reçoit la référence suivante.
    await fail(runOp(s.meca, "job.create", { client_id: s.clientId, vehicle_id: s.vehicleId, complaint: "Autre", idem: s.key() }), 409);
    const j2 = await runOp(s.meca, "job.create", { client_id: s.clientId, vehicle_id: second.id, complaint: "Vidange", idem: s.key() });
    expect((await get<Job>(s.store, "job", j2.id!)).data.ref).toMatch(/-0002$/);
  });

  it("le même envoi de formulaire ne crée jamais deux dossiers", async () => {
    const s = await base();
    const k = s.key();
    const v = await runOp(s.meca, "vehicle.save", { client_id: s.clientId, plate: "NEW-1", make: "Kia", model: "Rio" });
    const a = await runOp(s.meca, "job.create", { client_id: s.clientId, vehicle_id: v.id, complaint: "Pneu", idem: k });
    const b = await runOp(s.meca, "job.create", { client_id: s.clientId, vehicle_id: v.id, complaint: "Pneu", idem: k });
    expect(b.duplicate).toBe(true);
    expect(b.id).toBe(a.id);
  });

  it("un lecteur ne peut rien enregistrer", async () => {
    const s = await base();
    await fail(runOp(s.viewer, "client.save", { name: "X", phone: "0102030405" }), 403);
  });
});

describe("garage : parcours complet d'une intervention", () => {
  it("accueil → diagnostic → devis accepté → réparation → contrôle → prêt → facture → paiement → remise", async () => {
    const s = await base();
    await runOp(s.meca, "job.status", { id: s.jobId, to: "diagnostic" });
    await runOp(s.meca, "job.update", { id: s.jobId, diagnosis: "Plaquettes usées" });
    // Travaux soumis à devis : impossible de démarrer sans accord.
    await fail(runOp(s.meca, "job.status", { id: s.jobId, to: "reparation" }), 409);
    const q = await runOp(s.meca, "quote.save", { job_id: s.jobId, lines: [{ kind: "piece", label: "Filtre à huile", part_id: s.partId, qty: 2, unit_price: 5000 }, { kind: "main_oeuvre", label: "Vidange", qty: 1, unit_price: 8000 }] });
    await runOp(s.meca, "quote.status", { id: q.id, to: "envoye" });
    // Modification d'un devis envoyé : il repasse en brouillon.
    await runOp(s.meca, "quote.save", { id: q.id, job_id: s.jobId, lines: [{ kind: "piece", label: "Filtre à huile", part_id: s.partId, qty: 2, unit_price: 5000 }, { kind: "main_oeuvre", label: "Vidange", qty: 1.5, unit_price: 8000 }] });
    expect((await s.store.get("quote", q.id!))!.data.status).toBe("brouillon");
    expect((await s.store.get("quote", q.id!))!.data.total).toBe(22000);
    await fail(runOp(s.meca, "quote.status", { id: q.id, to: "accepte" }), 422); // canal de l'accord obligatoire
    await runOp(s.meca, "quote.status", { id: q.id, to: "accepte", channel: "telephone" });
    await fail(runOp(s.meca, "quote.save", { id: q.id, job_id: s.jobId, lines: [{ kind: "main_oeuvre", label: "X", qty: 1, unit_price: 1 }] }), 409);

    let job = await get<Job>(s.store, "job", s.jobId);
    expect(job.data.parts).toHaveLength(1); // pièces du devis reportées dans le dossier, non prélevées
    expect(job.data.parts[0]!.consumed).toBe(false);
    expect(job.data.labour[0]!.hours).toBe(1.5);

    await runOp(s.meca, "job.status", { id: s.jobId, to: "reparation" });
    // Deux filtres utilisés : le stock baisse de deux, une seule fois, mouvement lié au dossier.
    const line = job.data.parts[0]!.id;
    await Promise.all([runOp(s.meca, "job.part.consume", { job_id: s.jobId, line_id: line }), runOp(s.meca, "job.part.consume", { job_id: s.jobId, line_id: line })]);
    await runOp(s.meca, "job.part.consume", { job_id: s.jobId, line_id: line });
    expect((await get<Part>(s.store, "part", s.partId)).data.qty).toBe(8);
    const moves = (await s.store.list("move")) as Doc<Move>[];
    const use = moves.filter((m) => m.data.type === "utilisation");
    expect(use).toHaveLength(1);
    expect(use[0]!.data).toMatchObject({ qty: -2, job_id: s.jobId, balance_after: 8, unit_cost: 3000 });

    await runOp(s.meca, "time.add", { job_id: s.jobId, minutes: 75, date: "2026-01-05" });
    await runOp(s.meca, "job.status", { id: s.jobId, to: "controle" });
    job = await get<Job>(s.store, "job", s.jobId);
    expect(job.data.qc!.items.length).toBeGreaterThan(3);
    await fail(runOp(s.meca, "job.status", { id: s.jobId, to: "pret" }), 409);
    await runOp(s.meca, "qc.save", { job_id: s.jobId, items: job.data.qc!.items.map((i) => ({ ...i, ok: true })), remarks: "" });
    // Validation finale réservée à un utilisateur habilité.
    await fail(runOp(s.meca, "qc.validate", { job_id: s.jobId, result: "ok" }), 403);
    const v = await runOp(s.boss, "qc.validate", { job_id: s.jobId, result: "ok" });
    expect(v.effects).toEqual([expect.objectContaining({ type: "ready", plate: "AB-123-CD" })]);
    expect((await get<Job>(s.store, "job", s.jobId)).data.status).toBe("pret");

    const inv = await runOp(s.meca, "invoice.create", { job_id: s.jobId, source: "devis" });
    await fail(runOp(s.meca, "invoice.create", { job_id: s.jobId, source: "intervention" }), 409);
    let invoice = await get<Invoice>(s.store, "invoice", inv.id!);
    expect(invoice.data.total).toBe(22000);
    expect(invoice.data.status).toBe("impayee");
    await fail(runOp(s.meca, "job.status", { id: s.jobId, to: "remis" }), 409); // solde dû : confirmation exigée

    const k = s.key();
    await fail(runOp(s.meca, "payment.add", { invoice_id: inv.id, amount: 30000, method: "especes", received_at: "2026-01-05", idem: s.key() }), 422);
    await fail(runOp(s.meca, "payment.add", { invoice_id: inv.id, amount: 1000, method: "mobile_money", received_at: "2026-01-05", idem: s.key() }), 422); // preuve manquante
    await runOp(s.meca, "payment.add", { invoice_id: inv.id, amount: 10000, method: "especes", received_at: "2026-01-05", idem: k });
    const again = await runOp(s.meca, "payment.add", { invoice_id: inv.id, amount: 10000, method: "especes", received_at: "2026-01-05", idem: k });
    expect(again.duplicate).toBe(true);
    invoice = await get<Invoice>(s.store, "invoice", inv.id!);
    expect(invoice.data).toMatchObject({ paid: 10000, status: "partielle" });
    await runOp(s.meca, "payment.add", { invoice_id: inv.id, amount: 12000, method: "mobile_money", reference: "MM-889", received_at: "2026-01-06", idem: s.key() });
    invoice = await get<Invoice>(s.store, "invoice", inv.id!);
    expect(invoice.data).toMatchObject({ paid: 22000, status: "payee" });
    const payments = await s.store.list("payment");
    expect(payments).toHaveLength(2);
    expect(payments.every((p) => /^REC-\d{4}-\d{4}$/.test(String(p.data.receipt_no)))).toBe(true);

    await runOp(s.meca, "job.status", { id: s.jobId, to: "remis" });
    job = await get<Job>(s.store, "job", s.jobId);
    expect(job.data.status).toBe("remis");
    expect(job.data.history.map((h) => h.to)).toEqual(["attente", "diagnostic", "diagnostic", "reparation", "controle", "pret", "remis"]);
    await fail(runOp(s.meca, "job.update", { id: s.jobId, diagnosis: "x" }), 409);

    const f = finances(s.store.data, { from: "2026-01-01", to: "2026-01-31" });
    expect(f.receipts).toBe(22000);
    expect(f.outstanding).toBe(0);
  });

  it("contrôle à reprendre : retour en réparation avec remarques", async () => {
    const s = await base();
    await runOp(s.boss, "job.update", { id: s.jobId, requires_quote: false });
    for (const to of ["diagnostic", "reparation", "controle"]) await runOp(s.meca, "job.status", { id: s.jobId, to });
    const job = await get<Job>(s.store, "job", s.jobId);
    await runOp(s.meca, "qc.save", { job_id: s.jobId, items: job.data.qc!.items, remarks: "" });
    await fail(runOp(s.boss, "qc.validate", { job_id: s.jobId, result: "ok" }), 409); // points non conformes
    await fail(runOp(s.boss, "qc.validate", { job_id: s.jobId, result: "reprendre" }), 422);
    await runOp(s.boss, "qc.validate", { job_id: s.jobId, result: "reprendre", remarks: "Serrage des roues à refaire" });
    const after = await get<Job>(s.store, "job", s.jobId);
    expect(after.data.status).toBe("reparation");
    expect(after.data.rework_count).toBe(1);
  });
});

describe("garage : stock des pièces", () => {
  it("empêche les sorties supérieures au stock et la double déduction en cas d'accès simultanés", async () => {
    const s = await base();
    await runOp(s.boss, "job.update", { id: s.jobId, requires_quote: false });
    // Deux employés prélèvent en même temps 6 filtres chacun alors qu'il n'y en a que 10.
    const r = await Promise.allSettled([
      runOp(s.meca, "job.part.add", { job_id: s.jobId, part_id: s.partId, qty: 6, consume_now: true, line_id: s.key() }),
      runOp(s.boss, "invoice.sale", { customer_name: "Passage", lines: [{ part_id: s.partId, qty: 6 }], idem: s.key() }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const part = await get<Part>(s.store, "part", s.partId);
    expect(part.data.qty).toBe(4);
    const job = await get<Job>(s.store, "job", s.jobId);
    // La ligne refusée n'est pas marquée prélevée.
    expect(job.data.parts.filter((p) => p.consumed).length + (await s.store.list("invoice")).length).toBe(1);
  });

  it("réception, ajustement autorisé, alertes, valeur et commandes fournisseurs", async () => {
    const s = await base();
    await fail(runOp(s.meca, "stock.adjust", { part_id: s.partId, counted: 7, reason: "Inventaire", idem: s.key() }), 403);
    const k = s.key();
    await runOp(s.boss, "stock.adjust", { part_id: s.partId, counted: 2, reason: "Inventaire", idem: k });
    await runOp(s.boss, "stock.adjust", { part_id: s.partId, counted: 2, reason: "Inventaire", idem: k }).catch(() => undefined);
    expect((await get<Part>(s.store, "part", s.partId)).data.qty).toBe(2);
    expect(stockAlerts(s.store.data.part).low.map((p) => p.id)).toEqual([s.partId]);
    expect(stockValue(s.store.data.part).value).toBe(6000);

    const sup = await runOp(s.boss, "supplier.save", { name: "AutoParts SARL", phone: "0102030405" });
    const po = await runOp(s.boss, "po.save", { supplier_id: sup.id, lines: [{ part_id: s.partId, qty: 10, unit_cost: 2800 }] });
    // Brouillon : aucune réception possible, aucun stock modifié.
    await fail(runOp(s.boss, "po.receive", { id: po.id, lines: [{ part_id: s.partId, qty: 4, unit_cost: 2800 }], idem: s.key() }), 409);
    await runOp(s.boss, "po.status", { id: po.id, to: "commandee" });
    const rk = s.key();
    await runOp(s.boss, "po.receive", { id: po.id, lines: [{ part_id: s.partId, qty: 4, unit_cost: 2800 }], extra_costs: 1000, idem: rk });
    const dup = await runOp(s.boss, "po.receive", { id: po.id, lines: [{ part_id: s.partId, qty: 4, unit_cost: 2800 }], idem: rk });
    expect(dup.duplicate).toBe(true);
    expect((await s.store.get("po", po.id!))!.data.status).toBe("partielle");
    await fail(runOp(s.boss, "po.receive", { id: po.id, lines: [{ part_id: s.partId, qty: 7, unit_cost: 2800 }], idem: s.key() }), 422);
    await runOp(s.boss, "po.receive", { id: po.id, lines: [{ part_id: s.partId, qty: 6, unit_cost: 2900 }], record_expense: false, idem: s.key() });
    const part = await get<Part>(s.store, "part", s.partId);
    expect(part.data.qty).toBe(12);
    expect(part.data.buy_price).toBe(2900);
    expect((await s.store.get("po", po.id!))!.data.status).toBe("recue");
    const exp = await s.store.list("expense");
    expect(exp).toHaveLength(1);
    expect(exp[0]!.data.amount).toBe(4 * 2800 + 1000);
  });

  it("vente au comptoir liée à la facture, annulation avec retour en stock", async () => {
    const s = await base();
    const sale = await runOp(s.meca, "invoice.sale", { customer_name: "Client de passage", lines: [{ part_id: s.partId, qty: 3 }], idem: s.key() });
    expect((await get<Part>(s.store, "part", s.partId)).data.qty).toBe(7);
    const mv = ((await s.store.list("move")) as Doc<Move>[]).find((m) => m.data.type === "vente")!;
    expect(mv.data.invoice_id).toBe(sale.id);
    await runOp(s.boss, "invoice.cancel", { id: sale.id, reason: "Erreur de saisie" });
    expect((await get<Part>(s.store, "part", s.partId)).data.qty).toBe(10);
    expect((await get<Invoice>(s.store, "invoice", sale.id!)).data.status).toBe("annulee");
  });
});

describe("garage : champs facultatifs", () => {
  it("un champ numérique vide reste vide (jamais converti en 0)", async () => {
    const s = await base();
    const v = await runOp(s.meca, "vehicle.save", { client_id: s.clientId, plate: "VIDE-1", make: "Kia", model: "Rio", mileage: "", year: null });
    expect((await s.store.get("vehicle", v.id!))!.data).toMatchObject({ mileage: null, year: null });
    const j = await runOp(s.meca, "job.create", { client_id: s.clientId, vehicle_id: v.id, complaint: "Pneu", mileage: null, planned_minutes: "", idem: s.key() });
    expect((await get<Job>(s.store, "job", j.id!)).data).toMatchObject({ mileage_in: null, planned_minutes: null });
    const p = await runOp(s.boss, "part.save", { name: "Joint", min_qty: 0, buy_price: "", sell_price: null });
    expect((await get<Part>(s.store, "part", p.id!)).data).toMatchObject({ buy_price: null, sell_price: null });
    // Vente sans prix saisi : le prix de vente enregistré est utilisé, ou la vente est refusée s'il manque.
    const sale = await runOp(s.meca, "invoice.sale", { lines: [{ part_id: s.partId, qty: 1, unit_price: null }], idem: s.key() });
    expect((await get<Invoice>(s.store, "invoice", sale.id!)).data.total).toBe(5000);
    await runOp(s.boss, "stock.receive", { part_id: p.id, qty: 2, unit_cost: "", idem: s.key() });
    await fail(runOp(s.meca, "invoice.sale", { lines: [{ part_id: p.id, qty: 1, unit_price: "" }], idem: s.key() }), 422);
  });
});

describe("garage : bureau et salle de repos", () => {
  it("tableau de bord et finances calculés uniquement sur les fiches", async () => {
    const s = await base();
    expect(dashboard(s.store.data)).toMatchObject({ present: 1, inRepair: 0, ready: 0 });
    await fail(runOp(s.meca, "expense.save", { date: "2026-01-02", category: "Loyer", amount: 50000 }), 403);
    await runOp(s.boss, "expense.save", { date: "2026-01-02", category: "Loyer", amount: 50000 });
    const f = finances(s.store.data, { from: "2026-01-01", to: "2026-01-31" });
    expect(f).toMatchObject({ receipts: 0, expenses: 50000, profit: -50000 });
  });

  it("panne signalée → tâche de réparation ; réparation terminée → équipement remis en état", async () => {
    const s = await base();
    const eq = await runOp(s.boss, "equip.save", { name: "Machine à café", qty: 1, condition: "bon" });
    const t = await runOp(s.meca, "equip.report", { id: eq.id, condition: "panne", note: "Fuite d'eau" });
    expect((await s.store.get("equip", eq.id!))!.data.condition).toBe("panne");
    await fail(runOp(s.meca, "task.save", { id: t.id, kind: "reparation", title: "Réparer : Machine à café", assignee_id: MECA }), 403);
    await runOp(s.boss, "task.save", { id: t.id, kind: "reparation", title: "Réparer : Machine à café", assignee_id: MECA });
    await runOp(s.meca, "task.status", { id: t.id, to: "fait", cost: 7500 });
    expect((await s.store.get("equip", eq.id!))!.data.condition).toBe("bon");
    expect((await s.store.get("task", t.id!))!.data).toMatchObject({ status: "fait", cost: 7500 });
    expect(await s.store.list("expense")).toHaveLength(0); // aucune dépense créée sans demande d'un gérant
  });

  it("fournitures : sortie limitée au stock, achat enregistré en dépense une seule fois", async () => {
    const s = await base();
    const sav = await runOp(s.boss, "supply.save", { name: "Savon", unit: "flacon", min_qty: 2, initial_qty: 1 });
    await fail(runOp(s.meca, "supply.move", { id: sav.id, qty: -2, idem: s.key() }), 409);
    const k = s.key();
    await runOp(s.boss, "supply.move", { id: sav.id, qty: 6, cost: 6000, record_expense: true, idem: k });
    await runOp(s.boss, "supply.move", { id: sav.id, qty: 6, cost: 6000, record_expense: true, idem: k });
    expect((await s.store.get("supply", sav.id!))!.data.qty).toBe(7);
    expect(await s.store.list("expense")).toHaveLength(1);
  });
});
