"use client";

import { Bell, CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { APPT_KIND, APPT_STATUS, apptDay, dayKey, weekStart, type Appointment, type Doc } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Badge, DeleteButton, Empty, Field, Modal, MultiPick, Pick, Tabs, TONES, fmtDay, hhmm } from "../ui";

type View = "day" | "week" | "month";
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Agenda : calendrier jour, semaine et mois, rendez-vous et réunions, participants, rappels, confirmation et annulation. */
export function Agenda() {
  const c = useCtx();
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [edit, setEdit] = useState<{ appt: Doc<Appointment> | null; start?: string } | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const appts = useMemo(() => (c.data.appointment as Doc<Appointment>[]).filter((a) => showCancelled || a.data.status !== "annule"), [c.data.appointment, showCancelled]);
  const byDay = useMemo(() => {
    const m = new Map<string, Doc<Appointment>[]>();
    for (const a of appts) (m.get(apptDay(a.data)) ?? m.set(apptDay(a.data), []).get(apptDay(a.data))!).push(a);
    for (const l of m.values()) l.sort((x, y) => x.data.start.localeCompare(y.data.start));
    return m;
  }, [appts]);
  const key = dayKey(cursor);
  const move = (dir: number) => setCursor((d) => (view === "day" ? addDays(d, dir) : view === "week" ? addDays(d, 7 * dir) : new Date(d.getFullYear(), d.getMonth() + dir, 1)));
  const title = view === "day" ? cursor.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : view === "week" ? `Semaine du ${weekStart(cursor).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}` : cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const canEdit = c.may("agenda");
  const newAt = (d: string) => setEdit({ appt: null, start: `${d}T09:00` });

  const Item = ({ a }: { a: Doc<Appointment> }) => (
    <button onClick={() => setEdit({ appt: a })} className={`block w-full rounded-lg border-l-4 bg-slate-50 px-2 py-1.5 text-left text-xs ${a.data.status === "annule" ? "border-red-400 opacity-60" : a.data.status === "confirme" ? "border-emerald-500" : "border-blue-500"}`}>
      <b>{hhmm(a.data.start)}</b> {a.data.title}
      {a.data.client_id && <span className="block truncate text-slate-500">{c.clientName(a.data.client_id)}</span>}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={view} onChange={setView} items={[["day", "Jour"], ["week", "Semaine"], ["month", "Mois"]]} />
        <div className="flex items-center gap-1">
          <button className="btn btn-ghost !px-2" onClick={() => move(-1)} aria-label="Précédent"><ChevronLeft className="h-4 w-4" /></button>
          <button className="btn btn-ghost !py-1.5 text-sm" onClick={() => setCursor(new Date())}>Aujourd&apos;hui</button>
          <button className="btn btn-ghost !px-2" onClick={() => move(1)} aria-label="Suivant"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <label className="ml-auto flex items-center gap-2 text-sm"><input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> Voir les annulés</label>
        {canEdit && <button className="btn btn-primary" onClick={() => newAt(key)}><Plus className="h-4 w-4" /> Rendez-vous</button>}
      </div>
      <h2 className="text-base font-semibold capitalize">{title}</h2>

      {view === "day" && (
        (byDay.get(key) ?? []).length ? (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {byDay.get(key)!.map((a) => (
              <li key={a.id}><button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50" onClick={() => setEdit({ appt: a })}>
                <span className="w-24 text-sm font-semibold">{hhmm(a.data.start)} – {hhmm(a.data.end)}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{a.data.title}</span><span className="block truncate text-xs text-slate-500">{APPT_KIND[a.data.kind]}{a.data.client_id ? ` · ${c.clientName(a.data.client_id)}` : ""}{a.data.location ? ` · ${a.data.location}` : ""}{a.data.participants.length ? ` · ${a.data.participants.map((p) => c.memberName(p)).join(", ")}` : ""}</span></span>
                <Badge tone={TONES[a.data.status]}>{APPT_STATUS[a.data.status]}</Badge>
              </button></li>
            ))}
          </ul>
        ) : <Empty icon={CalendarDays} title="Aucun rendez-vous ce jour" action={canEdit ? <button className="btn btn-primary" onClick={() => newAt(key)}>Ajouter un rendez-vous</button> : undefined} />
      )}

      {view === "week" && (
        <div className="grid gap-2 md:grid-cols-7">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i)).map((d) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const isToday = k === dayKey(new Date());
            return (
              <div key={k} className={`rounded-2xl border bg-white p-2 ${isToday ? "border-[var(--brand)]" : "border-slate-200"}`}>
                <button className="mb-2 flex w-full items-center justify-between text-xs font-semibold capitalize" onClick={() => (setCursor(d), setView("day"))}>{fmtDay(k)}{canEdit && <span role="button" tabIndex={0} aria-label="Ajouter" onClick={(e) => (e.stopPropagation(), newAt(k))} onKeyDown={(e) => e.key === "Enter" && newAt(k)} className="text-[var(--brand)]">+</span>}</button>
                <div className="space-y-1">{list.map((a) => <Item key={a.id} a={a} />)}{!list.length && <p className="px-1 text-xs text-slate-400">—</p>}</div>
              </div>
            );
          })}
        </div>
      )}

      {view === "month" && (() => {
        const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
        const start = weekStart(first);
        const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-center text-xs text-slate-500">{["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((x) => <div key={x} className="py-1.5">{x}</div>)}</div>
            <div className="grid grid-cols-7">
              {cells.map((d) => {
                const k = dayKey(d);
                const list = byDay.get(k) ?? [];
                const inMonth = d.getMonth() === cursor.getMonth();
                return (
                  <button key={k} onClick={() => (setCursor(d), setView("day"))} className={`min-h-[3.5rem] border-b border-r border-slate-100 p-1 text-left align-top text-xs hover:bg-slate-50 sm:min-h-[5rem] ${inMonth ? "" : "opacity-40"}`}>
                    <span className={`inline-block ${k === dayKey(new Date()) ? "rounded-full bg-[var(--brand)] px-1.5 font-semibold text-white" : ""}`}>{d.getDate()}</span>
                    {list.slice(0, 2).map((a) => <span key={a.id} className="mt-0.5 hidden truncate rounded bg-blue-50 px-1 text-[10px] text-blue-800 sm:block">{hhmm(a.data.start)} {a.data.title}</span>)}
                    {list.length > 0 && <span className="mt-0.5 block text-[10px] font-semibold text-[var(--brand)] sm:hidden">{list.length} ●</span>}
                    {list.length > 2 && <span className="hidden text-[10px] text-slate-500 sm:block">+{list.length - 2}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}
      {edit && <ApptForm appt={edit.appt} start={edit.start} onClose={() => setEdit(null)} canEdit={canEdit} />}
    </div>
  );
}

function ApptForm({ appt, start, onClose, canEdit }: { appt: Doc<Appointment> | null; start?: string; onClose: () => void; canEdit: boolean }) {
  const c = useCtx();
  const d = appt?.data;
  const endOf = (s: string) => { const t = new Date(`${s}:00`); t.setHours(t.getHours() + 1); return `${dayKey(t)}T${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };
  const s0 = d?.start ?? start ?? `${dayKey(new Date())}T09:00`;
  const [f, setF] = useState({ title: d?.title ?? "", kind: d?.kind ?? ("rdv" as keyof typeof APPT_KIND), start: s0.slice(0, 16), end: (d?.end ?? endOf(s0.slice(0, 16))).slice(0, 16), client_id: d?.client_id ?? "", location: d?.location ?? "", participants: d?.participants ?? ([] as string[]), status: d?.status ?? ("prevu" as keyof typeof APPT_STATUS), reminder_min: String(d?.reminder_min ?? 30), notes: d?.notes ?? "" });
  const team: [string, string][] = c.s.members.filter((m) => m.active).map((m) => [m.id, m.name]);
  const clients: [string, string][] = (c.data.client as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
  return (
    <Modal wide title={appt ? "Rendez-vous" : "Nouveau rendez-vous"} onClose={onClose} footer={
      canEdit ? (
        <>
          {appt && <DeleteButton confirmText="Supprimer ce rendez-vous ?" onConfirm={async () => (await c.run("appointment.delete", { id: appt.id })) && onClose()} />}
          {appt && d?.status !== "annule" && <button className="btn btn-ghost" onClick={async () => (await c.run("appointment.status", { id: appt.id, status: "annule" })) && onClose()}>Annuler le rendez-vous</button>}
          {appt && d?.status === "prevu" && <button className="btn btn-ghost" onClick={async () => (await c.run("appointment.status", { id: appt.id, status: "confirme" })) && onClose()}>Confirmer</button>}
          <button className="btn btn-primary" disabled={!f.title.trim()} onClick={async () => (await c.run("appointment.save", { id: appt?.id, ...f, client_id: f.client_id || null })) && onClose()}>Enregistrer</button>
        </>
      ) : <button className="btn btn-ghost" onClick={onClose}>Fermer</button>
    }>
      <fieldset disabled={!canEdit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Titre" className="sm:col-span-2"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={160} autoFocus /></Field>
        <Field label="Type"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as typeof f.kind })}>{Object.entries(APPT_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Statut"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })}>{Object.entries(APPT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Début"><input className="input" type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value, end: endOf(e.target.value) })} /></Field>
        <Field label="Fin"><input className="input" type="datetime-local" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></Field>
        <Pick label="Client" value={f.client_id} onChange={(v) => setF({ ...f, client_id: v })} options={clients} empty="Aucun" />
        <Field label="Lieu"><input className="input" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={160} placeholder="Salle de réunion, adresse…" /></Field>
        <div className="sm:col-span-2"><MultiPick label="Participants" value={f.participants} onChange={(v) => setF({ ...f, participants: v })} options={team} /></div>
        <Field label="Rappel (minutes avant)"><select className="input" value={f.reminder_min} onChange={(e) => setF({ ...f, reminder_min: e.target.value })}>{[0, 15, 30, 60, 120, 1440].map((m) => <option key={m} value={m}>{m === 0 ? "Aucun" : m >= 1440 ? "1 jour" : m >= 60 ? `${m / 60} h` : `${m} min`}</option>)}</select></Field>
        <p className="flex items-end gap-1 pb-2 text-xs text-slate-500"><Bell className="h-3.5 w-3.5" /> Le rappel s&apos;affiche dans les alertes du tableau de bord ; les participants reçoivent une notification à la création.</p>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={2000} /></Field>
      </fieldset>
    </Modal>
  );
}
