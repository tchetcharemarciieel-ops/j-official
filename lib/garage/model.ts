/**
 * Module « Gestion du garage » : modèle métier partagé par le serveur, le navigateur et les tests.
 * Les données sont rangées dans la table `records` existante sous des identifiants réservés
 * (« gx:… »), qui ne peuvent jamais entrer en conflit avec les tables d'un logiciel généré
 * (leurs clés ne contiennent que des minuscules, chiffres et « _ »).
 * Aucune valeur n'est inventée : tous les indicateurs sont calculés sur les fiches enregistrées.
 */

export const COLLECTIONS = [
  "client",
  "vehicle",
  "job",
  "quote",
  "invoice",
  "payment",
  "part",
  "move",
  "supplier",
  "po",
  "expense",
  "time",
  "tool",
  "task",
  "equip",
  "supply",
  "supply_move",
  "locker",
  "settings",
  "counter",
  "photo",
] as const;
export type Col = (typeof COLLECTIONS)[number];
export const entityKey = (c: Col) => `gx:${c}`;
export const colFromEntity = (e: string): Col | null => {
  const c = e.startsWith("gx:") ? e.slice(3) : "";
  return (COLLECTIONS as readonly string[]).includes(c) ? (c as Col) : null;
};

export type Doc<T = Record<string, unknown>> = { id: string; data: T; created_at: string; updated_at: string };

// ---------- Rôles ----------

export type GarageRole = "owner" | "admin" | "manager" | "employee" | "viewer";
/** 0 lecture seule, 1 équipe (accueil, mécaniciens), 2 gérant (gestionnaire, administrateur, propriétaire). */
export const LEVEL: Record<GarageRole, number> = { viewer: 0, employee: 1, manager: 2, admin: 2, owner: 2 };
export const isManager = (r: GarageRole) => LEVEL[r] >= 2;

// ---------- Interventions ----------

export const JOB_STATUSES = ["attente", "diagnostic", "reparation", "controle", "pret", "remis", "annule"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  attente: "En attente",
  diagnostic: "En diagnostic",
  reparation: "En réparation",
  controle: "En contrôle",
  pret: "Prêt",
  remis: "Remis au client",
  annule: "Annulé",
};
/** Véhicule physiquement au garage (enregistré comme déposé et pas encore remis). */
export const PRESENT: JobStatus[] = ["attente", "diagnostic", "reparation", "controle", "pret"];
/** Véhicule en cours de travail à l'atelier. */
export const IN_WORKSHOP: JobStatus[] = ["diagnostic", "reparation", "controle"];

/** Transitions autorisées. « pret » n'est atteint que par la validation du contrôle qualité. */
export const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  attente: ["diagnostic", "annule"],
  diagnostic: ["attente", "reparation", "annule"],
  reparation: ["diagnostic", "controle", "annule"],
  controle: ["reparation"],
  pret: ["remis", "reparation"],
  remis: [],
  annule: [],
};

export const PRIORITIES = ["normale", "haute", "urgente"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = { normale: "Normale", haute: "Haute", urgente: "Urgente" };

export type HistoryEntry = { from: string | null; to: string; at: string; by: string; note?: string };

export type LabourLine = { id: string; label: string; hours: number; rate: number };
export type PartLine = {
  id: string;
  part_id: string;
  label: string;
  qty: number;
  unit_price: number;
  unit_cost: number | null;
  consumed: boolean;
  consumed_at: string | null;
  move_id: string | null;
};
export type MissingPart = { id: string; label: string; part_id: string | null; qty: number; status: "signalee" | "commandee" | "recue"; at: string; by: string };
export type QcItem = { label: string; ok: boolean; note: string };
export type Qc = {
  items: QcItem[];
  remarks: string;
  checked_by: string | null;
  checked_at: string | null;
  result: "ok" | "reprendre" | null;
  validated_by: string | null;
  validated_at: string | null;
};

export type Client = { name: string; phone: string; email: string; address: string; notes: string };
export type Vehicle = { client_id: string; plate: string; make: string; model: string; year: number | null; vin: string; mileage: number | null };
export type Job = {
  ref: string;
  client_id: string;
  vehicle_id: string;
  complaint: string;
  requested_work: string;
  mileage_in: number | null;
  priority: Priority;
  mechanic_id: string | null;
  planned_end: string | null;
  planned_minutes: number | null;
  requires_quote: boolean;
  diagnosis: string;
  status: JobStatus;
  history: HistoryEntry[];
  labour: LabourLine[];
  parts: PartLine[];
  missing: MissingPart[];
  qc: Qc | null;
  rework_count: number;
  ready_at: string | null;
  delivered_at: string | null;
  invoice_id: string | null;
  photo_count: number;
  idem: string;
  created_by: string;
};

// ---------- Devis, factures, paiements ----------

export const QUOTE_STATUSES = ["brouillon", "envoye", "accepte", "refuse"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = { brouillon: "Brouillon", envoye: "Envoyé", accepte: "Accepté", refuse: "Refusé" };
export type QuoteLine = { id: string; kind: "piece" | "main_oeuvre"; label: string; part_id: string | null; qty: number; unit_price: number };
export type Quote = {
  number: string;
  job_id: string;
  client_id: string;
  lines: QuoteLine[];
  total_parts: number;
  total_labour: number;
  total: number;
  note: string;
  status: QuoteStatus;
  history: HistoryEntry[];
  decision: { channel: string; note: string; at: string; recorded_by: string } | null;
};

export type InvoiceLine = { label: string; kind: "piece" | "main_oeuvre" | "autre"; qty: number; unit_price: number; total: number; part_id: string | null };
export type InvoiceStatus = "impayee" | "partielle" | "payee" | "annulee";
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = { impayee: "Impayée", partielle: "Partiellement payée", payee: "Payée", annulee: "Annulée" };
export type Invoice = {
  number: string;
  job_id: string | null;
  client_id: string | null;
  customer_name: string;
  source: "devis" | "intervention" | "vente";
  quote_id: string | null;
  lines: InvoiceLine[];
  total: number;
  total_parts: number;
  total_labour: number;
  paid: number;
  status: InvoiceStatus;
  payment_keys: string[];
  due_date: string | null;
  issued_at: string;
  cancelled: { at: string; by: string; reason: string } | null;
  idem: string;
};

export const PAYMENT_METHODS = ["especes", "mobile_money", "carte", "virement", "cheque"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { especes: "Espèces", mobile_money: "Mobile money", carte: "Carte bancaire", virement: "Virement", cheque: "Chèque" };
export type Payment = {
  invoice_id: string;
  receipt_no: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  received_at: string;
  recorded_by: string;
  cancelled: { at: string; by: string; reason: string } | null;
};

// ---------- Stock ----------

export type Part = {
  name: string;
  ref: string;
  category: string;
  location: string;
  qty: number;
  min_qty: number;
  buy_price: number | null;
  sell_price: number | null;
  supplier_id: string | null;
  active: boolean;
  /** Clés des derniers mouvements appliqués : un même mouvement n'est jamais compté deux fois. */
  op_keys: string[];
};
export const MOVE_TYPES = ["initial", "reception", "utilisation", "vente", "ajustement", "retour"] as const;
export type MoveType = (typeof MOVE_TYPES)[number];
export const MOVE_TYPE_LABELS: Record<MoveType, string> = { initial: "Stock initial", reception: "Réception", utilisation: "Utilisation atelier", vente: "Vente", ajustement: "Ajustement", retour: "Retour en stock" };
export type Move = {
  part_id: string;
  type: MoveType;
  qty: number;
  balance_after: number;
  unit_cost: number | null;
  reason: string;
  job_id: string | null;
  invoice_id: string | null;
  po_id: string | null;
  by: string;
  at: string;
  op_key: string;
};
export type Supplier = { name: string; contact: string; phone: string; email: string; address: string; notes: string; active: boolean };

export const PO_STATUSES = ["brouillon", "commandee", "partielle", "recue", "annulee"] as const;
export type PoStatus = (typeof PO_STATUSES)[number];
export const PO_STATUS_LABELS: Record<PoStatus, string> = { brouillon: "Brouillon", commandee: "Commandée", partielle: "Partiellement reçue", recue: "Reçue", annulee: "Annulée" };
export type PoLine = { id: string; part_id: string; qty: number; received_qty: number; unit_cost: number | null };
export type Po = {
  number: string;
  supplier_id: string;
  lines: PoLine[];
  extra_costs: number;
  note: string;
  status: PoStatus;
  history: HistoryEntry[];
  receptions: { at: string; by: string; lines: { part_id: string; qty: number; unit_cost: number | null }[]; extra_costs: number; op_key: string }[];
};

// ---------- Bureau, salle de repos ----------

export const EXPENSE_CATEGORIES = ["Achats de pièces", "Loyer", "Électricité / eau", "Salaires", "Outillage", "Entretien", "Fournitures", "Transport", "Taxes", "Autre"] as const;
export type Expense = {
  date: string;
  category: string;
  amount: number;
  description: string;
  zone: "garage" | "salle_repos";
  reference: string;
  source: { type: "po" | "supply" | "task"; id: string } | null;
  deleted: { at: string; by: string; reason: string } | null;
  idem: string;
};
export type TimeEntry = { job_id: string; mechanic_id: string; started_at: string | null; ended_at: string | null; minutes: number | null; date: string; note: string; by: string };
export type ToolIssue = { name: string; problem: "endommage" | "manquant"; note: string; status: "ouvert" | "resolu"; reported_by: string; at: string; resolved_by: string | null; resolved_at: string | null };

export const TASK_STATUSES = ["a_faire", "en_cours", "fait", "annule"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { a_faire: "À faire", en_cours: "En cours", fait: "Terminée", annule: "Annulée" };
export const TASK_KINDS = ["nettoyage", "reparation", "entretien", "autre"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_KIND_LABELS: Record<TaskKind, string> = { nettoyage: "Nettoyage", reparation: "Réparation", entretien: "Entretien", autre: "Autre" };
export type Task = {
  zone: "salle_repos" | "garage";
  kind: TaskKind;
  title: string;
  description: string;
  assignee_id: string | null;
  due: string | null;
  status: TaskStatus;
  done_at: string | null;
  cost: number | null;
  equipment_id: string | null;
  history: HistoryEntry[];
  created_by: string;
};
export const EQUIP_CONDITIONS = ["bon", "use", "endommage", "panne"] as const;
export type EquipCondition = (typeof EQUIP_CONDITIONS)[number];
export const EQUIP_CONDITION_LABELS: Record<EquipCondition, string> = { bon: "Bon état", use: "Usé", endommage: "Endommagé", panne: "En panne" };
export type Equip = { name: string; qty: number; condition: EquipCondition; notes: string };
export type Supply = { name: string; unit: string; qty: number; min_qty: number; last_cost: number | null; op_keys: string[] };
export type SupplyMove = { supply_id: string; qty: number; balance_after: number; reason: string; cost: number | null; by: string; at: string; op_key: string };
export type Locker = { number: string; assignee_id: string | null; status: "libre" | "attribue" | "hors_service"; note: string };
export type Settings = { capacity: number | null; seats: number | null; rules: { id: string; text: string }[] };

export type GarageData = { [K in Col]: Doc[] };
export const emptyData = (): GarageData => Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as GarageData;

// ---------- Calculs purs ----------

export const today = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
};
export const round2 = (n: number) => Math.round(n * 100) / 100;

export function quoteTotals(lines: Pick<QuoteLine, "kind" | "qty" | "unit_price">[]) {
  let parts = 0;
  let labour = 0;
  for (const l of lines) {
    const t = Math.round(l.qty * l.unit_price);
    if (l.kind === "piece") parts += t;
    else labour += t;
  }
  return { total_parts: parts, total_labour: labour, total: parts + labour };
}

export function invoiceStatus(total: number, paid: number, cancelled: boolean): InvoiceStatus {
  if (cancelled) return "annulee";
  if (paid <= 0) return "impayee";
  return paid >= total ? "payee" : "partielle";
}
export const balance = (inv: Pick<Invoice, "total" | "paid" | "cancelled">) => (inv.cancelled ? 0 : Math.max(0, inv.total - inv.paid));

/** Intervention en retard : date de fin prévue dépassée et véhicule pas encore prêt. */
export function isLate(job: Job, now = new Date()): boolean {
  return Boolean(job.planned_end) && job.planned_end! < today(now) && ["attente", "diagnostic", "reparation", "controle"].includes(job.status);
}

export function acceptedQuote(quotes: Doc[], jobId: string): Doc<Quote> | undefined {
  return (quotes as Doc<Quote>[]).find((q) => q.data.job_id === jobId && q.data.status === "accepte");
}

/** Vérifie si une intervention peut passer en réparation (devis accepté exigé si demandé). */
export function canStartRepair(job: Job, jobId: string, quotes: Doc[]): { ok: boolean; reason?: string } {
  if (!job.requires_quote) return { ok: true };
  return acceptedQuote(quotes, jobId) ? { ok: true } : { ok: false, reason: "Les travaux soumis à devis ne peuvent démarrer qu'après l'accord du client enregistré sur un devis." };
}

/** Liste de vérification adaptée aux travaux : un point par travail et par pièce, plus les contrôles généraux. */
export function defaultChecklist(job: Job): QcItem[] {
  const items = [
    ...job.labour.map((l) => `Travail réalisé : ${l.label}`),
    ...job.parts.map((p) => `Pièce montée : ${p.label} × ${p.qty}`),
    ...(job.requested_work ? [`Demande du client traitée : ${job.requested_work.slice(0, 80)}`] : []),
    "Essai du véhicule effectué",
    "Aucune fuite ni voyant d'alerte",
    "Niveaux vérifiés",
    "Véhicule propre, outils et protections retirés",
  ];
  return [...new Set(items)].slice(0, 30).map((label) => ({ label, ok: false, note: "" }));
}

export function minutesLogged(times: Doc[], jobId?: string): number {
  return (times as Doc<TimeEntry>[]).filter((t) => !jobId || t.data.job_id === jobId).reduce((a, t) => a + (t.data.minutes ?? 0), 0);
}

/** Valorisation du stock au dernier prix d'achat enregistré ; les pièces sans prix sont listées à part. */
export function stockValue(parts: Doc[]): { value: number; unpriced: Doc<Part>[]; method: string } {
  let value = 0;
  const unpriced: Doc<Part>[] = [];
  for (const p of parts as Doc<Part>[]) {
    if (!p.data.active || p.data.qty <= 0) continue;
    if (p.data.buy_price === null) unpriced.push(p);
    else value += p.data.qty * p.data.buy_price;
  }
  return { value: Math.round(value), unpriced, method: "Quantité en stock × dernier prix d'achat enregistré (pièces actives)." };
}

export function stockAlerts(parts: Doc[]) {
  const active = (parts as Doc<Part>[]).filter((p) => p.data.active);
  return {
    out: active.filter((p) => p.data.qty <= 0),
    low: active.filter((p) => p.data.qty > 0 && p.data.qty <= p.data.min_qty),
  };
}

/** Quantité proposée pour revenir au double du seuil minimum (simple suggestion, aucune commande créée). */
export const suggestedQty = (p: Part) => Math.max(1, Math.ceil(Math.max(p.min_qty, 1) * 2 - p.qty));

export type Period = { from: string; to: string };
export const inPeriod = (date: string | null | undefined, p: Period) => Boolean(date) && date!.slice(0, 10) >= p.from && date!.slice(0, 10) <= p.to;

export function periodPreset(kind: "today" | "week" | "month" | "year", now = new Date()): Period {
  const t = today(now);
  const d = new Date(now);
  if (kind === "today") return { from: t, to: t };
  if (kind === "week") {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return { from: today(d), to: t };
  }
  if (kind === "month") return { from: `${t.slice(0, 7)}-01`, to: t };
  return { from: `${t.slice(0, 4)}-01-01`, to: t };
}

/** Finances d'une période : seuls les paiements réellement enregistrés comptent comme recettes. */
export function finances(d: GarageData, p: Period) {
  const payments = (d.payment as Doc<Payment>[]).filter((x) => !x.data.cancelled && inPeriod(x.data.received_at, p));
  const expenses = (d.expense as Doc<Expense>[]).filter((x) => !x.data.deleted && inPeriod(x.data.date, p));
  const invoices = (d.invoice as Doc<Invoice>[]).filter((x) => !x.data.cancelled && inPeriod(x.data.issued_at, p));
  const receipts = payments.reduce((a, x) => a + x.data.amount, 0);
  const spent = expenses.reduce((a, x) => a + x.data.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.data.category, (byCategory.get(e.data.category) ?? 0) + e.data.amount);
  const allOpen = (d.invoice as Doc<Invoice>[]).filter((x) => !x.data.cancelled && x.data.status !== "payee");
  return {
    receipts,
    expenses: spent,
    profit: receipts - spent,
    payments,
    expenseRows: expenses,
    byCategory: [...byCategory.entries()].sort((a, b) => b[1] - a[1]),
    invoiced: invoices.reduce((a, x) => a + x.data.total, 0),
    invoiceCounts: {
      payee: invoices.filter((x) => x.data.status === "payee").length,
      partielle: invoices.filter((x) => x.data.status === "partielle").length,
      impayee: invoices.filter((x) => x.data.status === "impayee").length,
    },
    /** Reste à encaisser sur toutes les factures ouvertes (toutes périodes confondues). */
    outstanding: allOpen.reduce((a, x) => a + balance(x.data), 0),
    openInvoices: allOpen,
  };
}

/** Date à laquelle une intervention est passée à un statut (dernier passage). */
export function reachedAt(job: Job, status: JobStatus): string | null {
  for (let i = job.history.length - 1; i >= 0; i--) if (job.history[i]!.to === status) return job.history[i]!.at;
  return null;
}

/** Rapport d'activité : véhicules réparés, coûts des pièces et main-d'œuvre enregistrés. */
export function activityReport(d: GarageData, p: Period) {
  const jobs = d.job as Doc<Job>[];
  const repaired = jobs.filter((j) => inPeriod(reachedAt(j.data, "pret"), p));
  const delivered = jobs.filter((j) => inPeriod(j.data.delivered_at, p));
  const moves = (d.move as Doc<Move>[]).filter((m) => inPeriod(m.data.at, p));
  const used = moves.filter((m) => m.data.type === "utilisation" || m.data.type === "vente");
  const partsCost = used.reduce((a, m) => a + (m.data.unit_cost ?? 0) * Math.abs(m.data.qty), 0);
  const partsWithoutCost = used.filter((m) => m.data.unit_cost === null).length;
  const invoices = (d.invoice as Doc<Invoice>[]).filter((x) => !x.data.cancelled && inPeriod(x.data.issued_at, p));
  const usage = new Map<string, number>();
  for (const m of used) usage.set(m.data.part_id, (usage.get(m.data.part_id) ?? 0) + Math.abs(m.data.qty));
  return {
    repaired,
    delivered,
    partsCost: Math.round(partsCost),
    partsWithoutCost,
    partsBilled: invoices.reduce((a, x) => a + x.data.total_parts, 0),
    labourBilled: invoices.reduce((a, x) => a + x.data.total_labour, 0),
    minutes: (d.time as Doc<TimeEntry>[]).filter((t) => inPeriod(t.data.date, p)).reduce((a, t) => a + (t.data.minutes ?? 0), 0),
    topParts: [...usage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10),
  };
}

/** Pièces sans aucun mouvement depuis `days` jours (création comprise). */
export function dormantParts(d: GarageData, days: number, now = new Date()) {
  const limit = new Date(now.getTime() - days * 86400000).toISOString();
  const last = new Map<string, string>();
  for (const m of d.move as Doc<Move>[]) if ((last.get(m.data.part_id) ?? "") < m.data.at) last.set(m.data.part_id, m.data.at);
  return (d.part as Doc<Part>[]).filter((p) => p.data.active && (last.get(p.id) ?? p.created_at) < limit);
}

/** Charge de travail par membre : interventions ouvertes, terminées, temps prévu et réel. Aucun classement. */
export function workload(d: GarageData, memberIds: string[], p: Period) {
  const jobs = d.job as Doc<Job>[];
  return memberIds.map((id) => {
    const mine = jobs.filter((j) => j.data.mechanic_id === id);
    const open = mine.filter((j) => PRESENT.includes(j.data.status) && j.data.status !== "pret");
    const done = mine.filter((j) => inPeriod(reachedAt(j.data, "pret"), p));
    const minutes = (d.time as Doc<TimeEntry>[]).filter((t) => t.data.mechanic_id === id && inPeriod(t.data.date, p)).reduce((a, t) => a + (t.data.minutes ?? 0), 0);
    const planned = done.reduce((a, j) => a + (j.data.planned_minutes ?? 0), 0);
    const plannedKnown = done.filter((j) => j.data.planned_minutes !== null).length;
    return { id, open, done, minutes, planned, plannedKnown, late: open.filter((j) => isLate(j.data)) };
  });
}

/** Indicateurs du tableau de bord du bureau, tous calculés sur les fiches enregistrées. */
export function dashboard(d: GarageData, now = new Date()) {
  const jobs = d.job as Doc<Job>[];
  const present = jobs.filter((j) => PRESENT.includes(j.data.status));
  const stock = stockAlerts(d.part);
  return {
    present: present.length,
    inRepair: jobs.filter((j) => IN_WORKSHOP.includes(j.data.status)).length,
    ready: jobs.filter((j) => j.data.status === "pret").length,
    waiting: jobs.filter((j) => j.data.status === "attente").length,
    pendingQuotes: (d.quote as Doc<Quote>[]).filter((q) => q.data.status === "envoye"),
    draftQuotes: (d.quote as Doc<Quote>[]).filter((q) => q.data.status === "brouillon"),
    late: jobs.filter((j) => isLate(j.data, now)),
    urgent: present.filter((j) => j.data.priority === "urgente" && j.data.status !== "pret"),
    missing: present.flatMap((j) => j.data.missing.filter((m) => m.status !== "recue").map((m) => ({ job: j, m }))),
    stockOut: stock.out,
    stockLow: stock.low,
    unpaid: (d.invoice as Doc<Invoice>[]).filter((x) => !x.data.cancelled && x.data.status !== "payee"),
    openTools: (d.tool as Doc<ToolIssue>[]).filter((t) => t.data.status === "ouvert"),
    openTasks: (d.task as Doc<Task>[]).filter((t) => t.data.status === "a_faire" || t.data.status === "en_cours"),
    readyNotDelivered: jobs.filter((j) => j.data.status === "pret"),
  };
}

export const fmtMoney = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
export const fmtQty = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
export const fmtDate = (s: string | null | undefined) => (s ? new Date(s.length === 10 ? `${s}T12:00:00` : s).toLocaleDateString("fr-FR") : "—");
export const fmtDateTime = (s: string | null | undefined) => (s ? new Date(s).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const fmtMinutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);
export const normalizePlate = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
export const searchable = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
