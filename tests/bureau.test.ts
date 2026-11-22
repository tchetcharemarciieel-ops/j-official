import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/bureau/memory-store";
import { runOp, type OpContext } from "@/lib/bureau/engine";
import { visibleData } from "@/lib/bureau/visibility";
import { balanceOf, dmChannel, docTotals, financeIn, invoiceState, monthRange, performance, projectProgress, today, type BureauRole, type Doc, type Equipment, type Invoice, type Project, type Task } from "@/lib/bureau/model";
import { positionsFor, sectorOf, SECTOR_PERMISSIONS, type Permission } from "@/lib/team";

const DIR = "00000000-0000-4000-8000-0000000000d1";
const EMP = "00000000-0000-4000-8000-0000000000e1";
const EMP2 = "00000000-0000-4000-8000-0000000000e2";
const ACC = "00000000-0000-4000-8000-0000000000a1";
const MEMBERS = [DIR, EMP, EMP2, ACC];
const ctx = (store: MemoryStore, id: string, role: BureauRole, perms: Permission[] | null = null): OpContext => ({ store, actor: { id, role }, perms, members: MEMBERS });
const uid = () => crypto.randomUUID();
const P_EMP: Permission[] = ["projets", "agenda"];
const P_ACC: Permission[] = ["finances", "documents", "rapports", "clients"];

async function agency() {
  const store = new MemoryStore();
  const dir = ctx(store, DIR, "manager");
  await runOp(dir, "settings.save", { name: "Agence Test", agency_type: "immobilier", sector: "Immobilier", currency: "XAF", spaces: [{ id: "reception", name: "Accueil", kind: "reception", links: ["clients"], enabled: true }] });
  return { store, dir, emp: ctx(store, EMP, "employee", P_EMP), acc: ctx(store, ACC, "employee", P_ACC) };
}
const col = <T,>(s: MemoryStore, c: Parameters<MemoryStore["list"]>[0]) => s.data[c] as unknown as Doc<T>[];

describe("MiniSoft Bureau : clients et interactions", () => {
  it("crée, modifie, historise et protège un client utilisé", async () => {
    const { store, dir } = await agency();
    const c = await runOp(dir, "client.save", { name: "Awa Traoré", kind: "particulier", phone: "+236 72 00 00 00", status: "actif" });
    await runOp(dir, "client.save", { id: c.id, name: "Awa Traoré-Bella", status: "actif" });
    expect(store.data.client[0]!.data.name).toBe("Awa Traoré-Bella");
    await runOp(dir, "interaction.add", { client_id: c.id, type: "appel", text: "Demande de devis" });
    expect(store.data.interaction).toHaveLength(1);
    await expect(runOp(dir, "client.save", { name: "X", email: "pas-un-email" })).rejects.toThrow(/e-mail/i);
    await runOp(dir, "project.save", { name: "Projet A", client_id: c.id });
    await expect(runOp(dir, "client.delete", { id: c.id })).rejects.toThrow(/Archivé/);
    const free = await runOp(dir, "client.save", { name: "Sans lien" });
    await runOp(dir, "client.delete", { id: free.id });
    expect(store.data.client).toHaveLength(1);
  });
});

describe("MiniSoft Bureau : projets, tâches et accès par poste", () => {
  it("un employé ne voit et ne modifie que ses projets et ses tâches", async () => {
    const { store, dir, emp } = await agency();
    const mine = await runOp(dir, "project.save", { name: "Site web", owner: DIR, members: [EMP], due: "2026-12-31" });
    const other = await runOp(dir, "project.save", { name: "Secret direction", owner: DIR, members: [] });
    await expect(runOp(emp, "project.save", { name: "Pirate" })).rejects.toThrow(/directeur/);
    const t1 = await runOp(dir, "task.save", { project_id: mine.id, title: "Maquette", assignee: EMP });
    const t2 = await runOp(dir, "task.save", { project_id: other.id, title: "Budget", assignee: DIR });
    const view = visibleData(store.data, EMP, "employee", P_EMP);
    expect(view.project.map((p) => p.id)).toEqual([mine.id]);
    expect(view.task.map((t) => t.id)).toEqual([t1.id]);
    await runOp(emp, "task.status", { id: t1.id, status: "termine" });
    await expect(runOp(emp, "task.status", { id: t2.id, status: "termine" })).rejects.toThrow(/vos tâches/);
    await expect(runOp(emp, "task.save", { project_id: other.id, title: "Intrus" })).rejects.toThrow(/vos projets/);
    await expect(runOp(emp, "comment.add", { target: "project", target_id: other.id, text: "coucou" })).rejects.toThrow(/vos projets/);
    await runOp(emp, "comment.add", { target: "project", target_id: mine.id, text: "Maquette livrée" });
    expect(view.comment).toHaveLength(0);
    const tasks = col<Task>(store, "task");
    expect(tasks.find((t) => t.id === t1.id)!.data.done_at).toBeTruthy();
  });
  it("l'avancement se calcule sur les tâches terminées ; la performance sur les délais", async () => {
    const { store, dir } = await agency();
    const p = await runOp(dir, "project.save", { name: "P", owner: DIR });
    const a = await runOp(dir, "task.save", { project_id: p.id, title: "A", assignee: EMP, due: "2099-01-01" });
    await runOp(dir, "task.save", { project_id: p.id, title: "B", assignee: EMP, due: "2000-01-01" });
    await runOp(dir, "task.status", { id: a.id, status: "termine" });
    expect(projectProgress(col<Project>(store, "project")[0]!.data, col<Task>(store, "task"), p.id!)).toBe(50);
    const perf = performance(col<Task>(store, "task"), EMP);
    expect(perf).toMatchObject({ assigned: 2, done: 1, open: 1, late: 1, onTimeRate: 100 });
    expect(performance([], EMP).onTimeRate).toBeNull();
  });
});

describe("MiniSoft Bureau : devis, factures, paiements, finances", () => {
  it("devis → facture → paiements partiels : reçus numérotés, recettes en finances, solde exact, doublon refusé", async () => {
    const { store, dir, acc } = await agency();
    const c = await runOp(dir, "client.save", { name: "Société Nord" });
    const q = await runOp(dir, "quote.save", { client_id: c.id, items: [{ desc: "Étude", qty: 2, unit_price: 50000 }], tax_rate: 18, discount: 10000 });
    expect(q.number).toMatch(/^DEV-\d{4}-0001$/);
    expect(docTotals([{ desc: "x", qty: 2, unit_price: 50000 }], 18, 10000).total).toBe(106200);
    await runOp(dir, "quote.status", { id: q.id, status: "envoye" });
    const inv = await runOp(dir, "quote.convert", { id: q.id });
    const again = await runOp(dir, "quote.convert", { id: q.id });
    expect(again.id).toBe(inv.id);
    expect(store.data.invoice).toHaveLength(1);
    await expect(runOp(dir, "quote.save", { id: q.id, items: [{ desc: "x", qty: 1, unit_price: 1 }] })).rejects.toThrow(/plus modifiable/);
    // Facture brouillon : pas de paiement ; envoyée : paiements.
    const pid = uid();
    await expect(runOp(acc, "invoice.payment", { invoice_id: inv.id, pid, amount: 1000, method: "especes" })).rejects.toThrow(/envoyée/);
    await runOp(dir, "invoice.status", { id: inv.id, status: "envoyee" });
    await expect(runOp(dir, "invoice.save", { id: inv.id, items: [{ desc: "x", qty: 1, unit_price: 1 }] })).rejects.toThrow(/plus modifiable/);
    // Un poste sans « finances » ne peut pas encaisser.
    await expect(runOp(ctx(store, EMP, "employee", P_EMP), "invoice.payment", { invoice_id: inv.id, pid: uid(), amount: 1, method: "especes" })).rejects.toThrow(/poste/);
    const r1 = await runOp(acc, "invoice.payment", { invoice_id: inv.id, pid, amount: 60000, method: "mobile_money", ref: "MM1" });
    await runOp(acc, "invoice.payment", { invoice_id: inv.id, pid, amount: 60000, method: "mobile_money" });
    expect(r1.number).toMatch(/^REC-/);
    let v = col<Invoice>(store, "invoice")[0]!.data;
    expect(v.payments).toHaveLength(1);
    expect(balanceOf(v)).toBe(46200);
    expect(invoiceState(v)).toBe("partielle");
    await expect(runOp(acc, "invoice.payment", { invoice_id: inv.id, pid: uid(), amount: 50000, method: "especes" })).rejects.toThrow(/46/);
    await runOp(acc, "invoice.payment", { invoice_id: inv.id, pid: uid(), amount: 46200, method: "virement" });
    v = col<Invoice>(store, "invoice")[0]!.data;
    expect(invoiceState(v)).toBe("payee");
    const f = financeIn(store.data.transaction as never, monthRange(today().slice(0, 7)));
    expect(f).toMatchObject({ income: 106200, expense: 0, balance: 106200 });
    // La recette d'une facture ne se supprime que par l'annulation du paiement.
    await expect(runOp(acc, "transaction.delete", { id: store.data.transaction[0]!.id })).rejects.toThrow(/annulez le paiement/);
    await expect(runOp(acc, "invoice.payment_cancel", { invoice_id: inv.id, pid, reason: "Erreur" })).rejects.toThrow(/directeur/);
    await runOp(dir, "invoice.payment_cancel", { invoice_id: inv.id, pid, reason: "Erreur de saisie" });
    expect(financeIn(store.data.transaction as never, monthRange(today().slice(0, 7))).income).toBe(46200);
    await expect(runOp(dir, "invoice.delete", { id: inv.id })).rejects.toThrow(/brouillon/);
  });
  it("recettes et dépenses manuelles : solde calculé, jamais inventé", async () => {
    const { store, acc } = await agency();
    await runOp(acc, "transaction.save", { type: "recette", amount: 200000, category: "vente", date: today(), description: "Vente comptant" });
    await runOp(acc, "transaction.save", { type: "depense", amount: 75000, category: "loyer", date: today() });
    expect(financeIn(store.data.transaction as never, monthRange(today().slice(0, 7)))).toMatchObject({ income: 200000, expense: 75000, balance: 125000 });
    expect(financeIn([], monthRange("2026-01"))).toMatchObject({ income: 0, balance: 0 });
  });
});

describe("MiniSoft Bureau : agenda, présences, équipements, messagerie", () => {
  it("rendez-vous : cohérence des heures, conflit signalé, annulation", async () => {
    const { dir } = await agency();
    await expect(runOp(dir, "appointment.save", { title: "X", start: "2026-12-01T10:00", end: "2026-12-01T09:00" })).rejects.toThrow(/après le début/);
    const a = await runOp(dir, "appointment.save", { title: "Visite", start: "2026-12-01T10:00", end: "2026-12-01T11:00", participants: [EMP] });
    const b = await runOp(dir, "appointment.save", { title: "Réunion", kind: "reunion", start: "2026-12-01T10:30", end: "2026-12-01T11:30", participants: [EMP] });
    expect(b.message).toMatch(/déjà « Visite »/);
    await runOp(dir, "appointment.status", { id: a.id, status: "annule" });
    const c = await runOp(dir, "appointment.save", { title: "Autre", start: "2026-12-01T10:15", end: "2026-12-01T10:45", participants: [EMP] });
    expect(c.message).toMatch(/Réunion/);
  });
  it("pointage : arrivée puis départ sur la fiche liée au compte", async () => {
    const { store, dir, emp } = await agency();
    await expect(runOp(emp, "attendance.checkin", {})).rejects.toThrow(/liée à votre compte/);
    await runOp(dir, "employee.save", { name: "Jean", position: "Agent", user_id: EMP });
    const t1 = await runOp(emp, "attendance.checkin", {});
    expect(t1.message).toMatch(/Arrivée/);
    expect((await runOp(emp, "attendance.checkin", {})).message).toMatch(/Départ enregistré/);
    expect((await runOp(emp, "attendance.checkin", {})).message).toMatch(/déjà/);
    expect(store.data.attendance).toHaveLength(1);
    await expect(runOp(dir, "employee.save", { name: "Doublon", user_id: EMP })).rejects.toThrow(/déjà lié/);
    await expect(runOp(dir, "employee.save", { name: "Inconnu", user_id: uid() })).rejects.toThrow(/équipe/);
  });
  it("équipements : attribution tracée, reprise, pas de suppression si attribué", async () => {
    const { store, dir } = await agency();
    const e = await runOp(dir, "employee.save", { name: "Marie" });
    const q = await runOp(dir, "equipment.save", { name: "PC portable", kind: "ordinateur", serial: "SN1", state: "neuf" });
    await runOp(dir, "equipment.assign", { id: q.id, assigned_to: e.id });
    await runOp(dir, "equipment.state", { id: q.id, state: "panne", note: "écran cassé" });
    const eq = col<Equipment>(store, "equipment")[0]!.data;
    expect(eq.assigned_to).toBe(e.id);
    expect(eq.history.map((h) => h.text).join("|")).toMatch(/Attribué à Marie.*État : En panne/);
    await expect(runOp(dir, "equipment.delete", { id: q.id })).rejects.toThrow(/attribué/);
    await expect(runOp(dir, "employee.delete", { id: e.id })).rejects.toThrow(/équipement/);
    await runOp(dir, "equipment.assign", { id: q.id, assigned_to: null });
    await runOp(dir, "equipment.delete", { id: q.id });
  });
  it("messagerie : privé entre deux personnes, projet réservé à ses membres", async () => {
    const { store, dir, emp } = await agency();
    await runOp(dir, "message.send", { channel: "general", text: "Bonjour à tous" });
    await runOp(dir, "message.send", { channel: dmChannel(DIR, EMP), text: "Peux-tu passer ?" });
    await expect(runOp(emp, "message.send", { channel: dmChannel(DIR, ACC), text: "intrus" })).rejects.toThrow(/ne vous concerne pas/);
    const p = await runOp(dir, "project.save", { name: "Confidentiel", owner: DIR });
    await expect(runOp(emp, "message.send", { channel: `project:${p.id}`, text: "hello" })).rejects.toThrow(/pas partie/);
    await runOp(dir, "message.send", { channel: `project:${p.id}`, text: "Point projet" });
    expect(visibleData(store.data, EMP, "employee", P_EMP).message.map((m) => (m.data as { text: string }).text).sort()).toEqual(["Bonjour à tous", "Peux-tu passer ?"]);
    expect(visibleData(store.data, ACC, "employee", P_ACC).message).toHaveLength(1);
    expect((await runOp(emp, "message.read", { channel: dmChannel(DIR, EMP) })).message).toMatch(/1 message/);
  });
});

describe("MiniSoft Bureau : modules du métier, permissions, isolation", () => {
  it("module immobilier : champs validés, relations contrôlées, désactivation", async () => {
    const { store, dir } = await agency();
    await expect(runOp(dir, "record.save", { mod: "biens", data: { type: "Appartement" } })).rejects.toThrow(/Titre obligatoire/);
    await expect(runOp(dir, "record.save", { mod: "biens", data: { titre: "Villa", type: "Château" } })).rejects.toThrow(/choix invalide/);
    await expect(runOp(dir, "record.save", { mod: "campagnes", data: { nom: "X" } })).rejects.toThrow(/pas activé/);
    const o = await runOp(dir, "record.save", { mod: "proprietaires", data: { nom: "M. Zoumba", telephone: "+236 70 00 00 00" } });
    const b = await runOp(dir, "record.save", { mod: "biens", data: { titre: "Villa Bimbo", type: "Maison", prix: 45000000, statut: "Disponible", proprietaire: o.id } });
    await expect(runOp(dir, "record.save", { mod: "biens", data: { titre: "Faux lien", proprietaire: uid() } })).rejects.toThrow(/introuvable/);
    await expect(runOp(dir, "record.delete", { id: o.id })).rejects.toThrow(/utilisée/);
    await runOp(dir, "record.delete", { id: b.id });
    await runOp(dir, "record.delete", { id: o.id });
    expect(store.data.record).toHaveLength(0);
    const s = (await store.list("settings"))[0]!;
    await runOp(dir, "settings.save", { ...(s.data as object), modules: { biens: false } });
    await expect(runOp(dir, "record.save", { mod: "biens", data: { titre: "x" } })).rejects.toThrow(/pas activé/);
  });
  it("postes : secrétaire, employé, comptable, directeur, administrateur ; lecteur sans écriture", async () => {
    expect(sectorOf("bureau", "bureau")).toBe("bureau");
    expect(positionsFor("bureau").map((p) => p.key)).toEqual(["administrateur", "directeur", "secretaire", "employe", "comptable"]);
    expect(SECTOR_PERMISSIONS.bureau).toEqual(expect.arrayContaining(["clients", "projets", "agenda", "documents", "finances"]));
    const { store } = await agency();
    await expect(runOp(ctx(store, EMP, "viewer"), "client.save", { name: "X" })).rejects.toThrow(/lecture seule/);
    const secretary = ctx(store, EMP2, "employee", ["clients", "agenda", "documents", "projets"]);
    await runOp(secretary, "client.save", { name: "Via secrétaire" });
    await expect(runOp(secretary, "transaction.save", { type: "recette", amount: 1, category: "vente", date: today() })).rejects.toThrow(/poste/);
    await expect(runOp(secretary, "employee.save", { name: "RH" })).rejects.toThrow(/poste/);
    const v = visibleData(store.data, EMP2, "employee", ["clients", "agenda", "documents", "projets"]);
    expect(v.transaction).toHaveLength(0);
    expect(v.employee).toHaveLength(0);
  });
  it("deux entreprises ne partagent rien", async () => {
    const a = await agency();
    const b = await agency();
    const c = await runOp(a.dir, "client.save", { name: "Client de A" });
    expect(b.store.data.client).toHaveLength(0);
    await expect(runOp(b.dir, "project.save", { name: "P", client_id: c.id })).rejects.toThrow(/introuvable/);
  });
  it("documents : fichier accepté seulement s'il est d'un type autorisé et de taille raisonnable", async () => {
    const { store, dir } = await agency();
    const ok1 = await runOp(dir, "document.add", { name: "Contrat signé", category: "contrat", file: { name: "c.pdf", mime: "application/pdf", data: Buffer.from("%PDF-1.4 test").toString("base64") } });
    expect(store.data.document).toHaveLength(1);
    expect(store.data.file[0]!.data.size).toBe(13);
    await expect(runOp(dir, "document.add", { name: "Script", file: { name: "x.exe", mime: "application/x-msdownload", data: "AAAA" } })).rejects.toThrow();
    await expect(runOp(dir, "document.add", { name: "Énorme", file: { name: "x.pdf", mime: "application/pdf", data: "A".repeat(510_000) } })).rejects.toThrow(/lourd/);
    await runOp(dir, "document.delete", { id: ok1.id });
    expect(store.data.file).toHaveLength(0);
  });
});
