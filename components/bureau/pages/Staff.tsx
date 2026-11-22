"use client";

import { Clock, LogIn, LogOut, Plus, UserRound } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ATTENDANCE_STATUS, attendanceStats, monthRange, performance, today, type Attendance, type Doc, type Employee, type Task } from "@/lib/bureau/model";
import { POSITIONS } from "@/lib/team";
import { useCtx } from "../context";
import { Badge, Card, DeleteButton, Empty, Field, Modal, Pick, Tabs, fmtDate } from "../ui";

const ST_TONE = { present: "green", retard: "amber", absent: "red", conge: "blue", mission: "violet" } as const;
const EMP_STATUS = { actif: "Actif", conge: "En congé", parti: "Parti" } as const;

/** Personnel : fiches des employés, postes et rôles, présences et performance (mesurée sur les tâches). */
export function Staff() {
  const c = useCtx();
  const [tab, setTab] = useState<"staff" | "presence" | "perf" | "roles">("staff");
  const [edit, setEdit] = useState<Doc<Employee> | "new" | null>(null);
  const emps = (c.data.employee as Doc<Employee>[]).slice().sort((a, b) => a.data.name.localeCompare(b.data.name, "fr"));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onChange={setTab} items={[["staff", `Employés (${emps.length})`], ["presence", "Présences"], ["perf", "Performance"], ["roles", "Rôles et accès"]]} />
        <button className="btn btn-primary ml-auto" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> Ajouter un employé</button>
      </div>
      {tab === "staff" &&
        (emps.length === 0 ? (
          <Empty icon={UserRound} title="Aucun employé" text="Ajoutez vos employés : poste, coordonnées, et liez leur fiche à leur compte pour le pointage et le suivi des tâches." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {emps.map((e) => (
              <button key={e.id} onClick={() => setEdit(e)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-slate-300">
                <span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 font-semibold">{e.data.name.slice(0, 1).toUpperCase()}</span><span className="min-w-0"><span className="block truncate font-medium">{e.data.name}</span><span className="block truncate text-xs text-slate-500">{e.data.position || "Poste non défini"}</span></span></span>
                <span className="mt-2 flex flex-wrap gap-1.5"><Badge tone={e.data.status === "actif" ? "green" : e.data.status === "conge" ? "blue" : "slate"}>{EMP_STATUS[e.data.status]}</Badge>{e.data.user_id ? <Badge tone="violet">Compte lié : {c.memberName(e.data.user_id)}</Badge> : <Badge>Sans compte</Badge>}</span>
              </button>
            ))}
          </div>
        ))}
      {tab === "presence" && <AttendanceAdmin emps={emps} />}
      {tab === "perf" && <Perf emps={emps} />}
      {tab === "roles" && <Roles />}
      {edit && <EmployeeForm emp={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function EmployeeForm({ emp, onClose }: { emp: Doc<Employee> | null; onClose: () => void }) {
  const c = useCtx();
  const d = emp?.data;
  const [f, setF] = useState({ name: d?.name ?? "", position: d?.position ?? "", phone: d?.phone ?? "", email: d?.email ?? "", hired: d?.hired ?? "", user_id: d?.user_id ?? "", status: d?.status ?? "actif", notes: d?.notes ?? "" });
  const team: [string, string][] = c.s.members.filter((m) => m.active).map((m) => [m.id, `${m.name}${m.position ? ` (${m.position})` : ""}`]);
  return (
    <Modal title={emp ? "Modifier l'employé" : "Nouvel employé"} onClose={onClose} footer={
      <>
        {emp && <DeleteButton confirmText={`Supprimer « ${emp.data.name} » et ses présences ?`} onConfirm={async () => (await c.run("employee.delete", { id: emp.id })) && onClose()} />}
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" disabled={!f.name.trim()} onClick={async () => (await c.run("employee.save", { id: emp?.id, ...f, hired: f.hired || null, user_id: f.user_id || null })) && onClose()}>Enregistrer</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom" className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} autoFocus /></Field>
        <Field label="Poste"><input className="input" value={f.position} onChange={(e) => setF({ ...f, position: e.target.value })} maxLength={80} placeholder="Ex. Secrétaire, Agent commercial" /></Field>
        <Field label="Date d'embauche"><input className="input" type="date" value={f.hired} onChange={(e) => setF({ ...f, hired: e.target.value })} /></Field>
        <Field label="Téléphone"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} /></Field>
        <Pick label="Compte lié (pointage, tâches)" value={f.user_id} onChange={(v) => setF({ ...f, user_id: v })} options={team} empty="Aucun compte" />
        <Field label="Statut"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })}>{Object.entries(EMP_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Notes" className="sm:col-span-2"><textarea className="input" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">Pour inviter un employé et lui donner un poste (secrétaire, comptable…), utilisez « Comptes et accès » : son compte apparaîtra ensuite dans la liste ci-dessus.</p>
    </Modal>
  );
}

function AttendanceAdmin({ emps }: { emps: Doc<Employee>[] }) {
  const c = useCtx();
  const [date, setDate] = useState(today());
  const [edit, setEdit] = useState<{ emp: Doc<Employee>; row: Doc<Attendance> | null } | null>(null);
  const rows = c.data.attendance as Doc<Attendance>[];
  const ym = date.slice(0, 7);
  const range = monthRange(ym);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><Field label="Jour"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
      {emps.length === 0 ? <Empty icon={Clock} title="Aucun employé" /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Employé</th><th className="px-2">Statut</th><th className="px-2">Arrivée</th><th className="px-2">Départ</th><th className="px-2 text-right">Ce mois</th><th /></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {emps.filter((e) => e.data.status !== "parti").map((e) => {
                const row = rows.find((a) => a.data.employee_id === e.id && a.data.date === date) ?? null;
                const st = attendanceStats(rows, e.id, range);
                return (
                  <tr key={e.id}>
                    <td className="px-4 py-2 font-medium">{e.data.name}</td>
                    <td className="px-2">{row ? <Badge tone={ST_TONE[row.data.status]}>{ATTENDANCE_STATUS[row.data.status]}</Badge> : <span className="text-slate-400">Non saisi</span>}</td>
                    <td className="px-2">{row?.data.in ?? "—"}</td><td className="px-2">{row?.data.out ?? "—"}</td>
                    <td className="px-2 text-right text-xs text-slate-600">{st.present + st.retard} présent(s) · {st.retard} retard(s) · {st.absent} absence(s)</td>
                    <td className="px-2 text-right"><button className="btn btn-ghost !py-1 text-xs" onClick={() => setEdit({ emp: e, row })}>{row ? "Modifier" : "Saisir"}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {edit && <AttendanceForm emp={edit.emp} row={edit.row} date={date} onClose={() => setEdit(null)} />}
    </div>
  );
}

function AttendanceForm({ emp, row, date, onClose }: { emp: Doc<Employee>; row: Doc<Attendance> | null; date: string; onClose: () => void }) {
  const c = useCtx();
  const [f, setF] = useState({ status: row?.data.status ?? "present", in: row?.data.in ?? "", out: row?.data.out ?? "", note: row?.data.note ?? "" });
  return (
    <Modal title={`${emp.data.name} · ${fmtDate(date)}`} onClose={onClose} footer={
      <>
        {row && <DeleteButton confirmText="Supprimer cette présence ?" onConfirm={async () => (await c.run("attendance.delete", { id: row.id })) && onClose()} />}
        <button className="btn btn-ghost" onClick={onClose}>Annuler</button>
        <button className="btn btn-primary" onClick={async () => (await c.run("attendance.save", { employee_id: emp.id, date, ...f, in: f.in || null, out: f.out || null })) && onClose()}>Enregistrer</button>
      </>
    }>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Statut" className="sm:col-span-2"><select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as typeof f.status })}>{Object.entries(ATTENDANCE_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Arrivée"><input className="input" type="time" value={f.in} onChange={(e) => setF({ ...f, in: e.target.value })} /></Field>
        <Field label="Départ"><input className="input" type="time" value={f.out} onChange={(e) => setF({ ...f, out: e.target.value })} /></Field>
        <Field label="Note" className="sm:col-span-2"><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={300} /></Field>
      </div>
    </Modal>
  );
}

function Perf({ emps }: { emps: Doc<Employee>[] }) {
  const c = useCtx();
  const tasks = c.data.task as Doc<Task>[];
  const rows = emps.filter((e) => e.data.user_id).map((e) => ({ e, p: performance(tasks, e.data.user_id!) }));
  const att = c.data.attendance as Doc<Attendance>[];
  const range = monthRange(today().slice(0, 7));
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">La performance est mesurée sur les tâches assignées au compte de chaque employé : tâches terminées, en retard, et part terminée dans les délais. Aucun score n&apos;est inventé.</p>
      {rows.length === 0 ? <Empty icon={UserRound} title="Aucune mesure possible" text="Liez la fiche d'un employé à son compte et assignez-lui des tâches." /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Employé</th><th className="px-2 text-right">Assignées</th><th className="px-2 text-right">Terminées</th><th className="px-2 text-right">En retard</th><th className="px-2 text-right">À temps</th><th className="px-2 text-right">Présences (mois)</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ e, p }) => {
                const a = attendanceStats(att, e.id, range);
                return <tr key={e.id}><td className="px-4 py-2 font-medium">{e.data.name}</td><td className="px-2 text-right">{p.assigned}</td><td className="px-2 text-right">{p.done}</td><td className={`px-2 text-right ${p.late ? "font-medium text-red-600" : ""}`}>{p.late}</td><td className="px-2 text-right">{p.onTimeRate === null ? "—" : `${p.onTimeRate} %`}</td><td className="px-2 text-right">{a.present + a.retard}/{a.total}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Roles() {
  const c = useCtx();
  const members = c.s.members;
  return (
    <div className="space-y-3">
      <Card title="Profils disponibles" subtitle="Chaque compte reçoit un poste ; le serveur limite ce qu'il voit et fait à ce poste.">
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          {POSITIONS.bureau.map((p) => (
            <li key={p.key} className="rounded-xl bg-slate-50 p-3"><b>{p.label}</b><br /><span className="text-xs text-slate-500">{{ administrateur: "Accès complet à l'entreprise.", directeur: "Gestion générale et supervision.", secretaire: "Clients, rendez-vous, documents autorisés.", employe: "Ses tâches et ses projets autorisés.", comptable: "Finances, devis et factures autorisés." }[p.key]}</span></li>
          ))}
        </ul>
      </Card>
      <Card title={`Comptes (${members.length})`} action={c.s.can.team && c.mode === "live" ? <Link className="btn btn-primary !py-1.5 text-sm" href={`/projets/${c.projectId}?onglet=equipe`}>Inviter ou modifier</Link> : undefined}>
        <ul className="divide-y divide-slate-100 text-sm">
          {members.map((m) => <li key={m.id} className="flex items-center gap-2 py-2"><span className="flex-1 font-medium">{m.name}</span><Badge>{m.position ?? "Accès complet de son rôle"}</Badge>{!m.active && <Badge tone="red">Suspendu</Badge>}</li>)}
        </ul>
      </Card>
    </div>
  );
}

/** Présences : pointage de la personne connectée et historique de ses jours. */
export function Presences() {
  const c = useCtx();
  const me = (c.data.employee as Doc<Employee>[]).find((e) => e.data.user_id === c.s.me);
  const rows = (c.data.attendance as Doc<Attendance>[]).filter((a) => me && a.data.employee_id === me.id).sort((a, b) => b.data.date.localeCompare(a.data.date));
  const day = today();
  const cur = rows.find((a) => a.data.date === day);
  const stats = useMemo(() => (me ? attendanceStats(c.data.attendance as Doc<Attendance>[], me.id, monthRange(day.slice(0, 7))) : null), [c.data.attendance, me, day]);
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card title="Mon pointage" subtitle={fmtDate(day)}>
        {!me ? (
          <p className="text-sm text-slate-600">Votre fiche employé n&apos;est pas liée à votre compte : demandez au directeur de la relier (page Personnel) pour pouvoir pointer.</p>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-sm text-slate-600">{cur ? `Arrivée à ${cur.data.in ?? "—"}${cur.data.out ? ` · départ à ${cur.data.out}` : " · au travail"}` : "Vous n'avez pas encore pointé aujourd'hui."}</p>
            <button className="btn btn-primary !px-8 !py-3 text-base" disabled={Boolean(cur?.data.out)} onClick={() => void c.run("attendance.checkin", {})}>{cur ? <><LogOut className="h-5 w-5" /> {cur.data.out ? "Journée terminée" : "Pointer mon départ"}</> : <><LogIn className="h-5 w-5" /> Pointer mon arrivée</>}</button>
          </div>
        )}
      </Card>
      {me && stats && <Card title="Ce mois-ci"><p className="text-sm">{stats.present + stats.retard} jour(s) de présence · {stats.retard} retard(s) · {stats.absent} absence(s) · {stats.conge} congé(s)</p></Card>}
      {rows.length > 0 && (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm shadow-sm">
          {rows.slice(0, 30).map((a) => <li key={a.id} className="flex items-center gap-3 px-4 py-2"><span className="flex-1">{fmtDate(a.data.date)}</span><span className="text-xs text-slate-500">{a.data.in ?? "—"} → {a.data.out ?? "—"}</span><Badge tone={ST_TONE[a.data.status]}>{ATTENDANCE_STATUS[a.data.status]}</Badge></li>)}
        </ul>
      )}
    </div>
  );
}
