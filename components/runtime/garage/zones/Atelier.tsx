"use client";

import { Gauge, Hammer, ListChecks, Wrench } from "lucide-react";
import { useState } from "react";
import { IN_WORKSHOP, JOB_STATUS_LABELS, PRIORITIES, PRIORITY_LABELS, fmtDateTime, fmtMinutes, isLate, periodPreset, workload, type Doc, type Job, type JobStatus, type Period, type ToolIssue } from "@/lib/garage/model";
import { JobDossier } from "../JobDossier";
import { Btn, Card, Empty, Field, PeriodPicker, Pill, Stat, Tabs, inp, useG } from "../ui";
import { JobRow } from "./Accueil";

type Tab = "vehicules" | "charge" | "outils";

export function Atelier({ jobId, setJobId }: { jobId: string | null; setJobId: (id: string | null) => void }) {
  const { g } = useG();
  const [tab, setTab] = useState<Tab>("vehicules");
  if (jobId) return <JobDossier jobId={jobId} onBack={() => setJobId(null)} focus="atelier" />;
  return (
    <div className="space-y-3">
      <Tabs<Tab>
        label="Sections de l'atelier"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "vehicules", label: "Véhicules", icon: Wrench, count: (g.data.job as Doc<Job>[]).filter((j) => IN_WORKSHOP.includes(j.data.status)).length },
          { id: "charge", label: "Charge de travail", icon: Gauge },
          { id: "outils", label: "Outils", icon: Hammer, count: (g.data.tool as Doc<ToolIssue>[]).filter((t) => t.data.status === "ouvert").length },
        ]}
      />
      {tab === "vehicules" && <Vehicles open={setJobId} />}
      {tab === "charge" && <Workload open={setJobId} />}
      {tab === "outils" && <Tools />}
    </div>
  );
}

function Vehicles({ open }: { open: (id: string) => void }) {
  const { g } = useG();
  const [status, setStatus] = useState<"atelier" | JobStatus>("atelier");
  const [prio, setPrio] = useState<"" | Job["priority"]>("");
  const [mine, setMine] = useState(false);
  const jobs = (g.data.job as Doc<Job>[]).filter((j) => (status === "atelier" ? IN_WORKSHOP.includes(j.data.status) : j.data.status === status) && (!prio || j.data.priority === prio) && (!mine || j.data.mechanic_id === g.me));
  const order = { urgente: 0, haute: 1, normale: 2 };
  jobs.sort((a, b) => Number(isLate(b.data)) - Number(isLate(a.data)) || order[a.data.priority] - order[b.data.priority] || a.created_at.localeCompare(b.created_at));
  const waiting = (g.data.job as Doc<Job>[]).filter((j) => j.data.status === "attente").length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Statut">
          <select className={inp} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="atelier">En atelier (diagnostic, réparation, contrôle)</option>
            {(["attente", "diagnostic", "reparation", "controle", "pret"] as const).map((s) => <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
        <Field label="Priorité">
          <select className={inp} value={prio} onChange={(e) => setPrio(e.target.value as typeof prio)}>
            <option value="">Toutes</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} />Mes véhicules</label>
      </div>
      {status === "atelier" && waiting > 0 && <button type="button" className="text-sm text-blue-700 hover:underline" onClick={() => setStatus("attente")}>{waiting} véhicule(s) en attente d&apos;entrée à l&apos;atelier →</button>}
      {jobs.length === 0 ? <Empty text="Aucun véhicule enregistré avec ce statut. Les véhicules apparaissent ici après leur enregistrement à l'accueil." icon={Wrench} /> : <div className="space-y-1.5">{jobs.map((j) => <JobRow key={j.id} job={j} onOpen={() => open(j.id)} />)}</div>}
    </div>
  );
}

export function Workload({ open }: { open: (id: string) => void }) {
  const { g, name } = useG();
  const [period, setPeriod] = useState<Period>(periodPreset("week"));
  const rows = workload(g.data, g.members.map((m) => m.id), period);
  const unassigned = (g.data.job as Doc<Job>[]).filter((j) => !j.data.mechanic_id && ["attente", "diagnostic", "reparation", "controle"].includes(j.data.status));
  return (
    <div className="space-y-3">
      <PeriodPicker value={period} onChange={setPeriod} />
      <p className="text-xs text-slate-500">Chiffres calculés sur les dossiers et temps enregistrés, sans classement des personnes. Le temps prévu n&apos;est comparé que pour les dossiers où il a été renseigné.</p>
      {unassigned.length > 0 && (
        <Card title={`Non attribués (${unassigned.length})`}>
          <div className="space-y-1.5">{unassigned.map((j) => <JobRow key={j.id} job={j} onOpen={() => open(j.id)} />)}</div>
        </Card>
      )}
      {rows.map((r) => (
        <Card key={r.id} title={name(r.id)}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="En cours" value={r.open.length} tone="blue" />
            <Stat label="En retard" value={r.late.length} tone={r.late.length ? "red" : "slate"} />
            <Stat label="Terminés (période)" value={r.done.length} tone="green" />
            <Stat label="Temps saisi" value={fmtMinutes(r.minutes)} />
          </div>
          {r.plannedKnown > 0 && <p className="mt-2 text-xs text-slate-600">Dossiers terminés avec temps prévu : {r.plannedKnown} · prévu {fmtMinutes(r.planned)}</p>}
          {r.open.length > 0 && <div className="mt-2 space-y-1.5">{r.open.map((j) => <JobRow key={j.id} job={j} onOpen={() => open(j.id)} />)}</div>}
        </Card>
      ))}
      {rows.length === 0 && <Empty text="Aucun membre dans l'équipe." icon={ListChecks} />}
    </div>
  );
}

function Tools() {
  const { g, act, level, name } = useG();
  const [f, setF] = useState({ name: "", problem: "endommage" as ToolIssue["problem"], note: "" });
  const [busy, setBusy] = useState(false);
  const list = g.data.tool as Doc<ToolIssue>[];
  return (
    <div className="space-y-3">
      {level >= 1 && (
        <Card title="Signaler un outil">
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            if (await act("tool.report", f)) setF({ name: "", problem: "endommage", note: "" });
            setBusy(false);
          }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Outil"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} /></Field>
              <Field label="Problème">
                <select className={inp} value={f.problem} onChange={(e) => setF({ ...f, problem: e.target.value as ToolIssue["problem"] })}>
                  <option value="endommage">Endommagé</option>
                  <option value="manquant">Manquant</option>
                </select>
              </Field>
            </div>
            <Field label="Précision"><input className={inp} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={500} /></Field>
            <Btn type="submit" small busy={busy}>Signaler</Btn>
          </form>
        </Card>
      )}
      {list.length === 0 ? <Empty text="Aucun outil signalé." icon={Hammer} /> : (
        <ul className="space-y-1.5">
          {list.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1"><strong>{t.data.name}</strong> <Pill tone={t.data.problem === "manquant" ? "amber" : "red"}>{t.data.problem === "manquant" ? "Manquant" : "Endommagé"}</Pill><span className="block text-xs text-slate-500">{t.data.note ? `${t.data.note} · ` : ""}{name(t.data.reported_by)}, {fmtDateTime(t.data.at)}{t.data.resolved_at ? ` · résolu le ${fmtDateTime(t.data.resolved_at)}` : ""}</span></span>
              {t.data.status === "ouvert" ? level >= 1 && <Btn small kind="soft" onClick={() => act("tool.resolve", { id: t.id })}>Marquer résolu</Btn> : <Pill tone="green">Résolu</Pill>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
