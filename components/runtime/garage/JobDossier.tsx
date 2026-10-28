"use client";

import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, ClipboardCheck, Clock, FileText, History, ImagePlus, Package, Pause, Play, Plus, Receipt, Stethoscope, Trash2, Wallet, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  INVOICE_STATUS_LABELS,
  JOB_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  PRIORITIES,
  PRIORITY_LABELS,
  QUOTE_STATUS_LABELS,
  TRANSITIONS,
  acceptedQuote,
  balance,
  fmtDate,
  fmtDateTime,
  fmtMinutes,
  fmtMoney,
  fmtQty,
  isLate,
  minutesLogged,
  quoteTotals,
  today,
  type Client,
  type Doc,
  type Invoice,
  type Job,
  type JobStatus,
  type Part,
  type Payment,
  type PaymentMethod,
  type Quote,
  type QuoteLine,
  type TimeEntry,
  type Vehicle,
} from "@/lib/garage/model";
import { CHANNEL_LABELS } from "@/lib/garage/engine";
import { InvoiceDoc, QuoteDoc, ReceiptDoc } from "./docs";
import { Btn, Card, Empty, Field, MemberSelect, Modal, Pill, Tabs, byId, inp, isMgr, useG, useIdem, type Tone } from "./ui";

export const STATUS_TONE: Record<JobStatus, Tone> = { attente: "slate", diagnostic: "violet", reparation: "blue", controle: "amber", pret: "green", remis: "slate", annule: "red" };
export const PRIORITY_TONE = { normale: "slate", haute: "amber", urgente: "red" } as const;

type TabId = "resume" | "diag" | "pieces" | "temps" | "devis" | "controle" | "facture" | "photos" | "historique";

export function JobDossier({ jobId, onBack, focus }: { jobId: string; onBack: () => void; focus: "accueil" | "atelier" }) {
  const { g } = useG();
  const job = byId<Job>(g.data.job, jobId);
  const [tab, setTab] = useState<TabId>(focus === "atelier" ? "diag" : "resume");
  if (!job) return <Empty text="Ce dossier n'existe plus ou n'est pas accessible."><Btn kind="ghost" small onClick={onBack}>Retour</Btn></Empty>;
  const vehicle = byId<Vehicle>(g.data.vehicle, job.data.vehicle_id);
  const client = byId<Client>(g.data.client, job.data.client_id);
  const j = job.data;
  const quotes = (g.data.quote as Doc<Quote>[]).filter((q) => q.data.job_id === jobId);
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <button type="button" onClick={onBack} className="mt-0.5 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Retour à la liste"><ArrowLeft className="h-4 w-4" aria-hidden /></button>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-sm font-semibold">{j.ref}</span>
            <Pill tone={STATUS_TONE[j.status]}>{JOB_STATUS_LABELS[j.status]}</Pill>
            {j.priority !== "normale" && <Pill tone={PRIORITY_TONE[j.priority]}>{PRIORITY_LABELS[j.priority]}</Pill>}
            {isLate(j) && <Pill tone="red">En retard</Pill>}
          </p>
          <p className="truncate text-sm text-slate-600">{vehicle ? `${vehicle.data.plate} · ${vehicle.data.make} ${vehicle.data.model}` : "Véhicule ?"} — {client?.data.name ?? "Client ?"}</p>
        </div>
      </div>
      {j.status === "pret" && <p className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800"><CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />Véhicule prêt depuis le {fmtDateTime(j.ready_at)} : prévenez le client ({client?.data.phone || client?.data.email || "coordonnées manquantes"}).</p>}
      <Tabs<TabId>
        label="Sections du dossier"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "resume", label: "Résumé", icon: FileText },
          { id: "diag", label: "Diagnostic", icon: Stethoscope },
          { id: "pieces", label: "Pièces", icon: Package, count: j.parts.filter((p) => !p.consumed).length + j.missing.filter((m) => m.status !== "recue").length },
          { id: "temps", label: "Temps", icon: Clock },
          { id: "devis", label: "Devis", icon: Receipt, count: quotes.filter((q) => q.data.status === "envoye").length },
          { id: "controle", label: "Contrôle", icon: ClipboardCheck },
          { id: "facture", label: "Facture", icon: Wallet },
          { id: "photos", label: "Photos", icon: Camera, count: j.photo_count },
          { id: "historique", label: "Historique", icon: History },
        ]}
      />
      {tab === "resume" && <Summary job={job} />}
      {tab === "diag" && <Diagnosis job={job} />}
      {tab === "pieces" && <Parts job={job} />}
      {tab === "temps" && <Times job={job} />}
      {tab === "devis" && <Quotes job={job} quotes={quotes} />}
      {tab === "controle" && <Quality job={job} />}
      {tab === "facture" && <Billing job={job} />}
      {tab === "photos" && <Photos job={job} />}
      {tab === "historique" && <Timeline job={job} quotes={quotes} />}
    </div>
  );
}

// ---------- Résumé et statut ----------

function StatusActions({ job }: { job: Doc<Job> }) {
  const { g, act, level, ask } = useG();
  const [busy, setBusy] = useState<string | null>(null);
  const j = job.data;
  const nexts = TRANSITIONS[j.status].filter((s) => s !== "pret");
  const blocked = j.requires_quote && !acceptedQuote(g.data.quote, job.id);
  const inv = byId<Invoice>(g.data.invoice, j.invoice_id);
  async function go(to: JobStatus) {
    let confirm_balance = false;
    if (to === "remis") {
      const due = inv && !inv.data.cancelled ? balance(inv.data) : null;
      if (due === null || due > 0) {
        if (!(await ask(due === null ? "Aucune facture n'est liée à ce dossier. Remettre quand même le véhicule au client ?" : `Il reste ${fmtMoney(due)} à payer. Remettre quand même le véhicule au client ?`))) return;
        confirm_balance = true;
      } else if (!(await ask("Confirmer la remise du véhicule au client ?"))) return;
    }
    if (to === "annule" && !(await ask("Annuler ce dossier ? Il restera consultable dans l'historique."))) return;
    setBusy(to);
    await act("job.status", { id: job.id, to, confirm_balance });
    setBusy(null);
  }
  if (!nexts.length) return <p className="text-xs text-slate-500">Dossier clôturé : plus aucun changement de statut possible.</p>;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {nexts.map((to) => {
          const lock = (to === "reparation" && j.status === "diagnostic" && blocked) || (to === "annule" && !isMgr(level)) || (j.status === "pret" && to === "reparation" && !isMgr(level)) || level < 1;
          return (
            <Btn key={to} small kind={to === "annule" ? "danger" : to === "remis" || to === "reparation" || to === "controle" || to === "diagnostic" ? "primary" : "ghost"} busy={busy === to} disabled={lock} onClick={() => go(to)} title={lock && to === "reparation" ? "Accord du client sur un devis requis" : undefined}>
              {to === "remis" ? "Remettre au client" : to === "annule" ? "Annuler le dossier" : `→ ${JOB_STATUS_LABELS[to]}`}
            </Btn>
          );
        })}
      </div>
      {j.status === "diagnostic" && blocked && <p className="flex items-start gap-1.5 text-xs text-amber-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />Travaux soumis à devis : la réparation démarre après l&apos;accord du client enregistré (onglet Devis).</p>}
      {j.status === "controle" && <p className="text-xs text-slate-500">Le statut « Prêt » est donné par la validation du contrôle qualité (onglet Contrôle).</p>}
    </div>
  );
}

function Summary({ job }: { job: Doc<Job> }) {
  const { g, act, level, name } = useG();
  const j = job.data;
  const [f, setF] = useState({ complaint: j.complaint, requested_work: j.requested_work, priority: j.priority, mechanic_id: j.mechanic_id, planned_end: j.planned_end ?? "", planned_minutes: j.planned_minutes ?? "", requires_quote: j.requires_quote });
  const [busy, setBusy] = useState(false);
  const closed = j.status === "remis" || j.status === "annule";
  const client = byId<Client>(g.data.client, j.client_id);
  const vehicle = byId<Vehicle>(g.data.vehicle, j.vehicle_id);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await act("job.update", { id: job.id, ...f, planned_end: f.planned_end || null, planned_minutes: f.planned_minutes === "" ? null : f.planned_minutes });
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <Card title="Statut">
        <StatusActions job={job} />
      </Card>
      <Card title="Client et véhicule">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <dt className="text-slate-500">Client</dt><dd>{client?.data.name ?? "—"}</dd>
          <dt className="text-slate-500">Contact</dt><dd className="truncate">{client?.data.phone || client?.data.email || "—"}</dd>
          <dt className="text-slate-500">Véhicule</dt><dd>{vehicle ? `${vehicle.data.plate} · ${vehicle.data.make} ${vehicle.data.model}` : "—"}</dd>
          <dt className="text-slate-500">Kilométrage entrée</dt><dd>{j.mileage_in !== null ? `${j.mileage_in.toLocaleString("fr-FR")} km` : "—"}</dd>
          <dt className="text-slate-500">Déposé le</dt><dd>{fmtDateTime(job.created_at)}</dd>
          <dt className="text-slate-500">Responsable</dt><dd>{j.mechanic_id ? name(j.mechanic_id) : "Non attribué"}</dd>
        </dl>
      </Card>
      <form onSubmit={save} className="space-y-3">
        <Card title="Demande du client" actions={!closed && level >= 1 ? <Btn small type="submit" busy={busy}>Enregistrer</Btn> : undefined}>
          <fieldset disabled={closed || level < 1} className="space-y-2.5">
            <Field label="Panne ou demande"><textarea className={inp} rows={3} value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} required maxLength={2000} /></Field>
            <Field label="Travaux demandés"><textarea className={inp} rows={2} value={f.requested_work} onChange={(e) => setF({ ...f, requested_work: e.target.value })} maxLength={2000} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Priorité">
                <select className={inp} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Job["priority"] })}>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>
              </Field>
              <MemberSelect value={f.mechanic_id} onChange={(v) => setF({ ...f, mechanic_id: v })} />
              <Field label="Fin prévue"><input type="date" className={inp} value={f.planned_end} onChange={(e) => setF({ ...f, planned_end: e.target.value })} /></Field>
              <Field label="Temps prévu (min)"><input type="number" min={0} className={inp} value={f.planned_minutes} onChange={(e) => setF({ ...f, planned_minutes: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={f.requires_quote} disabled={j.requires_quote && !isMgr(level)} onChange={(e) => setF({ ...f, requires_quote: e.target.checked })} />
              <span>Travaux soumis à devis et à l&apos;accord du client{j.requires_quote && !isMgr(level) ? " (seul un gérant peut lever cette obligation)" : ""}</span>
            </label>
          </fieldset>
        </Card>
      </form>
    </div>
  );
}

// ---------- Diagnostic et main-d'œuvre ----------

function Diagnosis({ job }: { job: Doc<Job> }) {
  const { act, level } = useG();
  const j = job.data;
  const closed = j.status === "remis" || j.status === "annule";
  const [diag, setDiag] = useState(j.diagnosis);
  const [lines, setLines] = useState(j.labour.map((l) => ({ ...l })));
  const [busy, setBusy] = useState<"d" | "l" | null>(null);
  useEffect(() => setLines(j.labour.map((l) => ({ ...l }))), [j.labour]);
  const total = lines.reduce((a, l) => a + Math.round((Number(l.hours) || 0) * (Number(l.rate) || 0)), 0);
  return (
    <div className="space-y-3">
      <Card title="Problème signalé"><p className="whitespace-pre-wrap text-sm text-slate-700">{j.complaint}</p>{j.requested_work && <p className="mt-1 text-sm text-slate-500">Demandé : {j.requested_work}</p>}</Card>
      <Card title="Diagnostic" actions={!closed && level >= 1 ? <Btn small busy={busy === "d"} disabled={diag === j.diagnosis} onClick={async () => (setBusy("d"), await act("job.update", { id: job.id, diagnosis: diag }), setBusy(null))}>Enregistrer</Btn> : undefined}>
        <label className="sr-only" htmlFor="diag">Diagnostic</label>
        <textarea id="diag" className={inp} rows={4} value={diag} onChange={(e) => setDiag(e.target.value)} disabled={closed || level < 1} maxLength={4000} placeholder="Constat, causes, travaux nécessaires…" />
      </Card>
      <Card title="Travaux et main-d'œuvre" actions={!closed && level >= 1 ? <Btn small busy={busy === "l"} onClick={async () => (setBusy("l"), await act("job.labour", { job_id: job.id, lines: lines.map((l) => ({ ...l, hours: Number(l.hours) || 0, rate: Number(l.rate) || 0 })) }), setBusy(null))}>Enregistrer</Btn> : undefined}>
        {lines.length === 0 && <p className="mb-2 text-sm text-slate-500">Aucun travail saisi.</p>}
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={l.id || i} className="grid grid-cols-[1fr_70px_100px_auto] items-end gap-1.5">
              <Field label={i === 0 ? "Travail" : ""}><input className={inp} value={l.label} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} disabled={closed} maxLength={160} /></Field>
              <Field label={i === 0 ? "Heures" : ""}><input type="number" min={0} step="0.25" className={inp} value={l.hours} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, hours: e.target.value as unknown as number } : x)))} disabled={closed} /></Field>
              <Field label={i === 0 ? "Taux horaire" : ""}><input type="number" min={0} className={inp} value={l.rate} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, rate: e.target.value as unknown as number } : x)))} disabled={closed} /></Field>
              <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} disabled={closed} className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Retirer ce travail"><Trash2 className="h-4 w-4" aria-hidden /></button>
            </div>
          ))}
        </div>
        {!closed && <Btn small kind="soft" className="mt-2" onClick={() => setLines([...lines, { id: "", label: "", hours: 1, rate: 0 }])}><Plus className="h-3.5 w-3.5" aria-hidden />Ajouter un travail</Btn>}
        <p className="mt-2 text-right text-sm text-slate-600">Main-d&apos;œuvre : <strong>{fmtMoney(total)}</strong></p>
      </Card>
    </div>
  );
}

// ---------- Pièces ----------

function Parts({ job }: { job: Doc<Job> }) {
  const { g, act, level, ask, name } = useG();
  const j = job.data;
  const closed = j.status === "remis" || j.status === "annule";
  const parts = (g.data.part as Doc<Part>[]).filter((p) => p.data.active);
  const [pid, setPid] = useState("");
  const [qty, setQty] = useState(1);
  const [now, setNow] = useState(true);
  const [lineKey, resetLine] = useIdem();
  const [busy, setBusy] = useState<string | null>(null);
  const [miss, setMiss] = useState({ label: "", qty: 1 });
  const chosen = parts.find((p) => p.id === pid);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!pid) return;
    setBusy("add");
    const r = await act("job.part.add", { job_id: job.id, part_id: pid, qty, consume_now: now, line_id: lineKey });
    setBusy(null);
    if (r) {
      resetLine();
      setPid("");
      setQty(1);
    }
  }
  return (
    <div className="space-y-3">
      <Card title="Pièces du dossier">
        {j.parts.length === 0 ? (
          <p className="text-sm text-slate-500">Aucune pièce. Les pièces d&apos;un devis accepté apparaissent ici automatiquement.</p>
        ) : (
          <ul className="space-y-1.5">
            {j.parts.map((l) => {
              const p = byId<Part>(g.data.part, l.part_id);
              const enough = p ? p.data.qty >= l.qty : false;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{l.label}</span>
                    <span className="block text-xs text-slate-500">× {fmtQty(l.qty)} · {fmtMoney(l.unit_price)} / u{!l.consumed && p ? ` · stock ${fmtQty(p.data.qty)}` : ""}</span>
                  </span>
                  {l.consumed ? <Pill tone="green">Prélevée {fmtDate(l.consumed_at)}</Pill> : enough ? <Pill tone="blue">Disponible</Pill> : <Pill tone="red">Stock insuffisant</Pill>}
                  {!closed && !l.consumed && level >= 1 && (
                    <Btn small busy={busy === l.id} disabled={!enough} onClick={async () => {
                      if (!(await ask(`Prélever ${fmtQty(l.qty)} × ${l.label} du stock pour ce dossier ?`))) return;
                      setBusy(l.id);
                      await act("job.part.consume", { job_id: job.id, line_id: l.id });
                      setBusy(null);
                    }}>Prélever</Btn>
                  )}
                  {!closed && (l.consumed ? isMgr(level) : level >= 1) && (
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={l.consumed ? "Remettre en stock et retirer" : "Retirer la pièce"} onClick={async () => {
                      if (!(await ask(l.consumed ? `Remettre ${fmtQty(l.qty)} × ${l.label} en stock et la retirer du dossier ?` : `Retirer ${l.label} du dossier ?`))) return;
                      await act("job.part.remove", { job_id: job.id, line_id: l.id });
                    }}><Trash2 className="h-4 w-4" aria-hidden /></button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      {!closed && level >= 1 && (
        <Card title="Ajouter une pièce du stock">
          {parts.length === 0 ? (
            <p className="text-sm text-slate-500">Le catalogue de pièces est vide : un gérant peut ajouter les pièces dans la zone Stock.</p>
          ) : (
            <form onSubmit={add} className="space-y-2">
              <Field label="Pièce">
                <select className={inp} value={pid} onChange={(e) => setPid(e.target.value)} required>
                  <option value="">— Choisir —</option>
                  {parts.map((p) => <option key={p.id} value={p.id}>{p.data.name}{p.data.ref ? ` (${p.data.ref})` : ""} — stock {fmtQty(p.data.qty)}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantité"><input type="number" min={0.01} step="any" className={inp} value={qty} onChange={(e) => setQty(Number(e.target.value))} required /></Field>
                <label className="mt-6 flex items-center gap-2 text-sm"><input type="checkbox" checked={now} onChange={(e) => setNow(e.target.checked)} />Pièce utilisée maintenant (prélever du stock)</label>
              </div>
              {chosen && now && chosen.data.qty < qty && <p className="text-xs text-red-600">Stock insuffisant ({fmtQty(chosen.data.qty)} disponible) : signalez la pièce manquante ci-dessous.</p>}
              <Btn type="submit" small busy={busy === "add"} disabled={!pid || qty <= 0}>{now ? "Ajouter et prélever" : "Ajouter au dossier"}</Btn>
            </form>
          )}
        </Card>
      )}
      <Card title="Pièces manquantes">
        {j.missing.length === 0 ? <p className="text-sm text-slate-500">Aucune pièce manquante signalée.</p> : (
          <ul className="space-y-1.5">
            {j.missing.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">{m.label} × {fmtQty(m.qty)} <span className="text-xs text-slate-500">· {name(m.by)}, {fmtDate(m.at)}</span></span>
                <select aria-label="Statut de la pièce manquante" className="rounded-lg border border-slate-300 px-2 py-1 text-xs" value={m.status} disabled={closed || level < 1} onChange={(e) => act("job.missing", { job_id: job.id, id: m.id, status: e.target.value })}>
                  <option value="signalee">Signalée</option>
                  <option value="commandee">Commandée</option>
                  <option value="recue">Reçue</option>
                </select>
              </li>
            ))}
          </ul>
        )}
        {!closed && level >= 1 && (
          <form className="mt-2 flex gap-1.5" onSubmit={async (e) => {
            e.preventDefault();
            if (await act("job.missing", { job_id: job.id, label: miss.label, qty: miss.qty, part_id: pid || null })) setMiss({ label: "", qty: 1 });
          }}>
            <label className="sr-only" htmlFor="miss">Pièce manquante</label>
            <input id="miss" className={inp} placeholder="Pièce manquante…" value={miss.label} onChange={(e) => setMiss({ ...miss, label: e.target.value })} required maxLength={160} />
            <label className="sr-only" htmlFor="missq">Quantité</label>
            <input id="missq" type="number" min={1} className={`${inp} !w-20`} value={miss.qty} onChange={(e) => setMiss({ ...miss, qty: Number(e.target.value) })} />
            <Btn type="submit" small kind="soft">Signaler</Btn>
          </form>
        )}
      </Card>
    </div>
  );
}

// ---------- Temps ----------

function Times({ job }: { job: Doc<Job> }) {
  const { g, act, level, name, ask } = useG();
  const j = job.data;
  const closed = j.status === "remis" || j.status === "annule";
  const entries = (g.data.time as Doc<TimeEntry>[]).filter((t) => t.data.job_id === job.id);
  const running = (g.data.time as Doc<TimeEntry>[]).find((t) => t.data.mechanic_id === g.me && t.data.started_at && !t.data.ended_at);
  const [f, setF] = useState({ minutes: 30, date: today(), note: "", mechanic_id: g.me });
  const [busy, setBusy] = useState(false);
  const logged = minutesLogged(g.data.time, job.id);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, [running]);
  const elapsed = running ? Math.max(0, Math.round((Date.now() - Date.parse(running.data.started_at!)) / 60000)) + tick * 0 : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-100 p-2.5"><span className="block text-[11px] text-slate-600">Temps prévu</span><span className="text-lg font-bold">{j.planned_minutes !== null ? fmtMinutes(j.planned_minutes) : "Non défini"}</span></div>
        <div className={`rounded-xl p-2.5 ${j.planned_minutes !== null && logged > j.planned_minutes ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}><span className="block text-[11px] opacity-80">Temps réel enregistré</span><span className="text-lg font-bold">{fmtMinutes(logged)}</span></div>
      </div>
      {!closed && level >= 1 && (
        <Card title="Chronomètre">
          {running ? (
            running.data.job_id === job.id ? (
              <div className="flex items-center justify-between gap-2"><span className="text-sm">En cours depuis {fmtMinutes(elapsed)}</span><Btn small onClick={() => act("time.stop", { id: running.id })}><Pause className="h-3.5 w-3.5" aria-hidden />Arrêter</Btn></div>
            ) : (
              <p className="text-sm text-amber-700">Un chronomètre tourne sur un autre dossier ({byId<Job>(g.data.job, running.data.job_id)?.data.ref}). Arrêtez-le d&apos;abord.</p>
            )
          ) : (
            <Btn small onClick={() => act("time.start", { job_id: job.id })}><Play className="h-3.5 w-3.5" aria-hidden />Démarrer mon temps sur ce dossier</Btn>
          )}
        </Card>
      )}
      {!closed && level >= 1 && (
        <Card title="Saisie manuelle">
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if (await act("time.add", { job_id: job.id, ...f })) setF({ ...f, note: "" });
            setBusy(false);
          }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Minutes"><input type="number" min={1} max={1440} className={inp} value={f.minutes} onChange={(e) => setF({ ...f, minutes: Number(e.target.value) })} required /></Field>
              <Field label="Date"><input type="date" max={today()} className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
            </div>
            {isMgr(level) && <MemberSelect value={f.mechanic_id} onChange={(v) => setF({ ...f, mechanic_id: v ?? g.me })} allowEmpty={false} />}
            <Field label="Note"><input className={inp} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></Field>
            <Btn type="submit" small busy={busy}>Enregistrer le temps</Btn>
          </form>
        </Card>
      )}
      <Card title="Temps enregistrés">
        {entries.length === 0 ? <p className="text-sm text-slate-500">Aucun temps enregistré.</p> : (
          <ul className="space-y-1">
            {entries.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{fmtDate(t.data.date)} · {name(t.data.mechanic_id)}{t.data.note ? ` · ${t.data.note}` : ""}</span>
                <span className="font-medium">{t.data.minutes !== null ? fmtMinutes(t.data.minutes) : "en cours"}</span>
                {(t.data.by === g.me || isMgr(level)) && t.data.minutes !== null && (
                  <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Supprimer ce temps" onClick={async () => (await ask("Supprimer cette saisie de temps ?")) && act("time.delete", { id: t.id })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---------- Devis ----------

type EditLine = Omit<QuoteLine, "qty" | "unit_price"> & { qty: number | string; unit_price: number | string };

function QuoteEditor({ job, quote, onDone }: { job: Doc<Job>; quote?: Doc<Quote>; onDone: () => void }) {
  const { g, act } = useG();
  const parts = (g.data.part as Doc<Part>[]).filter((p) => p.data.active);
  const seed = (): EditLine[] => {
    if (quote) return quote.data.lines.map((l) => ({ ...l }));
    return [
      ...job.data.labour.map((l) => ({ id: "", kind: "main_oeuvre" as const, label: l.label, part_id: null, qty: l.hours, unit_price: l.rate })),
      ...job.data.parts.map((p) => ({ id: "", kind: "piece" as const, label: p.label, part_id: p.part_id, qty: p.qty, unit_price: p.unit_price })),
    ];
  };
  const [lines, setLines] = useState<EditLine[]>(seed);
  const [note, setNote] = useState(quote?.data.note ?? "");
  const [busy, setBusy] = useState(false);
  const totals = quoteTotals(lines.map((l) => ({ kind: l.kind, qty: Number(l.qty) || 0, unit_price: Number(l.unit_price) || 0 })));
  const set = (i: number, patch: Partial<EditLine>) => setLines(lines.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await act("quote.save", { id: quote?.id ?? null, job_id: job.id, note, lines: lines.map((l) => ({ ...l, id: l.id || undefined, qty: Number(l.qty), unit_price: Number(l.unit_price) })) });
      setBusy(false);
      if (r) onDone();
    }}>
      {lines.map((l, i) => (
        <div key={i} className="space-y-1.5 rounded-xl border border-slate-200 p-2">
          <div className="flex gap-1.5">
            <label className="sr-only" htmlFor={`k${i}`}>Type</label>
            <select id={`k${i}`} className={`${inp} !w-36`} value={l.kind} onChange={(e) => set(i, { kind: e.target.value as EditLine["kind"], part_id: null })}>
              <option value="main_oeuvre">Main-d&apos;œuvre</option>
              <option value="piece">Pièce</option>
            </select>
            {l.kind === "piece" && (
              <>
                <label className="sr-only" htmlFor={`p${i}`}>Pièce du stock</label>
                <select id={`p${i}`} className={inp} value={l.part_id ?? ""} onChange={(e) => {
                  const p = parts.find((x) => x.id === e.target.value);
                  set(i, { part_id: e.target.value || null, ...(p ? { label: `${p.data.name}${p.data.ref ? ` (${p.data.ref})` : ""}`, unit_price: p.data.sell_price ?? l.unit_price } : {}) });
                }}>
                  <option value="">Pièce hors stock</option>
                  {parts.map((p) => <option key={p.id} value={p.id}>{p.data.name} — stock {fmtQty(p.data.qty)}</option>)}
                </select>
              </>
            )}
            <button type="button" onClick={() => setLines(lines.filter((_, k) => k !== i))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Retirer la ligne"><Trash2 className="h-4 w-4" aria-hidden /></button>
          </div>
          <div className="grid grid-cols-[1fr_70px_100px] gap-1.5">
            <label className="sr-only" htmlFor={`l${i}`}>Libellé</label>
            <input id={`l${i}`} className={inp} placeholder="Libellé" value={l.label} onChange={(e) => set(i, { label: e.target.value })} required maxLength={160} />
            <label className="sr-only" htmlFor={`q${i}`}>Quantité</label>
            <input id={`q${i}`} type="number" min={0.01} step="any" className={inp} value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} required />
            <label className="sr-only" htmlFor={`u${i}`}>Prix unitaire</label>
            <input id={`u${i}`} type="number" min={0} className={inp} placeholder="Prix" value={l.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} required />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        <Btn small kind="soft" onClick={() => setLines([...lines, { id: "", kind: "main_oeuvre", label: "", part_id: null, qty: 1, unit_price: "" }])}><Plus className="h-3.5 w-3.5" aria-hidden />Main-d&apos;œuvre</Btn>
        <Btn small kind="soft" onClick={() => setLines([...lines, { id: "", kind: "piece", label: "", part_id: null, qty: 1, unit_price: "" }])}><Plus className="h-3.5 w-3.5" aria-hidden />Pièce</Btn>
      </div>
      <Field label="Note pour le client"><textarea className={inp} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
      <div className="rounded-xl bg-slate-50 p-2.5 text-sm">
        <p className="flex justify-between"><span>Pièces</span><span>{fmtMoney(totals.total_parts)}</span></p>
        <p className="flex justify-between"><span>Main-d&apos;œuvre</span><span>{fmtMoney(totals.total_labour)}</span></p>
        <p className="flex justify-between font-bold"><span>Total</span><span>{fmtMoney(totals.total)}</span></p>
      </div>
      <div className="flex justify-end gap-2">
        <Btn kind="ghost" onClick={onDone}>Annuler</Btn>
        <Btn type="submit" busy={busy} disabled={!lines.length}>{quote ? "Enregistrer les modifications" : "Créer le devis"}</Btn>
      </div>
    </form>
  );
}

function Quotes({ job, quotes }: { job: Doc<Job>; quotes: Doc<Quote>[] }) {
  const { act, level, ask } = useG();
  const [edit, setEdit] = useState<Doc<Quote> | "new" | null>(null);
  const [print, setPrint] = useState<Doc<Quote> | null>(null);
  const [decide, setDecide] = useState<{ q: Doc<Quote>; to: "accepte" | "refuse" } | null>(null);
  const [dec, setDec] = useState({ channel: "signature", note: "" });
  const closed = job.data.status === "remis" || job.data.status === "annule";
  if (edit) return <Card title={edit === "new" ? "Nouveau devis" : `Modifier ${edit.data.number}`}><QuoteEditor job={job} quote={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} /></Card>;
  return (
    <div className="space-y-3">
      {!closed && level >= 1 && <Btn small onClick={() => setEdit("new")}><Plus className="h-3.5 w-3.5" aria-hidden />Nouveau devis</Btn>}
      {!job.data.requires_quote && <p className="text-xs text-slate-500">Ce dossier n&apos;est pas soumis à devis (dispense accordée par un gérant).</p>}
      {quotes.length === 0 ? <Empty text="Aucun devis pour ce dossier." icon={Receipt} /> : quotes.map((q) => (
        <Card key={q.id} title={<span className="flex items-center gap-2"><span className="font-mono">{q.data.number}</span><Pill tone={q.data.status === "accepte" ? "green" : q.data.status === "refuse" ? "red" : q.data.status === "envoye" ? "blue" : "slate"}>{QUOTE_STATUS_LABELS[q.data.status]}</Pill></span>} actions={<Btn small kind="ghost" onClick={() => setPrint(q)}>Voir / imprimer</Btn>}>
          <p className="text-sm">{q.data.lines.length} ligne(s) · Total <strong>{fmtMoney(q.data.total)}</strong> <span className="text-xs text-slate-500">(pièces {fmtMoney(q.data.total_parts)}, main-d&apos;œuvre {fmtMoney(q.data.total_labour)})</span></p>
          {q.data.decision && <p className="mt-1 text-xs text-slate-500">Réponse du client le {fmtDateTime(q.data.decision.at)} ({CHANNEL_LABELS[q.data.decision.channel] ?? q.data.decision.channel}){q.data.decision.note ? ` : ${q.data.decision.note}` : ""}</p>}
          {!closed && level >= 1 && (q.data.status === "brouillon" || q.data.status === "envoye") && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Btn small kind="ghost" onClick={() => setEdit(q)}>Modifier</Btn>
              {q.data.status === "brouillon" && <Btn small kind="soft" onClick={async () => (await ask("Marquer ce devis comme envoyé au client ?")) && act("quote.status", { id: q.id, to: "envoye" })}>Marquer envoyé</Btn>}
              <Btn small onClick={() => setDecide({ q, to: "accepte" })}>Accord du client</Btn>
              <Btn small kind="danger" onClick={() => setDecide({ q, to: "refuse" })}>Refus</Btn>
            </div>
          )}
        </Card>
      ))}
      {print && <QuoteDoc quote={print} onClose={() => setPrint(null)} />}
      {decide && (
        <Modal title={decide.to === "accepte" ? `Enregistrer l'accord du client (${decide.q.data.number})` : `Enregistrer le refus (${decide.q.data.number})`} onClose={() => setDecide(null)}>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            if (await act("quote.status", { id: decide.q.id, to: decide.to, ...dec })) setDecide(null);
          }}>
            <p className="text-sm text-slate-600">Montant : <strong>{fmtMoney(decide.q.data.total)}</strong>. N&apos;enregistrez une réponse que si le client l&apos;a réellement donnée.</p>
            <Field label="Réponse donnée par">
              <select className={inp} value={dec.channel} onChange={(e) => setDec({ ...dec, channel: e.target.value })}>
                <option value="signature">Signature du devis</option>
                <option value="oral">Accord oral au garage</option>
                <option value="telephone">Téléphone</option>
                <option value="message">SMS / message</option>
                <option value="email">E-mail</option>
              </select>
            </Field>
            <Field label="Précision (facultatif)"><input className={inp} value={dec.note} onChange={(e) => setDec({ ...dec, note: e.target.value })} maxLength={500} /></Field>
            <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={() => setDecide(null)}>Annuler</Btn><Btn type="submit" kind={decide.to === "refuse" ? "danger" : "primary"}>Confirmer</Btn></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------- Contrôle qualité ----------

function Quality({ job }: { job: Doc<Job> }) {
  const { act, level, name } = useG();
  const j = job.data;
  const [items, setItems] = useState(j.qc?.items ?? []);
  const [remarks, setRemarks] = useState(j.qc?.remarks ?? "");
  const [newItem, setNewItem] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setItems(j.qc?.items ?? []);
    setRemarks(j.qc?.remarks ?? "");
  }, [j.qc]);
  if (j.status !== "controle")
    return (
      <div className="space-y-3">
        <Empty text={j.status === "pret" || j.status === "remis" ? "Contrôle qualité validé." : "La liste de vérification s'ouvre quand le véhicule passe « En contrôle »."} icon={ClipboardCheck} />
        {j.qc?.validated_at && <Card title="Dernier contrôle"><p className="text-sm">{j.qc.result === "ok" ? "Validé" : "À reprendre"} par {name(j.qc.validated_by)} le {fmtDateTime(j.qc.validated_at)}</p>{j.qc.remarks && <p className="mt-1 text-sm text-slate-600">{j.qc.remarks}</p>}<ul className="mt-2 space-y-0.5 text-xs text-slate-600">{j.qc.items.map((x, i) => <li key={i}>{x.ok ? "✓" : "✗"} {x.label}{x.note ? ` — ${x.note}` : ""}</li>)}</ul></Card>}
        {j.rework_count > 0 && <p className="text-xs text-amber-700">Travaux repris {j.rework_count} fois.</p>}
      </div>
    );
  const allOk = items.length > 0 && items.every((x) => x.ok);
  return (
    <div className="space-y-3">
      <Card title="Liste de vérification" actions={level >= 1 ? <Btn small busy={busy === "save"} onClick={async () => (setBusy("save"), await act("qc.save", { job_id: job.id, items, remarks }), setBusy(null))}>Enregistrer</Btn> : undefined}>
        <ul className="space-y-1.5">
          {items.map((x, i) => (
            <li key={i} className="rounded-xl border border-slate-200 p-2">
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={x.ok} onChange={(e) => setItems(items.map((y, k) => (k === i ? { ...y, ok: e.target.checked } : y)))} disabled={level < 1} /><span className="flex-1">{x.label}</span></label>
              <label className="sr-only" htmlFor={`qn${i}`}>Remarque</label>
              <input id={`qn${i}`} className={`${inp} mt-1 !py-1 text-xs`} placeholder="Remarque…" value={x.note} onChange={(e) => setItems(items.map((y, k) => (k === i ? { ...y, note: e.target.value } : y)))} disabled={level < 1} maxLength={300} />
            </li>
          ))}
        </ul>
        {level >= 1 && (
          <div className="mt-2 flex gap-1.5">
            <label className="sr-only" htmlFor="qcadd">Ajouter un point</label>
            <input id="qcadd" className={inp} placeholder="Ajouter un point de contrôle…" value={newItem} onChange={(e) => setNewItem(e.target.value)} maxLength={160} />
            <Btn small kind="soft" disabled={!newItem.trim()} onClick={() => (setItems([...items, { label: newItem.trim(), ok: false, note: "" }]), setNewItem(""))}>Ajouter</Btn>
          </div>
        )}
        <Field label="Remarques générales" className="mt-2"><textarea className={inp} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} disabled={level < 1} /></Field>
        {j.qc?.checked_at && <p className="mt-1 text-xs text-slate-500">Dernière vérification enregistrée par {name(j.qc.checked_by)} le {fmtDateTime(j.qc.checked_at)}.</p>}
      </Card>
      <Card title="Validation finale">
        {isMgr(level) ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Enregistrez d&apos;abord les vérifications. La validation passe le véhicule à « Prêt » et prévient l&apos;accueil.</p>
            <div className="flex flex-wrap gap-1.5">
              <Btn small busy={busy === "ok"} disabled={!allOk || !j.qc?.checked_at} onClick={async () => (setBusy("ok"), await act("qc.validate", { job_id: job.id, result: "ok", remarks }), setBusy(null))}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden />Valider : véhicule prêt</Btn>
              <Btn small kind="danger" busy={busy === "ko"} disabled={!remarks.trim()} onClick={async () => (setBusy("ko"), await act("qc.validate", { job_id: job.id, result: "reprendre", remarks }), setBusy(null))} title={!remarks.trim() ? "Décrivez les travaux à reprendre dans les remarques" : undefined}><Wrench className="h-3.5 w-3.5" aria-hidden />Travaux à reprendre</Btn>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500">La validation finale est réservée à un gérant (gestionnaire, administrateur ou propriétaire).</p>
        )}
      </Card>
    </div>
  );
}

// ---------- Facture et paiements ----------

function Billing({ job }: { job: Doc<Job> }) {
  const { g, act, level, ask } = useG();
  const inv = byId<Invoice>(g.data.invoice, job.data.invoice_id);
  const accepted = acceptedQuote(g.data.quote, job.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [print, setPrint] = useState(false);
  const old = (g.data.invoice as Doc<Invoice>[]).filter((i) => i.data.job_id === job.id && i.id !== inv?.id);
  if (!inv || inv.data.cancelled)
    return (
      <div className="space-y-3">
        <Empty text="Aucune facture active pour ce dossier." icon={Wallet}>
          {level >= 1 && job.data.status !== "annule" && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {accepted && <Btn small busy={busy === "devis"} onClick={async () => (setBusy("devis"), await act("invoice.create", { job_id: job.id, source: "devis" }), setBusy(null))}>Facturer le devis accepté ({fmtMoney(accepted.data.total)})</Btn>}
              <Btn small kind={accepted ? "ghost" : "primary"} busy={busy === "job"} onClick={async () => (setBusy("job"), await act("invoice.create", { job_id: job.id, source: "intervention" }), setBusy(null))}>Facturer les travaux et pièces du dossier</Btn>
            </div>
          )}
        </Empty>
        {old.length > 0 && <p className="text-xs text-slate-500">Factures annulées : {old.map((o) => o.data.number).join(", ")}</p>}
      </div>
    );
  return (
    <div className="space-y-3">
      <InvoiceCard invoice={inv} onPrint={() => setPrint(true)} />
      {isMgr(level) && inv.data.paid === 0 && (
        <Btn small kind="danger" onClick={async () => {
          const reason = window.prompt("Motif de l'annulation de la facture :");
          if (reason && reason.trim() && (await ask(`Annuler la facture ${inv.data.number} ? Elle restera dans l'historique.`))) await act("invoice.cancel", { id: inv.id, reason: reason.trim() });
        }}>Annuler la facture</Btn>
      )}
      {print && <InvoiceDoc invoice={inv} onClose={() => setPrint(false)} />}
    </div>
  );
}

/** Facture, paiements enregistrés, reçus et formulaire de paiement (réutilisé par l'accueil et le bureau). */
export function InvoiceCard({ invoice, onPrint }: { invoice: Doc<Invoice>; onPrint: () => void }) {
  const { g, act, level, ask, name } = useG();
  const inv = invoice.data;
  const pays = (g.data.payment as Doc<Payment>[]).filter((p) => p.data.invoice_id === invoice.id);
  const due = balance(inv);
  const [f, setF] = useState<{ amount: number | string; method: PaymentMethod; reference: string; received_at: string }>({ amount: due, method: "especes", reference: "", received_at: today() });
  const [key, resetKey] = useIdem();
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Doc<Payment> | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  useEffect(() => setF((x) => ({ ...x, amount: due })), [due]);
  useEffect(() => {
    if (!lastId) return;
    const p = (g.data.payment as Doc<Payment>[]).find((x) => x.id === lastId);
    if (p) {
      setReceipt(p);
      setLastId(null);
    }
  }, [lastId, g.data.payment]);
  const tone = inv.status === "payee" ? "green" : inv.status === "partielle" ? "amber" : inv.status === "annulee" ? "slate" : "red";
  return (
    <>
      <Card title={<span className="flex items-center gap-2"><span className="font-mono">{inv.number}</span><Pill tone={tone}>{INVOICE_STATUS_LABELS[inv.status]}</Pill></span>} actions={<Btn small kind="ghost" onClick={onPrint}>Voir / imprimer</Btn>}>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div><span className="block text-xs text-slate-500">Total</span><strong>{fmtMoney(inv.total)}</strong></div>
          <div><span className="block text-xs text-slate-500">Encaissé</span><strong>{fmtMoney(inv.paid)}</strong></div>
          <div><span className="block text-xs text-slate-500">Reste dû</span><strong className={due > 0 ? "text-red-700" : "text-green-700"}>{fmtMoney(due)}</strong></div>
        </div>
        <p className="mt-1 text-xs text-slate-500">Émise le {fmtDate(inv.issued_at)} · {inv.source === "devis" ? "à partir du devis accepté" : inv.source === "vente" ? "vente au comptoir" : "à partir des travaux du dossier"}</p>
      </Card>
      <Card title="Paiements reçus">
        {pays.length === 0 ? <p className="text-sm text-slate-500">Aucun paiement enregistré.</p> : (
          <ul className="space-y-1.5">
            {pays.map((p) => (
              <li key={p.id} className={`flex flex-wrap items-center gap-2 text-sm ${p.data.cancelled ? "text-slate-400 line-through" : ""}`}>
                <span className="min-w-0 flex-1">{fmtDate(p.data.received_at)} · {fmtMoney(p.data.amount)} · {PAYMENT_METHOD_LABELS[p.data.method]}{p.data.reference ? ` (${p.data.reference})` : ""} <span className="text-xs text-slate-500">— {name(p.data.recorded_by)}</span></span>
                <Btn small kind="ghost" onClick={() => setReceipt(p)}>Reçu {p.data.receipt_no}</Btn>
                {isMgr(level) && !p.data.cancelled && (
                  <Btn small kind="danger" onClick={async () => {
                    const reason = window.prompt("Motif de l'annulation du paiement (erreur de saisie, chèque rejeté…) :");
                    if (reason && reason.trim() && (await ask(`Annuler le paiement de ${fmtMoney(p.data.amount)} ? Le solde sera recalculé.`))) await act("payment.cancel", { id: p.id, reason: reason.trim() });
                  }}>Annuler</Btn>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {due > 0 && !inv.cancelled && level >= 1 && (
        <Card title="Enregistrer un paiement reçu">
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            const amount = Number(f.amount);
            if (!(await ask(`Confirmer la réception de ${fmtMoney(amount)} (${PAYMENT_METHOD_LABELS[f.method]}) ?`))) return;
            setBusy(true);
            const r = await act("payment.add", { invoice_id: invoice.id, ...f, amount, idem: key });
            setBusy(false);
            if (r) {
              resetKey();
              setF({ ...f, reference: "" });
              if (r.id) setLastId(r.id);
            }
          }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Montant reçu" hint={`Solde : ${fmtMoney(due)}`}><input type="number" min={1} max={due} className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required /></Field>
              <Field label="Date de réception"><input type="date" max={today()} className={inp} value={f.received_at} onChange={(e) => setF({ ...f, received_at: e.target.value })} required /></Field>
              <Field label="Mode">
                <select className={inp} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PaymentMethod })}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>)}
                </select>
              </Field>
              <Field label={f.method === "especes" ? "Référence (facultatif)" : "Référence de la transaction"}><input className={inp} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} required={f.method !== "especes"} maxLength={120} /></Field>
            </div>
            <p className="text-xs text-slate-500">N&apos;enregistrez que l&apos;argent réellement reçu. La facture passe à « Payée » uniquement quand les paiements couvrent le total.</p>
            <Btn type="submit" busy={busy}>Enregistrer le paiement</Btn>
          </form>
        </Card>
      )}
      {receipt && <ReceiptDoc payment={receipt} onClose={() => setReceipt(null)} />}
    </>
  );
}

// ---------- Photos ----------

async function compress(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Format d'image non pris en charge (utilisez JPEG ou PNG)."));
      i.src = url;
    });
    let max = 1280;
    let q = 0.75;
    for (let k = 0; k < 6; k++) {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      const out = c.toDataURL("image/jpeg", q);
      if (out.length <= 440_000) return out;
      max *= 0.75;
      q = Math.max(0.45, q - 0.08);
    }
    throw new Error("Photo trop lourde, même compressée.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Photos({ job }: { job: Doc<Job> }) {
  const { api, act, level, ask, g } = useG();
  const [list, setList] = useState<Doc[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [caption, setCaption] = useState("");
  const closed = job.data.status === "remis" || job.data.status === "annule";
  const load = useMemo(() => async () => {
    try {
      setList(await api.photos(job.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Chargement des photos impossible.");
    }
  }, [api, job.id]);
  useEffect(() => void load(), [load, job.data.photo_count]);
  return (
    <div className="space-y-3">
      {!closed && level >= 1 && (
        <Card title="Ajouter une photo (facultatif)">
          <div className="space-y-2">
            <Field label="Légende"><input className={inp} value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={120} placeholder="Ex. : rayure aile avant gauche" /></Field>
            <label className={`tab-press inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium text-white ${busy ? "opacity-60" : ""}`} style={{ background: "var(--app-primary)" }}>
              {busy ? <span className="spinner" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}Prendre ou choisir une photo
              <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={busy} onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                setErr("");
                setBusy(true);
                try {
                  const data_url = await compress(file);
                  if (await act("photo.add", { job_id: job.id, data_url, caption })) setCaption("");
                } catch (x) {
                  setErr(x instanceof Error ? x.message : "Import impossible.");
                } finally {
                  setBusy(false);
                }
              }} />
            </label>
            <p className="text-xs text-slate-500">Photos réduites automatiquement (8 maximum par dossier).</p>
          </div>
        </Card>
      )}
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {list === null ? <p className="text-sm text-slate-500">Chargement…</p> : list.length === 0 ? <Empty text="Aucune photo dans ce dossier." icon={Camera} /> : (
        <ul className="grid grid-cols-2 gap-2">
          {list.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-xl border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={String(p.data.data_url)} alt={String(p.data.caption || "Photo du véhicule")} className="aspect-[4/3] w-full object-cover" />
              <div className="flex items-center gap-1 p-1.5 text-xs">
                <span className="min-w-0 flex-1 truncate">{String(p.data.caption || "—")}</span>
                {!closed && (p.data.by === g.me || isMgr(level)) && <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Supprimer la photo" onClick={async () => (await ask("Supprimer cette photo ?")) && act("photo.delete", { id: p.id })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- Historique ----------

function Timeline({ job, quotes }: { job: Doc<Job>; quotes: Doc<Quote>[] }) {
  const { g, name } = useG();
  const moves = (g.data.move as Doc<{ part_id: string; qty: number; type: string; at: string; by: string; reason: string }>[]).filter((m) => (m.data as unknown as { job_id: string }).job_id === job.id);
  const events = [
    ...job.data.history.map((h) => ({ at: h.at, text: h.from === h.to ? (h.note ?? "") : `${h.from ? `${JOB_STATUS_LABELS[h.from as JobStatus] ?? h.from} → ` : ""}${JOB_STATUS_LABELS[h.to as JobStatus] ?? h.to}${h.note ? ` · ${h.note}` : ""}`, by: h.by })),
    ...quotes.flatMap((q) => q.data.history.map((h) => ({ at: h.at, text: `Devis ${q.data.number} : ${QUOTE_STATUS_LABELS[h.to as Quote["status"]] ?? h.to}${h.note ? ` · ${h.note}` : ""}`, by: h.by }))),
    ...moves.map((m) => ({ at: m.data.at, text: `Stock : ${m.data.qty > 0 ? "+" : ""}${fmtQty(m.data.qty)} ${byId<Part>(g.data.part, m.data.part_id)?.data.name ?? "pièce"} (${m.data.reason})`, by: m.data.by })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
      {events.map((e, i) => (
        <li key={i} className="text-sm">
          <span className="block text-xs text-slate-500">{fmtDateTime(e.at)} · {name(e.by)}</span>
          {e.text}
        </li>
      ))}
    </ol>
  );
}
