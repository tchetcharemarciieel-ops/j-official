"use client";

import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Pencil, Plus, Trash2, Users, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import {
  BOOKING_ACTIVE,
  BOOKING_STATUS_LABELS,
  EQUIP_CATEGORY_LABELS,
  EQUIP_CONDITION_LABELS,
  FREQUENCIES,
  FREQUENCY_LABELS,
  TASK_KIND_LABELS,
  TASK_STATUS_LABELS,
  capacity,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtQty,
  stockValue,
  taskLate,
  taskOpen,
  today,
  type Booking,
  type DataZone,
  type Doc,
  type Equip,
  type EquipCategory,
  type Item,
  type Staff,
  type StockZone,
  type Table,
  type TableZone,
  type Task,
  type TaskKind,
} from "@/lib/venue/model";
import { Btn, Card, Empty, Field, MemberSelect, Modal, Pill, ReadOnlyNote, Stat, Tabs, docs, inp, isMgr, numOrEmpty, parseNum, useIdem, useV } from "./ui";

// ---------- Équipements ----------

export function EquipList({ zone, roomId = null, categories, title = "Équipements", hint }: { zone: DataZone; roomId?: string | null; categories: EquipCategory[]; title?: string; hint?: string }) {
  const { v, level, act } = useV();
  const [edit, setEdit] = useState<Doc<Equip> | "new" | null>(null);
  const [report, setReport] = useState<Doc<Equip> | null>(null);
  const list = docs<Equip>(v.data.equip).filter((e) => e.data.zone === zone && (roomId === null || e.data.room_id === roomId) && categories.includes(e.data.category)).sort((a, b) => a.data.name.localeCompare(b.data.name));
  const owned = list.filter((e) => e.data.owned);
  const toBuy = list.filter((e) => !e.data.owned);
  const broken = owned.filter((e) => e.data.condition === "panne" || e.data.condition === "endommage" || e.data.condition === "maintenance");
  const row = (e: Doc<Equip>) => (
    <li key={e.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{e.data.name} <span className="text-slate-500">× {e.data.qty}</span></p>
          <p className="text-xs text-slate-500">{EQUIP_CATEGORY_LABELS[e.data.category]}{e.data.location && ` · ${e.data.location}`}{e.data.unit_price !== null ? ` · ${fmtMoney(e.data.unit_price)} l'unité` : " · prix non renseigné"}{e.data.notes && ` · ${e.data.notes}`}</p>
        </div>
        {e.data.owned ? <Pill tone={e.data.condition === "bon" ? "green" : e.data.condition === "use" ? "slate" : "red"}>{EQUIP_CONDITION_LABELS[e.data.condition]}</Pill> : <Pill tone="blue">À acheter</Pill>}
      </div>
      {level >= 1 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Btn small kind="ghost" onClick={() => setEdit(e)}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</Btn>
          {e.data.owned && e.data.condition !== "panne" && <Btn small kind="ghost" onClick={() => setReport(e)}><AlertTriangle className="h-3.5 w-3.5" aria-hidden />Signaler une panne</Btn>}
          {isMgr(level) && <Btn small kind="danger" onClick={() => act("equip.delete", { id: e.id }, { confirm: `Supprimer « ${e.data.name} » de l'inventaire ?` })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></Btn>}
        </div>
      )}
    </li>
  );
  return (
    <div className="space-y-3">
      <ReadOnlyNote />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Présents" value={owned.reduce((a, e) => a + e.data.qty, 0)} />
        <Stat label="À réparer" value={broken.length} tone={broken.length ? "red" : "slate"} />
        <Stat label="À acheter" value={toBuy.length} tone={toBuy.length ? "blue" : "slate"} />
      </div>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
      {level >= 1 && <Btn onClick={() => setEdit("new")}><Plus className="h-4 w-4" aria-hidden />Ajouter</Btn>}
      {list.length === 0 ? (
        <Empty text={`Aucun élément enregistré dans « ${title} ».`} icon={Wrench} />
      ) : (
        <>
          {owned.length > 0 && <ul className="space-y-1.5">{owned.map(row)}</ul>}
          {toBuy.length > 0 && (
            <Card title="Prévu à l'achat">
              <ul className="space-y-1.5">{toBuy.map(row)}</ul>
            </Card>
          )}
        </>
      )}
      {edit && <EquipForm zone={zone} roomId={roomId} categories={categories} equip={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {report && <ReportForm equip={report} onClose={() => setReport(null)} />}
    </div>
  );
}

function EquipForm({ zone, roomId, categories, equip, onClose }: { zone: DataZone; roomId: string | null; categories: EquipCategory[]; equip: Doc<Equip> | null; onClose: () => void }) {
  const { act } = useV();
  const d = equip?.data;
  const [f, setF] = useState({ name: d?.name ?? "", category: d?.category ?? categories[0]!, qty: String(d?.qty ?? 1), unit_price: numOrEmpty(d?.unit_price), owned: d?.owned ?? true, condition: d?.condition ?? "bon", location: d?.location ?? "", notes: d?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={equip ? `Modifier « ${d!.name} »` : "Nouvel élément"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("equip.save", { id: equip?.id, zone, room_id: roomId, name: f.name, category: f.category, qty: Number(f.qty), unit_price: parseNum(f.unit_price), owned: f.owned, condition: f.condition, location: f.location, notes: f.notes });
          setBusy(false);
          if (r) onClose();
        }}
      >
        <Field label="Nom" className="sm:col-span-2"><input className={inp} required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Catégorie"><select className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as EquipCategory })}>{categories.map((c) => <option key={c} value={c}>{EQUIP_CATEGORY_LABELS[c]}</option>)}</select></Field>
        <Field label="Quantité"><input className={inp} inputMode="numeric" required value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></Field>
        <Field label="Prix unitaire (FCFA)" hint="Prix réel ou devis reçu ; laissez vide si inconnu."><input className={inp} inputMode="numeric" value={f.unit_price} onChange={(e) => setF({ ...f, unit_price: e.target.value })} /></Field>
        <Field label="Situation">
          <select className={inp} value={f.owned ? "oui" : "non"} onChange={(e) => setF({ ...f, owned: e.target.value === "oui" })}>
            <option value="oui">Déjà présent</option>
            <option value="non">À acheter</option>
          </select>
        </Field>
        {f.owned && (
          <Field label="État">
            <select className={inp} value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as typeof f.condition })}>{Object.entries(EQUIP_CONDITION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
        )}
        <Field label="Emplacement"><input className={inp} maxLength={80} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className={inp} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

function ReportForm({ equip, onClose }: { equip: Doc<Equip>; onClose: () => void }) {
  const { act } = useV();
  const [condition, setCondition] = useState<"panne" | "endommage" | "maintenance">("panne");
  const [note, setNote] = useState("");
  return (
    <Modal title={`Signaler : ${equip.data.name}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => (e.preventDefault(), (await act("equip.report", { id: equip.id, condition, note })) && onClose())}>
        <Field label="Problème">
          <select className={inp} value={condition} onChange={(e) => setCondition(e.target.value as typeof condition)}>
            <option value="panne">En panne</option>
            <option value="endommage">Endommagé</option>
            <option value="maintenance">Maintenance nécessaire</option>
          </select>
        </Field>
        <Field label="Description"><textarea className={inp} rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <p className="text-xs text-slate-500">Une tâche de réparation est créée ; elle apparaît aussi au bureau.</p>
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit">Signaler</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Estimation du budget ----------

/**
 * Estimation à partir des seuls prix saisis : équipements (déjà présents et à acheter), tables et
 * chaises, et éventuellement fournitures en stock. Les éléments sans prix sont listés à part.
 */
export function BudgetView({ zone, tableZone, stockZone, categories }: { zone: DataZone; tableZone?: TableZone; stockZone?: StockZone; categories?: EquipCategory[] }) {
  const { v } = useV();
  const equip = docs<Equip>(v.data.equip).filter((e) => e.data.zone === zone && (!categories || categories.includes(e.data.category)));
  const tables = tableZone ? docs<Table>(v.data.table).filter((t) => t.data.active && t.data.zone === tableZone) : [];
  const supplies = stockZone ? docs<Item>(v.data.item).filter((i) => i.data.zone === stockZone) : [];
  const lines: { label: string; qty: number; unit: number | null; group: "present" | "achat" | "fournitures" }[] = [
    ...equip.map((e) => ({ label: e.data.name, qty: e.data.qty, unit: e.data.unit_price, group: (e.data.owned ? "present" : "achat") as "present" | "achat" })),
    ...tables.map((t) => ({ label: `Table ${t.data.number}`, qty: 1, unit: t.data.table_price, group: "present" as const })),
    ...tables.map((t) => ({ label: `Chaises table ${t.data.number}`, qty: t.data.seats, unit: t.data.chair_price, group: "present" as const })),
  ];
  const sum = (g: string) => lines.filter((l) => l.group === g && l.unit !== null).reduce((a, l) => a + l.qty * l.unit!, 0);
  const missing = lines.filter((l) => l.unit === null);
  const sv = stockZone ? stockValue(supplies) : null;
  const present = sum("present");
  const buy = sum("achat");
  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 text-white" style={{ background: "var(--app-primary)" }}>
        <p className="text-xs opacity-80">Estimation totale (prix saisis uniquement)</p>
        <p className="text-3xl font-bold">{fmtMoney(present + buy + (sv?.value ?? 0))}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Déjà en place" value={fmtMoney(present)} />
        <Stat label="Achats prévus" value={fmtMoney(buy)} tone={buy ? "blue" : "slate"} />
        {sv && <Stat label="Fournitures en stock" value={fmtMoney(sv.value)} />}
      </div>
      {lines.length === 0 && !sv?.count ? (
        <Empty text="Rien à estimer pour l'instant : ajoutez les équipements, le mobilier ou les tables avec leur prix." />
      ) : (
        <Card title="Détail">
          <ul className="divide-y divide-slate-100 text-sm">
            {lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-2 py-1.5">
                <span className="min-w-0 truncate">{l.label} <span className="text-slate-500">× {fmtQty(l.qty)}</span>{l.group === "achat" && <span className="ml-1 text-xs text-blue-700">à acheter</span>}</span>
                <span className={l.unit === null ? "text-xs text-amber-700" : "font-medium"}>{l.unit === null ? "prix manquant" : fmtMoney(l.qty * l.unit)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {(missing.length > 0 || (sv && sv.unpriced.length > 0)) && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {missing.length + (sv?.unpriced.length ?? 0)} élément(s) sans prix ne sont pas comptés. Renseignez leur prix réel (facture, devis) pour compléter l&apos;estimation : aucun prix n&apos;est inventé.
        </p>
      )}
    </div>
  );
}

// ---------- Tables et chaises ----------

export function TablesView({ zone }: { zone: TableZone }) {
  const { v, level, act } = useV();
  const [edit, setEdit] = useState<Doc<Table> | "new" | null>(null);
  const [archived, setArchived] = useState(false);
  const tables = docs<Table>(v.data.table).filter((t) => t.data.zone === zone && (archived || t.data.active)).sort((a, b) => a.data.number.localeCompare(b.data.number, "fr", { numeric: true }));
  const cap = capacity(docs<Table>(v.data.table), zone);
  return (
    <div className="space-y-3">
      <ReadOnlyNote need={2} />
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Tables" value={cap.tables} />
        <Stat label="Chaises" value={cap.seats} />
      </div>
      {isMgr(level) && <Btn onClick={() => setEdit("new")}><Plus className="h-4 w-4" aria-hidden />Ajouter une table</Btn>}
      {tables.length === 0 ? (
        <Empty text="Aucune table enregistrée. Ajoutez vos tables avec leur nombre de chaises et leur emplacement." />
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {tables.map((t) => (
            <li key={t.id} className={`rounded-xl border bg-white p-2.5 text-sm ${t.data.active ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">Table {t.data.number}</p>
                  <p className="text-xs text-slate-500">{t.data.seats} chaise(s) · {t.data.shape}{t.data.location && ` · ${t.data.location}`}</p>
                </div>
                {!t.data.active && <Pill>Retirée</Pill>}
              </div>
              {isMgr(level) && (
                <div className="mt-2 flex gap-1.5">
                  <Btn small kind="ghost" onClick={() => setEdit(t)}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</Btn>
                  <Btn small kind="ghost" onClick={() => act("table.toggle", { id: t.id, active: !t.data.active }, t.data.active ? { confirm: `Retirer la table ${t.data.number} ?` } : undefined)}>{t.data.active ? "Retirer" : "Remettre"}</Btn>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {isMgr(level) && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />Afficher les tables retirées</label>}
      {edit && <TableForm zone={zone} table={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function TableForm({ zone, table, onClose }: { zone: TableZone; table: Doc<Table> | null; onClose: () => void }) {
  const { act } = useV();
  const d = table?.data;
  const [f, setF] = useState({ number: d?.number ?? "", seats: String(d?.seats ?? 4), shape: d?.shape ?? "carree", location: d?.location ?? "", table_price: numOrEmpty(d?.table_price), chair_price: numOrEmpty(d?.chair_price) });
  return (
    <Modal title={table ? `Table ${d!.number}` : "Nouvelle table"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act("table.save", { id: table?.id, zone, number: f.number, seats: Number(f.seats), shape: f.shape, location: f.location, table_price: parseNum(f.table_price), chair_price: parseNum(f.chair_price) })) onClose();
        }}
      >
        <Field label="Numéro ou nom"><input className={inp} required maxLength={20} value={f.number} onChange={(e) => setF({ ...f, number: e.target.value })} /></Field>
        <Field label="Nombre de chaises"><input className={inp} inputMode="numeric" required value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value })} /></Field>
        <Field label="Forme">
          <select className={inp} value={f.shape} onChange={(e) => setF({ ...f, shape: e.target.value as typeof f.shape })}>
            <option value="carree">Carrée</option>
            <option value="ronde">Ronde</option>
            <option value="rectangulaire">Rectangulaire</option>
          </select>
        </Field>
        <Field label="Emplacement" hint="Ex. : près de la fenêtre, fond de salle"><input className={inp} maxLength={80} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
        <Field label="Prix de la table (FCFA)" hint="Facultatif, pour le budget."><input className={inp} inputMode="numeric" value={f.table_price} onChange={(e) => setF({ ...f, table_price: e.target.value })} /></Field>
        <Field label="Prix d'une chaise (FCFA)"><input className={inp} inputMode="numeric" value={f.chair_price} onChange={(e) => setF({ ...f, chair_price: e.target.value })} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit">Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Capacité ----------

export function CapacityView({ zone }: { zone: TableZone }) {
  const { v } = useV();
  const cap = capacity(docs<Table>(v.data.table), zone);
  const t = today();
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const tableIds = new Set(docs<Table>(v.data.table).filter((x) => x.data.zone === zone && x.data.active).map((x) => x.id));
  const bookings = docs<Booking>(v.data.booking).filter((b) => tableIds.has(b.data.table_id) && b.data.date === t && BOOKING_ACTIVE.includes(b.data.status));
  const nowB = bookings.filter((b) => b.data.status === "arrivee" || (b.data.start <= hhmm && hhmmPlus(b.data.start, b.data.minutes) > hhmm));
  const busyTables = new Set(nowB.map((b) => b.data.table_id));
  const busySeats = docs<Table>(v.data.table).filter((x) => busyTables.has(x.id)).reduce((a, x) => a + x.data.seats, 0);
  return (
    <div className="space-y-3">
      <div className="rounded-2xl p-4 text-white" style={{ background: "var(--app-primary)" }}>
        <p className="text-xs opacity-80">Capacité d&apos;accueil</p>
        <p className="text-3xl font-bold">{cap.seats} place{cap.seats > 1 ? "s" : ""}</p>
        <p className="mt-1 text-xs opacity-80">Somme des chaises des {cap.tables} table(s) en service.</p>
      </div>
      {cap.tables === 0 ? (
        <Empty text="Ajoutez vos tables et leurs chaises pour calculer la capacité." icon={Users} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Places réservées ou occupées maintenant" value={busySeats} tone={busySeats ? "blue" : "slate"} />
            <Stat label="Places disponibles maintenant" value={Math.max(0, cap.seats - busySeats)} tone="green" />
          </div>
          <Card title="Répartition des tables">
            <ul className="space-y-1 text-sm">{cap.bySeats.map((b) => <li key={b.seats} className="flex justify-between"><span>Tables de {b.seats} place(s)</span><span className="font-medium">{b.count}</span></li>)}</ul>
          </Card>
          <p className="text-xs text-slate-500">« Maintenant » tient compte des réservations enregistrées pour aujourd&apos;hui et des clients installés.</p>
        </>
      )}
    </div>
  );
}
const hhmmPlus = (s: string, m: number) => {
  const [h, mm] = s.split(":").map(Number);
  const t = (h ?? 0) * 60 + (mm ?? 0) + m;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

// ---------- Réservations des tables ----------

export function BookingsView({ zone }: { zone: TableZone }) {
  const { v, level, act } = useV();
  const [day, setDay] = useState(today());
  const [edit, setEdit] = useState<Doc<Booking> | "new" | null>(null);
  const tables = docs<Table>(v.data.table).filter((t) => t.data.zone === zone);
  const ids = new Set(tables.map((t) => t.id));
  const list = docs<Booking>(v.data.booking).filter((b) => ids.has(b.data.table_id) && b.data.date === day).sort((a, b) => a.data.start.localeCompare(b.data.start));
  const upcoming = docs<Booking>(v.data.booking).filter((b) => ids.has(b.data.table_id) && b.data.date > day && BOOKING_ACTIVE.includes(b.data.status)).length;
  const tname = (id: string) => tables.find((t) => t.id === id)?.data.number ?? "?";
  return (
    <div className="space-y-3">
      <ReadOnlyNote />
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Jour" className="w-44"><input type="date" className={inp} value={day} onChange={(e) => e.target.value && setDay(e.target.value)} /></Field>
        {level >= 1 && <Btn onClick={() => setEdit("new")} disabled={tables.filter((t) => t.data.active).length === 0}><CalendarDays className="h-4 w-4" aria-hidden />Nouvelle réservation</Btn>}
      </div>
      {tables.length === 0 && <p className="text-xs text-slate-500">Ajoutez d&apos;abord les tables (fonction « Tables et chaises »).</p>}
      {list.length === 0 ? (
        <Empty text={`Aucune réservation le ${fmtDate(day)}.${upcoming ? ` ${upcoming} réservation(s) à venir les jours suivants.` : ""}`} icon={CalendarDays} />
      ) : (
        <ul className="space-y-1.5">
          {list.map((b) => {
            const active = BOOKING_ACTIVE.includes(b.data.status);
            return (
              <li key={b.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{b.data.start} · {b.data.name} <span className="text-slate-500">({b.data.guests} pers.)</span></p>
                    <p className="text-xs text-slate-500">Table {tname(b.data.table_id)} · {b.data.minutes} min{b.data.phone && ` · ${b.data.phone}`}{b.data.note && ` · ${b.data.note}`}</p>
                  </div>
                  <Pill tone={b.data.status === "confirmee" ? "blue" : b.data.status === "arrivee" ? "green" : b.data.status === "annulee" || b.data.status === "absente" ? "red" : "slate"}>{BOOKING_STATUS_LABELS[b.data.status]}</Pill>
                </div>
                {level >= 1 && active && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {b.data.status === "confirmee" && <Btn small kind="soft" onClick={() => act("booking.status", { id: b.id, to: "arrivee" })}>Clients installés</Btn>}
                    {b.data.status === "arrivee" && <Btn small kind="soft" onClick={() => act("booking.status", { id: b.id, to: "terminee" })}>Terminer</Btn>}
                    <Btn small kind="ghost" onClick={() => setEdit(b)}>Modifier</Btn>
                    {b.data.status === "confirmee" && <Btn small kind="ghost" onClick={() => act("booking.status", { id: b.id, to: "absente" })}>Absents</Btn>}
                    <Btn small kind="danger" onClick={() => act("booking.status", { id: b.id, to: "annulee" }, { confirm: `Annuler la réservation de ${b.data.name} ?` })}>Annuler</Btn>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {edit && <BookingForm tables={tables.filter((t) => t.data.active)} booking={edit === "new" ? null : edit} day={day} onClose={() => setEdit(null)} />}
    </div>
  );
}

function BookingForm({ tables, booking, day, onClose }: { tables: Doc<Table>[]; booking: Doc<Booking> | null; day: string; onClose: () => void }) {
  const { act } = useV();
  const [key, renew] = useIdem();
  const d = booking?.data;
  const [f, setF] = useState({ table_id: d?.table_id ?? tables[0]?.id ?? "", date: d?.date ?? day, start: d?.start ?? "19:00", minutes: String(d?.minutes ?? 90), guests: String(d?.guests ?? 2), name: d?.name ?? "", phone: d?.phone ?? "", note: d?.note ?? "" });
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={booking ? "Modifier la réservation" : "Nouvelle réservation"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("booking.save", { id: booking?.id, ...f, minutes: Number(f.minutes), guests: Number(f.guests), idem: key });
          setBusy(false);
          if (r) {
            renew();
            onClose();
          }
        }}
      >
        <Field label="Nom du client"><input className={inp} required maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Téléphone"><input className={inp} type="tel" maxLength={40} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Date"><input type="date" className={inp} required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Heure"><input type="time" className={inp} required value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></Field>
        <Field label="Durée (minutes)"><input className={inp} inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></Field>
        <Field label="Personnes"><input className={inp} inputMode="numeric" required value={f.guests} onChange={(e) => setF({ ...f, guests: e.target.value })} /></Field>
        <Field label="Table" className="sm:col-span-2"><select className={inp} value={f.table_id} onChange={(e) => setF({ ...f, table_id: e.target.value })}>{tables.map((t) => <option key={t.id} value={t.id}>Table {t.data.number} · {t.data.seats} place(s)</option>)}</select></Field>
        <Field label="Remarque" className="sm:col-span-2"><input className={inp} maxLength={300} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <p className="text-xs text-slate-500 sm:col-span-2">Une table ne peut pas être réservée deux fois sur le même créneau.</p>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Tâches (nettoyage, entretien, signalements) ----------

export function TasksView({ zone, kinds = ["nettoyage", "entretien", "reparation", "signalement", "tache"], defaultKind = "nettoyage", roomId = null, title = "Tâches" }: { zone: DataZone | "all"; kinds?: TaskKind[]; defaultKind?: TaskKind; roomId?: string | null; title?: string }) {
  const { v, level, act, name } = useV();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [edit, setEdit] = useState<Doc<Task> | "new" | null>(null);
  const [done, setDone] = useState<Doc<Task> | null>(null);
  const staff = docs<Staff>(v.data.staff);
  const all = docs<Task>(v.data.task).filter((t) => (zone === "all" || t.data.zone === zone) && (roomId === null || t.data.room_id === roomId) && kinds.includes(t.data.kind));
  const open = all.filter((t) => taskOpen(t.data)).sort((a, b) => Number(b.data.urgent) - Number(a.data.urgent) || (a.data.due ?? "9999").localeCompare(b.data.due ?? "9999"));
  const closed = all.filter((t) => !taskOpen(t.data)).sort((a, b) => (b.data.done_at ?? b.updated_at).localeCompare(a.data.done_at ?? a.updated_at)).slice(0, 50);
  const who = (t: Task) => (t.assignee_id ? name(t.assignee_id) : t.staff_id ? (staff.find((s) => s.id === t.staff_id)?.data.name ?? "Employé") : "Non attribuée");
  const list = tab === "open" ? open : closed;
  return (
    <div className="space-y-3">
      <ReadOnlyNote />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs label={title} value={tab} onChange={setTab} tabs={[{ id: "open", label: "À faire", icon: ClipboardList, count: open.length }, { id: "done", label: "Historique", icon: CheckCircle2 }]} />
        {level >= 1 && <Btn small onClick={() => setEdit("new")}><Plus className="h-3.5 w-3.5" aria-hidden />Nouvelle tâche</Btn>}
      </div>
      {list.length === 0 ? (
        <Empty text={tab === "open" ? "Aucune tâche en cours." : "Aucune tâche terminée pour l'instant."} icon={ClipboardList} />
      ) : (
        <ul className="space-y-1.5">
          {list.map((t) => {
            const late = taskLate(t.data);
            const mine = !t.data.assignee_id || t.data.assignee_id === v.me || isMgr(level);
            return (
              <li key={t.id} className={`rounded-xl border bg-white p-2.5 text-sm ${late ? "border-red-200" : "border-slate-200"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{t.data.urgent && <span className="mr-1 text-red-600">●</span>}{t.data.title}</p>
                    <p className="text-xs text-slate-500">
                      {TASK_KIND_LABELS[t.data.kind]} · {FREQUENCY_LABELS[t.data.frequency]} · {who(t.data)}
                      {t.data.due && ` · pour le ${fmtDate(t.data.due)}`}
                      {t.data.done_at && ` · terminée le ${fmtDateTime(t.data.done_at)}${t.data.done_by ? ` par ${name(t.data.done_by)}` : ""}`}
                      {t.data.cost !== null && ` · coût ${fmtMoney(t.data.cost)}`}
                    </p>
                    {t.data.description && <p className="mt-0.5 text-xs text-slate-600">{t.data.description}</p>}
                  </div>
                  {late ? <Pill tone="red">En retard</Pill> : <Pill tone={t.data.status === "fait" ? "green" : t.data.status === "annule" ? "slate" : t.data.status === "en_cours" ? "blue" : "amber"}>{TASK_STATUS_LABELS[t.data.status]}</Pill>}
                </div>
                {level >= 1 && taskOpen(t.data) && mine && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.data.status === "a_faire" && <Btn small kind="soft" onClick={() => act("task.status", { id: t.id, to: "en_cours" })}>Commencer</Btn>}
                    <Btn small onClick={() => setDone(t)}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Terminée</Btn>
                    {(t.data.by === v.me || isMgr(level)) && <Btn small kind="ghost" onClick={() => setEdit(t)}>Modifier</Btn>}
                    {isMgr(level) && <Btn small kind="danger" onClick={() => act("task.status", { id: t.id, to: "annule" }, { confirm: "Annuler cette tâche ? Elle reste dans l'historique." })}>Annuler</Btn>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {edit && <TaskForm zone={zone === "all" ? "bureau" : zone} kinds={kinds} defaultKind={defaultKind} roomId={roomId} task={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
      {done && <DoneForm task={done} onClose={() => setDone(null)} />}
    </div>
  );
}

function TaskForm({ zone, kinds, defaultKind, roomId, task, onClose }: { zone: DataZone; kinds: TaskKind[]; defaultKind: TaskKind; roomId: string | null; task: Doc<Task> | null; onClose: () => void }) {
  const { v, act, level } = useV();
  const d = task?.data;
  const staff = docs<Staff>(v.data.staff).filter((s) => s.data.active);
  const [f, setF] = useState({ kind: d?.kind ?? defaultKind, title: d?.title ?? "", description: d?.description ?? "", frequency: d?.frequency ?? "aucune", assignee_id: d?.assignee_id ?? null, staff_id: d?.staff_id ?? "", due: d?.due ?? today(), urgent: d?.urgent ?? false });
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={task ? "Modifier la tâche" : "Nouvelle tâche"} onClose={onClose}>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("task.save", { id: task?.id, zone: d?.zone ?? zone, kind: f.kind, title: f.title, description: f.description, frequency: f.frequency, assignee_id: f.assignee_id, staff_id: f.staff_id || null, due: f.due, room_id: d?.room_id ?? roomId, equipment_id: d?.equipment_id ?? null, urgent: f.urgent });
          setBusy(false);
          if (r) onClose();
        }}
      >
        <Field label="Titre" className="sm:col-span-2"><input className={inp} required maxLength={160} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex. : nettoyer les lavabos" /></Field>
        <Field label="Type"><select className={inp} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as TaskKind })}>{kinds.map((k) => <option key={k} value={k}>{TASK_KIND_LABELS[k]}</option>)}</select></Field>
        <Field label="Fréquence"><select className={inp} value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as typeof f.frequency })}>{FREQUENCIES.map((x) => <option key={x} value={x}>{FREQUENCY_LABELS[x]}</option>)}</select></Field>
        <Field label={f.frequency === "aucune" ? "À faire pour le" : "Première échéance"}><input type="date" className={inp} value={f.due ?? ""} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
        {isMgr(level) ? <MemberSelect value={f.assignee_id} onChange={(x) => setF({ ...f, assignee_id: x })} label="Compte responsable" /> : <Field label="Responsable"><select className={inp} value={f.assignee_id ?? ""} onChange={(e) => setF({ ...f, assignee_id: e.target.value || null })}><option value="">— Non attribué —</option><option value={v.me}>Moi</option></select></Field>}
        {staff.length > 0 && <Field label="Ou employé (sans compte)"><select className={inp} value={f.staff_id} onChange={(e) => setF({ ...f, staff_id: e.target.value })}><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.data.name}</option>)}</select></Field>}
        <Field label="Description" className="sm:col-span-2"><textarea className={inp} rows={2} maxLength={1000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.urgent} onChange={(e) => setF({ ...f, urgent: e.target.checked })} />Urgent</label>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

function DoneForm({ task, onClose }: { task: Doc<Task>; onClose: () => void }) {
  const { act, level } = useV();
  const [cost, setCost] = useState("");
  const [expense, setExpense] = useState(false);
  const [note, setNote] = useState("");
  return (
    <Modal title={`Terminer : ${task.data.title}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => (e.preventDefault(), (await act("task.status", { id: task.id, to: "fait", cost: parseNum(cost), record_expense: expense, note })) && onClose())}>
        <Field label="Remarque (facultatif)"><input className={inp} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {(task.data.kind === "reparation" || task.data.kind === "entretien") && (
          <>
            <Field label="Coût réel (FCFA, facultatif)"><input className={inp} inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} /></Field>
            {isMgr(level) && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={expense} onChange={(e) => setExpense(e.target.checked)} />Enregistrer ce coût en dépense</label>}
          </>
        )}
        {task.data.frequency !== "aucune" && <p className="text-xs text-slate-500">La prochaine occurrence ({FREQUENCY_LABELS[task.data.frequency].toLowerCase()}) sera planifiée automatiquement.</p>}
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit"><CheckCircle2 className="h-4 w-4" aria-hidden />Confirmer</Btn></div>
      </form>
    </Modal>
  );
}

/** Installations des toilettes : décompte par type à partir de l'inventaire. */
export function InstallationsSummary() {
  const { v } = useV();
  const items = docs<Equip>(v.data.equip).filter((e) => e.data.zone === "toilettes" && e.data.owned);
  const groups = useMemo(() => {
    const m = new Map<string, { qty: number; ko: number }>();
    for (const e of items) {
      const g = m.get(e.data.name) ?? { qty: 0, ko: 0 };
      g.qty += e.data.qty;
      if (e.data.condition !== "bon" && e.data.condition !== "use") g.ko += e.data.qty;
      m.set(e.data.name, g);
    }
    return [...m.entries()];
  }, [items]);
  if (groups.length === 0) return null;
  return (
    <Card title="Organisation actuelle">
      <ul className="grid grid-cols-2 gap-1.5 text-sm">
        {groups.map(([n, g]) => <li key={n} className="rounded-lg bg-slate-50 px-2.5 py-1.5"><span className="font-semibold">{g.qty}</span> {n}{g.ko > 0 && <span className="text-xs text-red-600"> · {g.ko} hors service</span>}</li>)}
      </ul>
    </Card>
  );
}
