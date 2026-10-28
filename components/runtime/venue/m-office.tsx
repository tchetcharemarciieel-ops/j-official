"use client";

import { AlertTriangle, BedDouble, CalendarDays, ChefHat, ClipboardList, Pencil, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  DAYS,
  EXPENSE_CATEGORIES,
  LEVEL,
  coldLimits,
  expiryState,
  finances,
  fmtDate,
  fmtMoney,
  inPeriod,
  occupancy,
  orderDue,
  periodPreset,
  roomState,
  series,
  stayDue,
  stockAlerts,
  taskLate,
  taskOpen,
  today,
  type Doc,
  type Expense,
  type Item,
  type Lot,
  type Order,
  type Payment,
  type Room,
  type Shift,
  type Staff,
  type Stay,
  type Task,
  type Temp,
} from "@/lib/venue/model";
import { ROLE_LABELS } from "@/lib/spec";
import { Btn, Card, Empty, Field, Modal, PeriodPicker, Pill, ReadOnlyNote, Stat, Tabs, docs, downloadCsv, inp, isMgr, useIdem, useV } from "./ui";
import { TasksView } from "./m-space";

// ---------- Tableau de bord ----------

export function Dashboard() {
  const { v, level, kind, goZone } = useV();
  const t = today();
  const d = v.data;
  const f = finances(d, periodPreset("today"));
  const month = finances(d, periodPreset("month"));
  const orders = docs<Order>(d.order).filter((o) => o.data.status !== "annulee" && o.created_at.slice(0, 10) === t);
  const open = docs<Order>(d.order).filter((o) => ["en_attente", "en_preparation", "prete"].includes(o.data.status));
  const pays = docs<Payment>(d.payment);
  const unpaid = docs<Order>(d.order).filter((o) => o.data.status !== "annulee" && orderDue(o.data, pays, o.id) > 0);
  const alerts = stockAlerts(docs<Item>(d.item));
  const tasks = docs<Task>(d.task).filter((x) => taskOpen(x.data));
  const late = tasks.filter((x) => taskLate(x.data));
  const temps = docs<Temp>(d.temp).filter((x) => x.data.out && !x.data.treated);
  const rooms = docs<Room>(d.room);
  const stays = docs<Stay>(d.stay);
  const states = rooms.map((r) => roomState(r, stays));
  const arrivals = stays.filter((s) => s.data.status === "reservee" && s.data.arrival === t);
  const departures = stays.filter((s) => s.data.status === "arrivee" && s.data.departure <= t);
  const empty = orders.length === 0 && pays.length === 0 && d.item.length === 0 && rooms.length === 0 && tasks.length === 0;
  return (
    <div className="space-y-3">
      {empty && <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Aucune donnée enregistrée pour l&apos;instant : les indicateurs s&apos;afficheront dès les premières commandes, ventes et saisies. Rien n&apos;est estimé à l&apos;avance.</p>}
      {kind === "hotel" && (
        <Card title="Chambres" actions={<Btn small kind="ghost" onClick={() => goZone("reception", "disponibilite")}>Disponibilité</Btn>}>
          {rooms.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune chambre enregistrée.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Disponibles" value={states.filter((s) => s === "disponible").length} tone="green" />
              <Stat label="Occupées" value={states.filter((s) => s === "occupee").length} tone="blue" />
              <Stat label="À nettoyer" value={states.filter((s) => s === "a_nettoyer").length} tone="amber" />
              <Stat label="Maintenance" value={states.filter((s) => s === "maintenance").length} tone={states.includes("maintenance") ? "red" : "slate"} />
            </div>
          )}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Stat label="Arrivées prévues aujourd'hui" value={arrivals.length} onClick={() => goZone("reception", "arrivees")} />
            <Stat label="Départs prévus" value={departures.length} onClick={() => goZone("reception", "arrivees")} />
          </div>
        </Card>
      )}
      <Card title={kind === "hotel" ? "Restaurant (aujourd'hui)" : "Aujourd'hui"}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Commandes" value={orders.length} />
          <Stat label="Ventes (commandes)" value={fmtMoney(orders.reduce((a, o) => a + o.data.total, 0))} />
          <Stat label="En cours en cuisine" value={open.length} tone={open.length ? "blue" : "slate"} />
          <Stat label="Commandes non soldées" value={unpaid.length} tone={unpaid.length ? "amber" : "slate"} />
        </div>
      </Card>
      {level >= LEVEL.manager && (
        <Card title="Encaissements confirmés">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Aujourd'hui" value={fmtMoney(f.receipts)} tone="green" />
            <Stat label="Ce mois" value={fmtMoney(month.receipts)} tone="green" />
            <Stat label="Dépenses du mois" value={fmtMoney(month.spent)} tone="red" />
            <Stat label="Bénéfice estimé du mois" value={fmtMoney(month.profit)} tone={month.profit >= 0 ? "green" : "red"} />
          </div>
          {kind === "hotel" && <p className="mt-2 text-xs text-slate-500">Ce mois : hébergement {fmtMoney(month.lodging)} · restaurant (paiements directs) {fmtMoney(month.restaurant)}.</p>}
        </Card>
      )}
      <Card title="Alertes et tâches">
        <ul className="space-y-1.5 text-sm">
          <AlertRow n={alerts.out.length + alerts.low.length} text="produit(s) sous le seuil de stock" onClick={() => goZone("stock", "alertes")} />
          <AlertRow n={temps.length} text="relevé(s) de température hors seuil" onClick={() => goZone(kind === "hotel" ? "cuisine" : "froid", kind === "hotel" ? "hygiene" : "alertes")} />
          <AlertRow n={late.length} text="tâche(s) en retard" onClick={() => goZone("bureau", "taches")} />
          <AlertRow n={tasks.filter((x) => x.data.kind === "reparation" || x.data.kind === "signalement").length} text="panne(s) ou signalement(s) à traiter" onClick={() => goZone("bureau", "taches")} />
          <AlertRow n={f.pendingCount} text="paiement(s) en attente de confirmation" onClick={() => goZone(kind === "hotel" ? "reception" : "caisse", kind === "hotel" ? "paiements" : "paiement")} />
        </ul>
        {alerts.out.length + alerts.low.length + temps.length + late.length + f.pendingCount === 0 && <p className="text-sm text-slate-500">Aucune alerte en cours.</p>}
      </Card>
    </div>
  );
}

function AlertRow({ n, text, onClick }: { n: number; text: string; onClick: () => void }) {
  if (!n) return null;
  return (
    <li>
      <button type="button" onClick={onClick} className="tab-press flex w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2 text-left hover:bg-amber-50">
        <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
        <span><strong>{n}</strong> {text}</span>
      </button>
    </li>
  );
}

// ---------- Personnel ----------

export function StaffView() {
  const { v, level, act, projectId } = useV();
  const [edit, setEdit] = useState<Doc<Staff> | "new" | null>(null);
  const [inactive, setInactive] = useState(false);
  const staff = docs<Staff>(v.data.staff).filter((s) => inactive || s.data.active).sort((a, b) => a.data.name.localeCompare(b.data.name));
  return (
    <div className="space-y-3">
      <ReadOnlyNote need={2} />
      <Card title="Comptes de l'équipe sur le logiciel">
        <ul className="space-y-1 text-sm">{v.members.map((m) => <li key={m.id} className="flex justify-between"><span>{m.name}</span><Pill>{ROLE_LABELS[m.role]}</Pill></li>)}</ul>
        <p className="mt-2 text-xs text-slate-500">Les rôles et permissions des comptes (propriétaire, administrateur, gestionnaire, employé, lecture seule) se gèrent dans l&apos;onglet « Équipe » du projet{isMgr(level) && <> : <a className="underline" href={`/projets/${projectId}?onglet=equipe`}>ouvrir</a></>}. Les dépenses et les finances restent réservées aux gérants.</p>
      </Card>
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Employés et horaires</h4>
        {isMgr(level) && <Btn small onClick={() => setEdit("new")}><UserPlus className="h-3.5 w-3.5" aria-hidden />Ajouter un employé</Btn>}
      </div>
      {staff.length === 0 ? (
        <Empty text="Aucun employé enregistré." icon={Users} />
      ) : (
        <ul className="space-y-1.5">
          {staff.map((s) => (
            <li key={s.id} className={`rounded-xl border bg-white p-2.5 text-sm ${s.data.active ? "border-slate-200" : "border-dashed opacity-60"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{s.data.name} <span className="font-normal text-slate-500">· {s.data.role}</span></p>
                  <p className="text-xs text-slate-500">{s.data.phone || "Pas de téléphone"}{s.data.member_id && " · a un compte"}</p>
                  {s.data.schedule.length > 0 ? <p className="mt-0.5 text-xs text-slate-600">{s.data.schedule.map((x) => `${DAYS[x.day]!.slice(0, 3)} ${x.start}-${x.end}`).join(" · ")}</p> : <p className="mt-0.5 text-xs text-slate-400">Horaires non définis</p>}
                </div>
                {isMgr(level) && (
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setEdit(s)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label={`Modifier ${s.data.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                    <Btn small kind="ghost" onClick={() => act("staff.toggle", { id: s.id, active: !s.data.active }, s.data.active ? { confirm: `Désactiver ${s.data.name} ?` } : undefined)}>{s.data.active ? "Désactiver" : "Réactiver"}</Btn>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {isMgr(level) && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} />Afficher les employés désactivés</label>}
      <WeekPlanning staff={docs<Staff>(v.data.staff).filter((s) => s.data.active)} />
      {edit && <StaffForm staff={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function WeekPlanning({ staff }: { staff: Doc<Staff>[] }) {
  const withShifts = staff.filter((s) => s.data.schedule.length);
  if (!withShifts.length) return null;
  return (
    <Card title="Planning de la semaine">
      <div className="space-y-1.5 text-xs">
        {DAYS.map((d, i) => {
          const on = withShifts.flatMap((s) => s.data.schedule.filter((x) => x.day === i).map((x) => `${s.data.name} ${x.start}-${x.end}`));
          return <p key={d}><span className="inline-block w-20 font-semibold">{d}</span>{on.length ? on.join(" · ") : <span className="text-slate-400">personne</span>}</p>;
        })}
      </div>
    </Card>
  );
}

function StaffForm({ staff, onClose }: { staff: Doc<Staff> | null; onClose: () => void }) {
  const { v, act } = useV();
  const d = staff?.data;
  const [f, setF] = useState({ name: d?.name ?? "", role: d?.role ?? "", phone: d?.phone ?? "", member_id: d?.member_id ?? "", notes: d?.notes ?? "" });
  const [shifts, setShifts] = useState<Shift[]>(d?.schedule ?? []);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={staff ? `Modifier ${d!.name}` : "Nouvel employé"} onClose={onClose} wide>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("staff.save", { id: staff?.id, ...f, member_id: f.member_id || null, schedule: shifts });
          setBusy(false);
          if (r) onClose();
        }}
      >
        <Field label="Nom"><input className={inp} required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Rôle / poste" hint="Ex. : cuisinier, serveuse, réceptionniste"><input className={inp} required maxLength={60} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
        <Field label="Téléphone"><input className={inp} type="tel" maxLength={40} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Compte sur le logiciel (facultatif)"><select className={inp} value={f.member_id} onChange={(e) => setF({ ...f, member_id: e.target.value })}><option value="">Aucun</option>{v.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <div className="space-y-2 sm:col-span-2">
          <p className="text-sm font-medium">Horaires</p>
          {shifts.map((s, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <select className={`${inp} w-36`} value={s.day} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, day: Number(e.target.value) } : x)))} aria-label="Jour">{DAYS.map((d2, k) => <option key={d2} value={k}>{d2}</option>)}</select>
              <input type="time" className={`${inp} w-28`} value={s.start} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} aria-label="Début" />
              <input type="time" className={`${inp} w-28`} value={s.end} onChange={(e) => setShifts(shifts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} aria-label="Fin" />
              <button type="button" className="rounded-lg px-2 text-slate-500 hover:bg-slate-100" onClick={() => setShifts(shifts.filter((_, j) => j !== i))} aria-label="Retirer"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </div>
          ))}
          <Btn small kind="soft" onClick={() => setShifts([...shifts, { day: 0, start: "08:00", end: "16:00" }])}><Plus className="h-3.5 w-3.5" aria-hidden />Ajouter un créneau</Btn>
        </div>
        <Field label="Notes" className="sm:col-span-2"><input className={inp} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Dépenses et bénéfices ----------

export function FinanceView() {
  const { v, level, act, kind } = useV();
  const [period, setPeriod] = useState(periodPreset("month"));
  const [edit, setEdit] = useState<Doc<Expense> | "new" | null>(null);
  if (!isMgr(level)) return <ReadOnlyNote need={2} />;
  const f = finances(v.data, period);
  const pays = docs<Payment>(v.data.payment);
  const openOrders = docs<Order>(v.data.order).filter((o) => o.data.status !== "annulee" && orderDue(o.data, pays, o.id) > 0);
  const openStays = docs<Stay>(v.data.stay).filter((s) => s.data.status !== "annulee" && s.data.status !== "absent" && stayDue(s.data, pays, s.id) > 0);
  const toCollect = openOrders.reduce((a, o) => a + orderDue(o.data, pays, o.id), 0) + openStays.reduce((a, s) => a + stayDue(s.data, pays, s.id), 0);
  return (
    <div className="space-y-3">
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Recettes encaissées" value={fmtMoney(f.receipts)} tone="green" />
        <Stat label="Dépenses" value={fmtMoney(f.spent)} tone="red" />
        <Stat label="Bénéfice estimé" value={fmtMoney(f.profit)} tone={f.profit >= 0 ? "green" : "red"} />
        <Stat label="Reste à encaisser (tout)" value={fmtMoney(toCollect)} tone={toCollect ? "amber" : "slate"} />
      </div>
      {kind === "hotel" && (
        <Card title="Recettes par activité">
          <ul className="space-y-1 text-sm">
            <li className="flex justify-between"><span>Hébergement (paiements des séjours)</span><span className="font-medium">{fmtMoney(f.lodging)}</span></li>
            <li className="flex justify-between"><span>Restaurant (paiements directs)</span><span className="font-medium">{fmtMoney(f.restaurant)}</span></li>
            <li className="flex justify-between text-slate-500"><span>Consommations ajoutées aux notes de chambre</span><span>{fmtMoney(f.roomCharged)}</span></li>
          </ul>
          <p className="mt-1 text-xs text-slate-500">Les consommations sur note de chambre sont encaissées avec le séjour : elles ne sont pas comptées une deuxième fois.</p>
        </Card>
      )}
      <p className="text-xs text-slate-500">Bénéfice estimé = recettes confirmées − dépenses enregistrées sur la période. Il ne tient pas compte des achats non saisis, des factures impayées ni de la valeur du stock. Une facture impayée n&apos;est jamais comptée comme recette.</p>
      <Card title="Dépenses" actions={<><Btn small onClick={() => setEdit("new")}><Plus className="h-3.5 w-3.5" aria-hidden />Dépense</Btn>{f.expenses.length > 0 && <Btn small kind="ghost" onClick={() => downloadCsv("depenses.csv", ["Date", "Catégorie", "Montant", "Description", "Référence"], f.expenses.map((e) => [e.data.date, e.data.category, e.data.amount, e.data.description, e.data.reference]))}>Exporter</Btn>}</>}>
        {f.byCategory.length > 0 && <ul className="mb-2 space-y-0.5 text-xs">{f.byCategory.map(([c, a]) => <li key={c} className="flex justify-between"><span>{c}</span><span>{fmtMoney(a)}</span></li>)}</ul>}
        {f.expenses.length === 0 ? (
          <Empty text="Aucune dépense sur la période." />
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {f.expenses.sort((a, b) => b.data.date.localeCompare(a.data.date)).map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="font-medium">{e.data.description}</p>
                  <p className="text-xs text-slate-500">{fmtDate(e.data.date)} · {e.data.category}{e.data.reference && ` · ${e.data.reference}`}{e.data.proof && " · justificatif joint"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="font-semibold">{fmtMoney(e.data.amount)}</span>
                  <button type="button" onClick={() => setEdit(e)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                  <button type="button" onClick={() => act("expense.delete", { id: e.id }, { confirm: "Retirer cette dépense des totaux ? Elle reste dans l'historique." })} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {(openOrders.length > 0 || openStays.length > 0) && (
        <Card title="À encaisser">
          <ul className="space-y-1 text-sm">
            {openStays.map((s) => <li key={s.id} className="flex justify-between"><span>Séjour {s.data.ref}</span><span>{fmtMoney(stayDue(s.data, pays, s.id))}</span></li>)}
            {openOrders.slice(0, 20).map((o) => <li key={o.id} className="flex justify-between"><span>Commande {o.data.number}</span><span>{fmtMoney(orderDue(o.data, pays, o.id))}</span></li>)}
          </ul>
        </Card>
      )}
      {edit && <ExpenseForm expense={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function ExpenseForm({ expense, onClose }: { expense: Doc<Expense> | null; onClose: () => void }) {
  const { act } = useV();
  const [key, renew] = useIdem();
  const d = expense?.data;
  const [f, setF] = useState({ date: d?.date ?? today(), category: d?.category ?? EXPENSE_CATEGORIES[0], amount: d ? String(d.amount) : "", description: d?.description ?? "", reference: d?.reference ?? "" });
  const [proof, setProof] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal title={expense ? "Modifier la dépense" : "Nouvelle dépense"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("expense.save", { id: expense?.id, ...f, amount: Number(f.amount.replace(/\s/g, "")), proof, idem: key });
          setBusy(false);
          if (r) {
            renew();
            onClose();
          }
        }}
      >
        <Field label="Date"><input type="date" className={inp} required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Montant (FCFA)"><input className={inp} required inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Catégorie"><select className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Référence (facture, reçu)"><input className={inp} maxLength={120} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Description" className="sm:col-span-2"><input className={inp} required maxLength={300} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Justificatif (photo, facultatif)" className="sm:col-span-2">
          <input
            type="file"
            accept="image/*"
            className="text-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              setErr("");
              if (!file) return setProof(null);
              try {
                setProof(await compressImage(file));
              } catch (x) {
                setErr(x instanceof Error ? x.message : "Image illisible.");
              }
            }}
          />
          {err && <span className="text-xs text-red-600">{err}</span>}
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

/** Réduit une photo (≈ 1280 px, JPEG) pour l'enregistrer dans la base sans la surcharger. */
export async function compressImage(file: File, max = 1280): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Ce fichier n'est pas une image.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Image illisible."));
      i.src = url;
    });
    for (const [side, q] of [[max, 0.8], [1024, 0.7], [800, 0.6], [640, 0.55]] as const) {
      const k = Math.min(1, side / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length <= 440_000) return out;
    }
    throw new Error("Photo trop lourde, même compressée.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Couleur moyenne d'une image (référence visuelle pour teinter la zone du plan). */
export async function averageColor(dataUrl: string): Promise<string | null> {
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });
    const c = document.createElement("canvas");
    c.width = 24;
    c.height = 24;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0, 24, 24);
    const px = g.getImageData(0, 0, 24, 24).data;
    let r = 0, gg = 0, b = 0;
    for (let i = 0; i < px.length; i += 4) {
      r += px[i]!;
      gg += px[i + 1]!;
      b += px[i + 2]!;
    }
    const n = px.length / 4;
    return `#${[r, gg, b].map((x) => Math.round(x / n).toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

// ---------- Rapports et statistiques ----------

export function ReportsView() {
  const { v, level, kind } = useV();
  const [period, setPeriod] = useState(periodPreset("month"));
  const [step, setStep] = useState<"jour" | "semaine" | "mois">("jour");
  const rows = useMemo(() => series(v.data, period, step), [v.data, period, step]);
  const f = finances(v.data, period);
  const orders = f.orders;
  const top = useMemo(() => {
    const m = new Map<string, { qty: number; total: number }>();
    for (const o of orders) for (const l of o.data.lines) {
      const r = m.get(l.label) ?? { qty: 0, total: 0 };
      r.qty += l.qty;
      r.total += l.qty * l.unit_price;
      m.set(l.label, r);
    }
    return [...m.entries()].sort((a, b) => b[1].qty - a[1].qty).slice(0, 10);
  }, [orders]);
  const occ = kind === "hotel" ? occupancy(docs<Room>(v.data.room), docs<Stay>(v.data.stay), period) : null;
  const mgr = isMgr(level);
  return (
    <div className="space-y-3">
      <PeriodPicker value={period} onChange={setPeriod} />
      <Tabs label="Regroupement" value={step} onChange={setStep} tabs={[{ id: "jour", label: "Par jour" }, { id: "semaine", label: "Par semaine" }, { id: "mois", label: "Par mois" }]} />
      {occ && (
        <Card title="Hébergement">
          {occ.available === 0 ? <p className="text-sm text-slate-500">Aucune chambre enregistrée.</p> : (
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Taux d'occupation" value={occ.rate === null ? "—" : `${occ.rate} %`} tone="blue" />
              <Stat label="Nuits vendues" value={occ.sold} />
              <Stat label="Nuits disponibles" value={occ.available} />
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500">Calculé sur les séjours enregistrés (réservés, en cours ou terminés), hors annulations.</p>
        </Card>
      )}
      <Card title={kind === "hotel" ? "Restaurant" : "Ventes"}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Commandes" value={orders.length} />
          <Stat label="Montant commandé" value={fmtMoney(orders.reduce((a, o) => a + o.data.total, 0))} />
        </div>
        {top.length > 0 && (
          <>
            <p className="mt-2 text-xs font-semibold">Articles les plus vendus</p>
            <ul className="space-y-0.5 text-xs">{top.map(([n, r]) => <li key={n} className="flex justify-between"><span>{n}</span><span>{r.qty} · {fmtMoney(r.total)}</span></li>)}</ul>
          </>
        )}
      </Card>
      {mgr ? (
        <Card title="Résultats" actions={rows.length > 0 ? <Btn small kind="ghost" onClick={() => downloadCsv(`rapport-${step}.csv`, ["Période", "Commandes", "Montant commandé", "Recettes confirmées", "Dépenses", "Bénéfice estimé"], rows.map((r) => [r.key, r.orders, r.ordersTotal, r.receipts, r.expenses, r.profit]))}>Exporter</Btn> : undefined}>
          {rows.length === 0 ? (
            <Empty text="Aucune donnée enregistrée sur la période." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-1">{step === "jour" ? "Jour" : step === "semaine" ? "Semaine du" : "Mois"}</th><th className="py-1 text-right">Commandes</th><th className="py-1 text-right">Recettes</th><th className="py-1 text-right">Dépenses</th><th className="py-1 text-right">Bénéfice</th></tr></thead>
                <tbody>{rows.map((r) => <tr key={r.key} className="border-b border-slate-100"><td className="py-1">{step === "mois" ? r.key : fmtDate(r.key)}</td><td className="py-1 text-right">{r.orders}</td><td className="py-1 text-right">{fmtMoney(r.receipts)}</td><td className="py-1 text-right">{fmtMoney(r.expenses)}</td><td className={`py-1 text-right font-medium ${r.profit < 0 ? "text-red-600" : ""}`}>{fmtMoney(r.profit)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500">Recettes = paiements confirmés ; dépenses = dépenses enregistrées. Aucun chiffre n&apos;est estimé à l&apos;avance.</p>
        </Card>
      ) : (
        <ReadOnlyNote need={2} />
      )}
    </div>
  );
}

// ---------- Tâches et alertes centralisées ----------

export function TasksAlerts() {
  const { v, level, act, name, kind, settings } = useV();
  const temps = docs<Temp>(v.data.temp).filter((t) => t.data.out && !t.data.treated);
  const lots = docs<Lot>(v.data.lot).filter((l) => !l.data.closed && ["expire", "bientot"].includes(expiryState(l.data, settings.expiry_warn_days)));
  const items = docs<Item>(v.data.item);
  const lim = coldLimits(settings, items);
  return (
    <div className="space-y-3">
      {(temps.length > 0 || lots.length > 0) && (
        <Card title="Alertes de conservation">
          <ul className="space-y-1.5 text-sm">
            {temps.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/50 px-3 py-2">
                <span>{t.data.value} °C ({t.data.zone === "froid" ? "chambre froide" : "cuisine"}) · {t.data.out_reason} · {name(t.data.by)}</span>
                {level >= 1 && <Btn small kind="ghost" onClick={() => act("temp.treat", { id: t.id })}>Marquer traitée</Btn>}
              </li>
            ))}
            {lots.map((l) => <li key={l.id} className="rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">{items.find((i) => i.id === l.data.item_id)?.data.name} · DLC {fmtDate(l.data.expires)}</li>)}
          </ul>
          {!lim.configured && kind === "restaurant" && <p className="mt-1 text-xs text-slate-500">Seuils de la chambre froide non définis.</p>}
        </Card>
      )}
      <TasksView zone="all" title="Toutes les tâches" defaultKind="tache" />
      <p className="text-xs text-slate-500">Les tâches et signalements créés dans chaque zone ({kind === "hotel" ? "chambres, cuisine, restaurant, réception" : "cuisine, salle, toilettes, chambre froide, terrasse"}) sont réunis ici. Une tâche terminée ou annulée reste dans l&apos;historique.</p>
    </div>
  );
}

export const OfficeIcons = { BedDouble, CalendarDays, ChefHat, ClipboardList };
export { inPeriod };
