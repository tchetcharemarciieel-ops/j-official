"use client";

import { BedDouble, Brush, CalendarCheck, CalendarDays, CircleCheck, FileText, Info, LogIn, LogOut, Pencil, Plus, Search as SearchIcon, ShieldCheck, Wrench } from "lucide-react";
import { useState } from "react";
import {
  ROOM_STATE_LABELS,
  STAY_ACTIVE,
  STAY_STATUS_LABELS,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  nights,
  paidSums,
  roomState,
  searchable,
  stayDue,
  stayTotal,
  staysOverlap,
  today,
  type Doc,
  type Guest,
  type Payment,
  type Room,
  type Stay,
  type Task,
} from "@/lib/venue/model";
import { Btn, Card, Empty, Field, Modal, Pill, ReadOnlyNote, Search, Stat, Tabs, byId, docs, inp, isMgr, numOrEmpty, parseNum, useIdem, useV, type Tone } from "./ui";
import { EquipList, TasksView } from "./m-space";
import { PaymentForm, StayFolio } from "./m-sales";

export const ROOM_TONE: Record<string, Tone> = { disponible: "green", occupee: "blue", a_nettoyer: "amber", maintenance: "red", reservee: "violet" };
const STAY_TONE: Record<string, Tone> = { reservee: "violet", arrivee: "blue", partie: "slate", annulee: "red", absent: "red" };

function useLookups() {
  const { v } = useV();
  const rooms = docs<Room>(v.data.room).sort((a, b) => a.data.number.localeCompare(b.data.number, "fr", { numeric: true }));
  const stays = docs<Stay>(v.data.stay);
  const guest = (id: string) => byId<Guest>(v.data.guest, id);
  const room = (id: string) => rooms.find((r) => r.id === id);
  return { rooms, stays, guest, room, pays: docs<Payment>(v.data.payment) };
}

// ---------- Réservations ----------

export function StaysView({ roomId }: { roomId?: string }) {
  const { level, act } = useV();
  const { rooms, stays, guest, room, pays } = useLookups();
  const [tab, setTab] = useState<"avenir" | "encours" | "passe">("avenir");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Doc<Stay> | "new" | null>(null);
  const t = today();
  const mine = stays.filter((s) => !roomId || s.data.room_id === roomId);
  const match = (s: Doc<Stay>) => !q || searchable(`${s.data.ref} ${guest(s.data.guest_id)?.data.name ?? ""} ${room(s.data.room_id)?.data.number ?? ""}`).includes(searchable(q));
  const lists = {
    avenir: mine.filter((s) => s.data.status === "reservee").sort((a, b) => a.data.arrival.localeCompare(b.data.arrival)),
    encours: mine.filter((s) => s.data.status === "arrivee").sort((a, b) => a.data.departure.localeCompare(b.data.departure)),
    passe: mine.filter((s) => !STAY_ACTIVE.includes(s.data.status)).sort((a, b) => b.data.departure.localeCompare(a.data.departure)).slice(0, 60),
  };
  const list = lists[tab].filter(match);
  return (
    <div className="space-y-3">
      <ReadOnlyNote />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs label="Réservations" value={tab} onChange={setTab} tabs={[{ id: "avenir", label: "À venir", icon: CalendarDays, count: lists.avenir.length }, { id: "encours", label: "En séjour", icon: BedDouble, count: lists.encours.length }, { id: "passe", label: "Historique" }]} />
        {level >= 1 && <Btn small onClick={() => setEdit("new")} disabled={rooms.length === 0}><Plus className="h-3.5 w-3.5" aria-hidden />Réservation</Btn>}
      </div>
      {rooms.length === 0 && <p className="text-xs text-slate-500">Ajoutez d&apos;abord vos chambres (zone « Chambres »).</p>}
      {!roomId && <Search value={q} onChange={setQ} placeholder="Client, référence ou chambre" />}
      {list.length === 0 ? (
        <Empty text={tab === "avenir" ? "Aucune réservation à venir." : tab === "encours" ? "Aucun client en séjour." : "Aucun séjour terminé."} icon={CalendarDays} />
      ) : (
        <ul className="space-y-1.5">
          {list.map((s) => {
            const due = stayDue(s.data, pays, s.id);
            return (
              <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{guest(s.data.guest_id)?.data.name ?? "Client"} <span className="font-normal text-slate-500">· ch. {room(s.data.room_id)?.data.number} · {s.data.ref}</span></p>
                    <p className="text-xs text-slate-500">Du {fmtDate(s.data.arrival)} au {fmtDate(s.data.departure)} · {nights(s.data.arrival, s.data.departure)} nuit(s) · {s.data.adults + s.data.children} pers. · {fmtMoney(stayTotal(s.data))}{due > 0 && STAY_ACTIVE.includes(s.data.status) && <span className="text-amber-700"> · reste {fmtMoney(due)}</span>}</p>
                  </div>
                  <Pill tone={STAY_TONE[s.data.status]}>{STAY_STATUS_LABELS[s.data.status]}</Pill>
                </div>
                {level >= 1 && STAY_ACTIVE.includes(s.data.status) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.data.status === "reservee" && s.data.arrival <= t && <Btn small onClick={() => act("stay.status", { id: s.id, to: "arrivee" })}><LogIn className="h-3.5 w-3.5" aria-hidden />Arrivée</Btn>}
                    {s.data.status === "arrivee" && <Btn small onClick={() => act("stay.status", { id: s.id, to: "partie" }, { confirm: due > 0 ? `Il reste ${fmtMoney(due)} à encaisser. Enregistrer quand même le départ ?` : "Enregistrer le départ du client ?" })}><LogOut className="h-3.5 w-3.5" aria-hidden />Départ</Btn>}
                    <Btn small kind="ghost" onClick={() => setEdit(s)}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</Btn>
                    {s.data.status === "reservee" && (
                      <>
                        <Btn small kind="ghost" onClick={() => act("stay.status", { id: s.id, to: "absent" }, { confirm: "Marquer le client comme non présenté ?" })}>Non présenté</Btn>
                        <Btn small kind="danger" onClick={() => act("stay.status", { id: s.id, to: "annulee" }, { confirm: `Annuler la réservation ${s.data.ref} ?` })}>Annuler</Btn>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {edit && <StayForm stay={edit === "new" ? null : edit} roomId={roomId} onClose={() => setEdit(null)} />}
    </div>
  );
}

export function StayForm({ stay, roomId, onClose }: { stay: Doc<Stay> | null; roomId?: string; onClose: () => void }) {
  const { v, act } = useV();
  const { rooms, stays } = useLookups();
  const [key, renew] = useIdem();
  const d = stay?.data;
  const guests = docs<Guest>(v.data.guest).sort((a, b) => a.data.name.localeCompare(b.data.name));
  const t = today();
  const tomorrow = (() => { const x = new Date(); x.setDate(x.getDate() + 1); return today(x); })();
  const firstRoom = d?.room_id ?? roomId ?? rooms.find((r) => !r.data.maintenance && !stays.some((s) => s.data.room_id === r.id && STAY_ACTIVE.includes(s.data.status) && staysOverlap(s.data, { arrival: t, departure: tomorrow })))?.id ?? rooms.find((r) => !r.data.maintenance)?.id ?? "";
  const [f, setF] = useState({ room_id: firstRoom, arrival: d?.arrival ?? t, departure: d?.departure ?? tomorrow, adults: String(d?.adults ?? 1), children: String(d?.children ?? 0), rate: numOrEmpty(d?.rate ?? rooms.find((r) => r.id === firstRoom)?.data.price_night), note: d?.note ?? "" });
  const [guestId, setGuestId] = useState(d?.guest_id ?? "");
  const [g, setG] = useState({ name: "", phone: "", email: "", id_type: "", id_number: "" });
  const [busy, setBusy] = useState(false);
  const room = rooms.find((r) => r.id === f.room_id);
  const clash = f.room_id && f.departure > f.arrival ? stays.find((s) => s.id !== stay?.id && s.data.room_id === f.room_id && STAY_ACTIVE.includes(s.data.status) && staysOverlap(s.data, f)) : undefined;
  const n = f.departure > f.arrival ? nights(f.arrival, f.departure) : 0;
  return (
    <Modal title={stay ? `Modifier ${d!.ref}` : "Nouvelle réservation"} onClose={onClose} wide>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("stay.save", { id: stay?.id, room_id: f.room_id, arrival: f.arrival, departure: f.departure, adults: Number(f.adults), children: Number(f.children), rate: parseNum(f.rate) ?? 0, note: f.note, guest_id: guestId || null, guest: guestId ? undefined : g, idem: key });
          setBusy(false);
          if (r) {
            renew();
            onClose();
          }
        }}
      >
        <Field label="Arrivée"><input type="date" className={inp} required value={f.arrival} onChange={(e) => setF({ ...f, arrival: e.target.value })} /></Field>
        <Field label="Départ"><input type="date" className={inp} required min={f.arrival} value={f.departure} onChange={(e) => setF({ ...f, departure: e.target.value })} /></Field>
        <Field label="Chambre">
          <select className={inp} value={f.room_id} onChange={(e) => { const r = rooms.find((x) => x.id === e.target.value); setF({ ...f, room_id: e.target.value, rate: r?.data.price_night != null ? String(r.data.price_night) : f.rate }); }}>
            {rooms.map((r) => {
              const busy2 = stays.some((s) => s.id !== stay?.id && s.data.room_id === r.id && STAY_ACTIVE.includes(s.data.status) && f.departure > f.arrival && staysOverlap(s.data, f));
              return <option key={r.id} value={r.id} disabled={r.data.maintenance || busy2}>Ch. {r.data.number} · {r.data.type} · {r.data.capacity} pers.{r.data.maintenance ? " (maintenance)" : busy2 ? " (déjà réservée)" : ""}</option>;
            })}
          </select>
        </Field>
        <Field label="Prix par nuit (FCFA)" hint={room?.data.price_night == null ? "Aucun prix enregistré pour cette chambre : saisissez le tarif convenu." : undefined}><input className={inp} required inputMode="numeric" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
        <Field label="Adultes"><input className={inp} inputMode="numeric" value={f.adults} onChange={(e) => setF({ ...f, adults: e.target.value })} /></Field>
        <Field label="Enfants"><input className={inp} inputMode="numeric" value={f.children} onChange={(e) => setF({ ...f, children: e.target.value })} /></Field>
        {clash && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 sm:col-span-2">Cette chambre est déjà réservée du {fmtDate(clash.data.arrival)} au {fmtDate(clash.data.departure)} : choisissez d&apos;autres dates ou une autre chambre.</p>}
        <div className="rounded-xl border border-slate-200 p-3 sm:col-span-2">
          <p className="mb-2 text-sm font-semibold">Client</p>
          <Field label="Client déjà enregistré">
            <select className={inp} value={guestId} onChange={(e) => setGuestId(e.target.value)}>
              <option value="">— Nouveau client —</option>
              {guests.map((x) => <option key={x.id} value={x.id}>{x.data.name}{x.data.phone && ` · ${x.data.phone}`}</option>)}
            </select>
          </Field>
          {!guestId && (
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Field label="Nom"><input className={inp} required maxLength={120} value={g.name} onChange={(e) => setG({ ...g, name: e.target.value })} /></Field>
              <Field label="Téléphone"><input className={inp} type="tel" maxLength={40} value={g.phone} onChange={(e) => setG({ ...g, phone: e.target.value })} /></Field>
              <Field label="E-mail"><input className={inp} type="email" maxLength={200} value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></Field>
              <Field label="Pièce d'identité (type et numéro)"><div className="flex gap-1"><input className={`${inp} w-28`} maxLength={40} value={g.id_type} onChange={(e) => setG({ ...g, id_type: e.target.value })} placeholder="CNI" /><input className={inp} maxLength={60} value={g.id_number} onChange={(e) => setG({ ...g, id_number: e.target.value })} /></div></Field>
            </div>
          )}
        </div>
        <Field label="Remarque" className="sm:col-span-2"><input className={inp} maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <p className="text-sm sm:col-span-2">{n} nuit(s) × {fmtMoney(parseNum(f.rate) ?? 0)} = <strong>{fmtMoney(n * (parseNum(f.rate) ?? 0))}</strong></p>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy} disabled={Boolean(clash)}>Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Arrivées et départs ----------

export function ArrivalsView() {
  const { level, act } = useV();
  const { stays, guest, room, pays } = useLookups();
  const t = today();
  const arrivals = stays.filter((s) => s.data.status === "reservee" && s.data.arrival <= t).sort((a, b) => a.data.arrival.localeCompare(b.data.arrival));
  const departures = stays.filter((s) => s.data.status === "arrivee").sort((a, b) => a.data.departure.localeCompare(b.data.departure));
  const row = (s: Doc<Stay>, kind: "in" | "out") => {
    const r = room(s.data.room_id);
    const due = stayDue(s.data, pays, s.id);
    const blocked = kind === "in" && (r?.data.maintenance || stays.some((x) => x.id !== s.id && x.data.room_id === s.data.room_id && x.data.status === "arrivee"));
    return (
      <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <span className="min-w-0">
          <span className="font-medium">{guest(s.data.guest_id)?.data.name}</span> <span className="text-xs text-slate-500">· ch. {r?.data.number} · {kind === "in" ? `arrivée ${fmtDate(s.data.arrival)}` : `départ ${fmtDate(s.data.departure)}`}{kind === "out" && s.data.departure < t && <span className="text-red-600"> (dépassé)</span>}{due > 0 && ` · reste ${fmtMoney(due)}`}</span>
          {blocked && <span className="block text-xs text-red-600">Chambre pas encore libre (occupée ou en maintenance).</span>}
        </span>
        {level >= 1 && (kind === "in" ? <Btn small disabled={blocked} onClick={() => act("stay.status", { id: s.id, to: "arrivee" })}><LogIn className="h-3.5 w-3.5" aria-hidden />Enregistrer l&apos;arrivée</Btn> : <Btn small onClick={() => act("stay.status", { id: s.id, to: "partie" }, { confirm: due > 0 ? `Il reste ${fmtMoney(due)} à encaisser. Enregistrer quand même le départ ?` : "Enregistrer le départ ?" })}><LogOut className="h-3.5 w-3.5" aria-hidden />Enregistrer le départ</Btn>)}
      </li>
    );
  };
  return (
    <div className="space-y-3">
      <ReadOnlyNote />
      <Card title={`Arrivées attendues (${arrivals.length})`}>{arrivals.length === 0 ? <p className="text-sm text-slate-500">Aucune arrivée prévue aujourd&apos;hui.</p> : <ul className="space-y-1.5">{arrivals.map((s) => row(s, "in"))}</ul>}</Card>
      <Card title={`Clients en séjour (${departures.length})`}>{departures.length === 0 ? <p className="text-sm text-slate-500">Aucun client présent.</p> : <ul className="space-y-1.5">{departures.map((s) => row(s, "out"))}</ul>}</Card>
      <p className="text-xs text-slate-500">À l&apos;arrivée, la chambre passe « occupée » ; au départ, elle passe « à nettoyer » jusqu&apos;au nettoyage enregistré.</p>
    </div>
  );
}

// ---------- Disponibilité des chambres ----------

export function AvailabilityView({ onRoom }: { onRoom?: (id: string) => void }) {
  const { rooms, stays } = useLookups();
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(() => { const x = new Date(); x.setDate(x.getDate() + 1); return today(x); });
  const states = rooms.map((r) => ({ r, s: roomState(r, stays) }));
  const freeFor = rooms.filter((r) => !r.data.maintenance && !stays.some((s) => s.data.room_id === r.id && STAY_ACTIVE.includes(s.data.status) && to > from && staysOverlap(s.data, { arrival: from, departure: to })));
  return (
    <div className="space-y-3">
      {rooms.length === 0 ? (
        <Empty text="Aucune chambre enregistrée." icon={BedDouble} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(["disponible", "reservee", "occupee", "a_nettoyer", "maintenance"] as const).map((k) => <Stat key={k} label={ROOM_STATE_LABELS[k]} value={states.filter((x) => x.s === k).length} tone={ROOM_TONE[k]} />)}
          </div>
          <Card title="Aujourd'hui">
            <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {states.map(({ r, s }) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onRoom?.(r.id)} className={`tab-press w-full rounded-xl border px-2 py-2 text-left text-xs ${s === "disponible" ? "border-green-200 bg-green-50" : s === "occupee" ? "border-blue-200 bg-blue-50" : s === "a_nettoyer" ? "border-amber-200 bg-amber-50" : s === "maintenance" ? "border-red-200 bg-red-50" : "border-violet-200 bg-violet-50"}`}>
                    <span className="block text-sm font-bold">{r.data.number}</span>
                    {ROOM_STATE_LABELS[s]}
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-slate-500">États calculés à partir des séjours enregistrés et des nettoyages.</p>
          </Card>
          <Card title="Chambres libres pour des dates">
            <div className="flex flex-wrap gap-2">
              <Field label="Arrivée" className="w-40"><input type="date" className={inp} value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label="Départ" className="w-40"><input type="date" className={inp} value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
            </div>
            {to <= from ? <p className="mt-2 text-xs text-red-600">Le départ doit suivre l&apos;arrivée.</p> : <p className="mt-2 text-sm">{freeFor.length ? <><strong>{freeFor.length}</strong> chambre(s) libre(s) : {freeFor.map((r) => r.data.number).join(", ")}</> : "Aucune chambre libre sur ces dates."}</p>}
          </Card>
        </>
      )}
    </div>
  );
}

// ---------- Paiements et factures des séjours ----------

export function StayPaymentsView() {
  const { level, act, name } = useV();
  const { stays, guest, room, pays } = useLookups();
  const [pay, setPay] = useState<string | null>(null);
  const [folio, setFolio] = useState<Doc<Stay> | null>(null);
  const [charge, setCharge] = useState<Doc<Stay> | null>(null);
  const list = stays.filter((s) => s.data.status === "arrivee" || s.data.status === "reservee" || (s.data.status === "partie" && stayDue(s.data, pays, s.id) > 0)).sort((a, b) => a.data.arrival.localeCompare(b.data.arrival));
  const done = stays.filter((s) => s.data.status === "partie" && stayDue(s.data, pays, s.id) === 0).sort((a, b) => b.data.departure.localeCompare(a.data.departure)).slice(0, 20);
  const pending = pays.filter((p) => p.data.target === "stay" && p.data.status === "en_attente");
  const card = (s: Doc<Stay>) => {
    const sums = paidSums(pays, "stay", s.id);
    const total = stayTotal(s.data);
    const due = Math.max(0, total - sums.confirmed);
    return (
      <li key={s.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium">{guest(s.data.guest_id)?.data.name} <span className="font-normal text-slate-500">· ch. {room(s.data.room_id)?.data.number} · {s.data.ref}</span></p>
            <p className="text-xs text-slate-500">Total {fmtMoney(total)} · payé {fmtMoney(sums.confirmed)}{sums.pending > 0 && ` · ${fmtMoney(sums.pending)} en attente`} · {s.data.charges.length} prestation(s)</p>
          </div>
          <Pill tone={due === 0 ? "green" : sums.confirmed > 0 ? "amber" : "slate"}>{due === 0 ? "Soldé" : `Reste ${fmtMoney(due)}`}</Pill>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {level >= 1 && due > 0 && <Btn small onClick={() => setPay(s.id)}>Encaisser</Btn>}
          {level >= 1 && STAY_ACTIVE.includes(s.data.status) && <Btn small kind="ghost" onClick={() => setCharge(s)}><Plus className="h-3.5 w-3.5" aria-hidden />Prestation</Btn>}
          <Btn small kind="soft" onClick={() => setFolio(s)}><FileText className="h-3.5 w-3.5" aria-hidden />Facture</Btn>
        </div>
      </li>
    );
  };
  return (
    <div className="space-y-3">
      <ReadOnlyNote />
      {list.length === 0 ? <Empty text="Aucun séjour à encaisser." icon={CircleCheck} /> : <ul className="space-y-1.5">{list.map(card)}</ul>}
      {pending.length > 0 && (
        <Card title="Paiements en attente de confirmation">
          <ul className="space-y-1.5 text-sm">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-3 py-2">
                <span>{fmtMoney(p.data.amount)} · {byId<Stay>(stays, p.data.target_id)?.data.ref} · {fmtDateTime(p.data.at)} · {name(p.data.by)}</span>
                {level >= 1 && <span className="flex gap-1.5"><Btn small onClick={() => act("payment.confirm", { id: p.id }, { confirm: "Confirmer la réception de ce paiement ?" })}>Confirmer</Btn>{isMgr(level) && <Btn small kind="danger" onClick={async () => { const reason = window.prompt("Motif :"); if (reason) await act("payment.cancel", { id: p.id, reason }); }}>Annuler</Btn>}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {done.length > 0 && <Card title="Séjours soldés récents"><ul className="space-y-1.5">{done.map(card)}</ul></Card>}
      {pay && <PaymentForm target="stay" targetId={pay} onClose={() => setPay(null)} />}
      {folio && <StayFolio stay={folio} onClose={() => setFolio(null)} />}
      {charge && <ChargeForm stay={charge} onClose={() => setCharge(null)} />}
    </div>
  );
}

function ChargeForm({ stay, onClose }: { stay: Doc<Stay>; onClose: () => void }) {
  const { act } = useV();
  const [key] = useIdem();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <Modal title={`Prestation sur ${stay.data.ref}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => (e.preventDefault(), (await act("stay.charge", { id: stay.id, label, amount: parseNum(amount), idem: key })) && onClose())}>
        <Field label="Libellé"><input className={inp} required maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. : blanchisserie, minibar" /></Field>
        <Field label="Montant (FCFA)"><input className={inp} required inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit">Ajouter</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Informations des clients ----------

export function GuestsView() {
  const { v, level } = useV();
  const { stays, room } = useLookups();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Doc<Guest> | "new" | null>(null);
  if (level < 1) return <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600"><ShieldCheck className="h-4 w-4" aria-hidden />Les informations des clients sont réservées à l&apos;équipe autorisée.</p>;
  const guests = docs<Guest>(v.data.guest).filter((g) => !q || searchable(`${g.data.name} ${g.data.phone} ${g.data.email}`).includes(searchable(q))).sort((a, b) => a.data.name.localeCompare(b.data.name));
  return (
    <div className="space-y-3">
      <p className="flex items-start gap-2 text-xs text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Données personnelles visibles par l&apos;équipe du logiciel seulement (pas par les comptes en lecture seule). N&apos;enregistrez que ce qui est utile au séjour.</p>
      <div className="flex gap-2"><div className="flex-1"><Search value={q} onChange={setQ} placeholder="Rechercher un client" /></div><Btn onClick={() => setEdit("new")}><Plus className="h-4 w-4" aria-hidden />Client</Btn></div>
      {guests.length === 0 ? (
        <Empty text="Aucun client enregistré." icon={SearchIcon} />
      ) : (
        <ul className="space-y-1.5">
          {guests.map((g) => {
            const mine = stays.filter((s) => s.data.guest_id === g.id);
            return (
              <li key={g.id} className="rounded-xl border border-slate-200 bg-white p-2.5 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{g.data.name}</p>
                    <p className="text-xs text-slate-500">{[g.data.phone, g.data.email, g.data.nationality].filter(Boolean).join(" · ") || "Aucune coordonnée"}{isMgr(level) && g.data.id_number && ` · ${g.data.id_type} ${g.data.id_number}`}</p>
                    {mine.length > 0 && <p className="mt-0.5 text-xs text-slate-600">{mine.length} séjour(s), dernier : ch. {room(mine.sort((a, b) => b.data.arrival.localeCompare(a.data.arrival))[0]!.data.room_id)?.data.number} le {fmtDate(mine[0]!.data.arrival)}</p>}
                  </div>
                  <button type="button" onClick={() => setEdit(g)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label={`Modifier ${g.data.name}`}><Pencil className="h-3.5 w-3.5" aria-hidden /></button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <GuestForm guest={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function GuestForm({ guest, onClose }: { guest: Doc<Guest> | null; onClose: () => void }) {
  const { act } = useV();
  const d = guest?.data;
  const [f, setF] = useState({ name: d?.name ?? "", phone: d?.phone ?? "", email: d?.email ?? "", id_type: d?.id_type ?? "", id_number: d?.id_number ?? "", nationality: d?.nationality ?? "", address: d?.address ?? "", notes: d?.notes ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={guest ? d!.name : "Nouveau client"} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => (e.preventDefault(), (await act("guest.save", { id: guest?.id, ...f })) && onClose())}>
        <Field label="Nom" className="sm:col-span-2"><input className={inp} required maxLength={120} value={f.name} onChange={set("name")} /></Field>
        <Field label="Téléphone"><input className={inp} type="tel" maxLength={40} value={f.phone} onChange={set("phone")} /></Field>
        <Field label="E-mail"><input className={inp} type="email" maxLength={200} value={f.email} onChange={set("email")} /></Field>
        <Field label="Type de pièce d'identité"><input className={inp} maxLength={40} value={f.id_type} onChange={set("id_type")} /></Field>
        <Field label="Numéro"><input className={inp} maxLength={60} value={f.id_number} onChange={set("id_number")} /></Field>
        <Field label="Nationalité"><input className={inp} maxLength={60} value={f.nationality} onChange={set("nationality")} /></Field>
        <Field label="Adresse"><input className={inp} maxLength={200} value={f.address} onChange={set("address")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className={inp} maxLength={500} value={f.notes} onChange={set("notes")} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit">Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

// ---------- Chambres ----------

export function RoomsList({ onRoom }: { onRoom: (id: string) => void }) {
  const { level } = useV();
  const { rooms, stays } = useLookups();
  const [edit, setEdit] = useState<Doc<Room> | "new" | null>(null);
  return (
    <div className="space-y-3">
      <ReadOnlyNote need={2} />
      {isMgr(level) && <Btn onClick={() => setEdit("new")}><Plus className="h-4 w-4" aria-hidden />Ajouter une chambre</Btn>}
      {rooms.length === 0 ? (
        <Empty text="Aucune chambre enregistrée. Ajoutez vos chambres : elles apparaîtront sur le plan." icon={BedDouble} />
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {rooms.map((r) => {
            const s = roomState(r, stays);
            return (
              <li key={r.id}>
                <button type="button" onClick={() => onRoom(r.id)} className="tab-press flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm hover:border-[var(--app-primary)]">
                  <span><span className="font-semibold">Chambre {r.data.number}</span><span className="block text-xs text-slate-500">{r.data.type} · {r.data.capacity} pers. · {r.data.price_night !== null ? `${fmtMoney(r.data.price_night)} / nuit` : "prix non renseigné"}</span></span>
                  <Pill tone={ROOM_TONE[s]}>{ROOM_STATE_LABELS[s]}</Pill>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {edit && <RoomForm room={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RoomForm({ room, onClose }: { room: Doc<Room> | null; onClose: () => void }) {
  const { act } = useV();
  const d = room?.data;
  const [f, setF] = useState({ number: d?.number ?? "", type: d?.type ?? "Double", capacity: String(d?.capacity ?? 2), beds: d?.beds ?? "", amenities: (d?.amenities ?? []).join(", "), price_night: numOrEmpty(d?.price_night), floor: d?.floor ?? "", notes: d?.notes ?? "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title={room ? `Chambre ${d!.number}` : "Nouvelle chambre"} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => (e.preventDefault(), (await act("room.save", { id: room?.id, ...f, capacity: Number(f.capacity), price_night: parseNum(f.price_night), amenities: f.amenities.split(",").map((x) => x.trim()).filter(Boolean) })) && onClose())}>
        <Field label="Numéro"><input className={inp} required maxLength={20} value={f.number} onChange={set("number")} /></Field>
        <Field label="Type"><input className={inp} required maxLength={60} value={f.type} onChange={set("type")} placeholder="Simple, Double, Suite…" /></Field>
        <Field label="Capacité (personnes)"><input className={inp} inputMode="numeric" required value={f.capacity} onChange={set("capacity")} /></Field>
        <Field label="Lits"><input className={inp} maxLength={120} value={f.beds} onChange={set("beds")} placeholder="1 lit double" /></Field>
        <Field label="Prix par nuit (FCFA)"><input className={inp} inputMode="numeric" value={f.price_night} onChange={set("price_night")} /></Field>
        <Field label="Étage"><input className={inp} maxLength={20} value={f.floor} onChange={set("floor")} /></Field>
        <Field label="Équipements (séparés par des virgules)" className="sm:col-span-2"><input className={inp} value={f.amenities} onChange={set("amenities")} placeholder="Climatisation, TV, Wi-Fi, salle de bain privée" /></Field>
        <Field label="Notes" className="sm:col-span-2"><input className={inp} maxLength={500} value={f.notes} onChange={set("notes")} /></Field>
        <div className="flex justify-end gap-2 sm:col-span-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit">Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}

/** Panneau d'une chambre : informations, état, nettoyage, réservations, équipements et dépenses. */
export function RoomDetail({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  const { v, level, act } = useV();
  const { stays, guest } = useLookups();
  const room = byId<Room>(v.data.room, roomId);
  const [tab, setTab] = useState<"info" | "etat" | "nettoyage" | "reservations" | "equipements">("info");
  const [edit, setEdit] = useState(false);
  const [clean, setClean] = useState(false);
  if (!room) return <Empty text="Cette chambre n'existe plus." />;
  const r = room.data;
  const s = roomState(room, stays);
  const current = stays.find((x) => x.data.room_id === roomId && x.data.status === "arrivee");
  const cleanings = docs<Task>(v.data.task).filter((t) => t.data.room_id === roomId && t.data.kind === "nettoyage" && t.data.status === "fait").sort((a, b) => (b.data.done_at ?? "").localeCompare(a.data.done_at ?? "")).slice(0, 15);
  const repairs = docs<Task>(v.data.task).filter((t) => t.data.room_id === roomId && (t.data.kind === "reparation" || t.data.kind === "signalement"));
  const repairCost = repairs.reduce((a, t) => a + (t.data.cost ?? 0), 0);
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm text-slate-600 hover:text-slate-900">← Toutes les chambres</button>
      <div className="flex items-center justify-between gap-2 rounded-2xl border-2 bg-white p-3" style={{ borderColor: "var(--app-primary)" }}>
        <div>
          <p className="text-lg font-bold">Chambre {r.number}</p>
          <p className="text-xs text-slate-500">{r.type} · {r.capacity} pers.{current && ` · ${guest(current.data.guest_id)?.data.name} jusqu'au ${fmtDate(current.data.departure)}`}</p>
        </div>
        <Pill tone={ROOM_TONE[s]}>{ROOM_STATE_LABELS[s]}</Pill>
      </div>
      <Tabs label="Sections de la chambre" value={tab} onChange={setTab} tabs={[{ id: "info", label: "Informations", icon: Info }, { id: "etat", label: "État", icon: CalendarCheck }, { id: "nettoyage", label: "Nettoyage", icon: Brush }, { id: "reservations", label: "Réservations", icon: CalendarDays }, { id: "equipements", label: "Équipements", icon: Wrench }]} />
      {tab === "info" && (
        <Card title="Informations" actions={isMgr(level) ? <Btn small kind="ghost" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</Btn> : undefined}>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div><dt className="text-xs text-slate-500">Numéro</dt><dd className="font-medium">{r.number}</dd></div>
            <div><dt className="text-xs text-slate-500">Type</dt><dd className="font-medium">{r.type}</dd></div>
            <div><dt className="text-xs text-slate-500">Capacité</dt><dd className="font-medium">{r.capacity} personne(s)</dd></div>
            <div><dt className="text-xs text-slate-500">Lits</dt><dd className="font-medium">{r.beds || "—"}</dd></div>
            <div><dt className="text-xs text-slate-500">Prix par nuit</dt><dd className="font-medium">{r.price_night !== null ? fmtMoney(r.price_night) : "Non renseigné"}</dd></div>
            <div><dt className="text-xs text-slate-500">Étage</dt><dd className="font-medium">{r.floor || "—"}</dd></div>
            <div className="col-span-2"><dt className="text-xs text-slate-500">Équipements</dt><dd>{r.amenities.length ? r.amenities.join(", ") : "—"}</dd></div>
          </dl>
        </Card>
      )}
      {tab === "etat" && (
        <Card title="État de la chambre">
          <p className="text-sm">État actuel : <strong>{ROOM_STATE_LABELS[s]}</strong></p>
          <p className="mt-1 text-xs text-slate-500">« Occupée » et « Réservée » découlent des séjours enregistrés à la réception ; « À nettoyer » est mis automatiquement au départ du client.</p>
          {level >= 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {r.housekeeping === "a_nettoyer" && <Btn small onClick={() => setClean(true)}><Brush className="h-3.5 w-3.5" aria-hidden />Nettoyage fait</Btn>}
              {r.housekeeping === "propre" && s !== "occupee" && <Btn small kind="soft" onClick={() => act("room.state", { id: roomId, to: "a_nettoyer" })}>Marquer à nettoyer</Btn>}
              {isMgr(level) && !r.maintenance && <Btn small kind="danger" onClick={() => act("room.state", { id: roomId, to: "maintenance_on" }, { confirm: `Mettre la chambre ${r.number} en maintenance ? Elle ne pourra plus être réservée.` })}>Mettre en maintenance</Btn>}
              {isMgr(level) && r.maintenance && <Btn small onClick={() => act("room.state", { id: roomId, to: "maintenance_off" }, { confirm: "Terminer la maintenance ?" })}>Fin de maintenance</Btn>}
            </div>
          )}
        </Card>
      )}
      {tab === "nettoyage" && (
        <div className="space-y-3">
          {level >= 1 && <Btn onClick={() => setClean(true)}><Brush className="h-4 w-4" aria-hidden />Enregistrer un nettoyage</Btn>}
          <Card title="Historique des nettoyages">
            {cleanings.length === 0 ? <p className="text-sm text-slate-500">Aucun nettoyage enregistré.</p> : <ul className="space-y-1 text-sm">{cleanings.map((t) => <li key={t.id}>{fmtDateTime(t.data.done_at)} · {t.data.staff_id ? (byId<{ name: string }>(v.data.staff, t.data.staff_id)?.data.name ?? "Employé") : "—"}</li>)}</ul>}
          </Card>
          <TasksView zone="chambre" roomId={roomId} kinds={["nettoyage", "entretien", "signalement"]} title="Tâches de la chambre" />
        </div>
      )}
      {tab === "reservations" && <StaysView roomId={roomId} />}
      {tab === "equipements" && (
        <div className="space-y-3">
          <EquipList zone="chambre" roomId={roomId} categories={["equipement", "mobilier", "installation", "decoration", "eclairage"]} title="Équipements de la chambre" />
          <Card title="Pannes et réparations">
            {repairs.length === 0 ? <p className="text-sm text-slate-500">Aucune panne signalée.</p> : <ul className="space-y-1 text-sm">{repairs.map((t) => <li key={t.id} className="flex justify-between"><span>{t.data.title}</span><span className="text-xs text-slate-500">{t.data.status === "fait" ? `réparé${t.data.cost !== null ? ` · ${fmtMoney(t.data.cost)}` : ""}` : "en cours"}</span></li>)}</ul>}
            {repairCost > 0 && <p className="mt-1 text-xs text-slate-600">Coût des réparations enregistrées : {fmtMoney(repairCost)}</p>}
          </Card>
        </div>
      )}
      {edit && <RoomForm room={room} onClose={() => setEdit(false)} />}
      {clean && <CleanForm room={room} onClose={() => setClean(false)} />}
    </div>
  );
}

function CleanForm({ room, onClose }: { room: Doc<Room>; onClose: () => void }) {
  const { v, act } = useV();
  const [key] = useIdem();
  const staff = docs<{ name: string; active: boolean }>(v.data.staff).filter((s) => s.data.active);
  const [f, setF] = useState({ staff_id: "", date: today(), issue: "" });
  return (
    <Modal title={`Nettoyage · chambre ${room.data.number}`} onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => (e.preventDefault(), (await act("room.clean", { id: room.id, staff_id: f.staff_id || null, date: f.date, issue: f.issue, idem: key })) && onClose())}>
        <Field label="Responsable">{staff.length ? <select className={inp} value={f.staff_id} onChange={(e) => setF({ ...f, staff_id: e.target.value })}><option value="">Moi</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.data.name}</option>)}</select> : <p className="text-xs text-slate-500">Vous (ajoutez le personnel au bureau pour choisir un employé).</p>}</Field>
        <Field label="Date"><input type="date" className={inp} value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Problème constaté (facultatif)" hint="Crée un signalement visible au bureau."><textarea className={inp} rows={2} maxLength={500} value={f.issue} onChange={(e) => setF({ ...f, issue: e.target.value })} /></Field>
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit"><Brush className="h-4 w-4" aria-hidden />Enregistrer</Btn></div>
      </form>
    </Modal>
  );
}
