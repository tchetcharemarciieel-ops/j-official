"use client";

import { AlertTriangle, CalendarClock, CircleDollarSign, FolderKanban, ListChecks, MessageSquare, Receipt, TrendingDown, TrendingUp, Users } from "lucide-react";
import { useMemo } from "react";
import { APPT_KIND, balanceOf, financeIn, invoiceState, monthRange, monthlySeries, projectLate, taskLate, today, type Appointment, type Contract, type Doc, type Invoice, type Message, type Project, type Task, type Transaction } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Badge, Card, DualBars, Empty, Stat, fmtDate, hhmm } from "../ui";

/** Tableau de bord : tous les chiffres sont calculés sur les fiches visibles par votre poste ; rien n'est estimé. */
export function Dashboard() {
  const c = useCtx();
  const d = c.data;
  const day = today();
  const ym = day.slice(0, 7);
  const projects = d.project as Doc<Project>[];
  const tasks = d.task as Doc<Task>[];
  const appts = (d.appointment as Doc<Appointment>[]).filter((a) => a.data.status !== "annule");
  const invoices = d.invoice as Doc<Invoice>[];
  const txs = d.transaction as Doc<Transaction>[];
  const month = useMemo(() => financeIn(txs, monthRange(ym)), [txs, ym]);
  const series = useMemo(() => monthlySeries(txs), [txs]);
  const billed = invoices.filter((i) => i.data.status === "envoyee" && i.data.date.startsWith(ym)).reduce((a, i) => a + i.data.total, 0);
  const todays = appts.filter((a) => a.data.start.slice(0, 10) === day).sort((a, b) => a.data.start.localeCompare(b.data.start));
  const lateProjects = projects.filter((p) => projectLate(p.data, day));
  const lateTasks = tasks.filter((t) => taskLate(t.data, day));
  const lateInvoices = invoices.filter((i) => invoiceState(i.data, day) === "en_retard");
  const expiring = (d.contract as Doc<Contract>[]).filter((k) => k.data.status === "actif" && k.data.end && k.data.end >= day && k.data.end <= new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10));
  const unread = (d.message as Doc<Message>[]).filter((m) => m.data.from !== c.s.me && !m.data.read_by.includes(c.s.me));
  const soon = appts.filter((a) => { const t = Date.parse(a.data.start); const n = Date.now(); return t > n && t - n <= Math.max(a.data.reminder_min, 0) * 60_000; });
  const showFin = c.may("finances") || c.may("rapports");
  const empty = !d.client.length && !projects.length && !tasks.length && !appts.length && !txs.length && !invoices.length;

  if (empty)
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card title={`Bienvenue dans ${c.settings.name}`} subtitle="Votre espace est prêt. Quelques idées pour commencer :">
          <ol className="space-y-3 text-sm">
            {([["Ajoutez vos clients", "Coordonnées, statut, historique des échanges.", "clients"], ["Créez un projet", "Responsable, équipe, dates limites, tâches.", "projets"], ["Planifiez un rendez-vous", "Agenda, participants, rappels.", "agenda"], ["Visitez le bureau virtuel", "Plan 2D et vue 3D de vos espaces.", "workspace"]] as const).map(([t, x, p], i) => (
              <li key={t} className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--brand)] text-xs font-bold text-white">{i + 1}</span>
                <span className="flex-1"><span className="block font-medium">{t}</span><span className="text-slate-500">{x}</span></span>
                <button className="btn btn-ghost !py-1.5 text-xs" onClick={() => c.go(p)}>Ouvrir</button>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-xs text-slate-500">Les indicateurs apparaîtront dès vos premières données : aucun chiffre n&apos;est inventé.</p>
        </Card>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showFin && <Stat icon={CircleDollarSign} tone="blue" label="Chiffre d'affaires (facturé ce mois)" value={c.fmt(billed)} hint={`${invoices.filter((i) => i.data.status === "envoyee" && i.data.date.startsWith(ym)).length} facture(s)`} onClick={c.may("documents") ? () => c.go("documents") : undefined} />}
        <Stat icon={Users} label="Clients" value={d.client.length} onClick={() => c.go("clients")} />
        <Stat icon={FolderKanban} tone="blue" label="Projets en cours" value={projects.filter((p) => p.data.status === "en_cours").length} hint={`${projects.length} au total`} onClick={c.may("projets") ? () => c.go("projets") : undefined} />
        <Stat icon={ListChecks} tone={lateTasks.length ? "amber" : "slate"} label="Tâches en cours" value={tasks.filter((t) => t.data.status !== "termine").length} hint={lateTasks.length ? `${lateTasks.length} en retard` : undefined} onClick={c.may("projets") ? () => c.go("projets") : undefined} />
        <Stat icon={CalendarClock} tone="blue" label="Rendez-vous du jour" value={todays.length} onClick={c.may("agenda") ? () => c.go("agenda") : undefined} />
        {showFin && <Stat icon={TrendingUp} tone="green" label="Recettes du mois" value={c.fmt(month.income)} onClick={() => c.go("finances")} />}
        {showFin && <Stat icon={TrendingDown} tone="red" label="Dépenses du mois" value={c.fmt(month.expense)} hint={`Solde : ${c.fmt(month.balance)}`} onClick={() => c.go("finances")} />}
        <Stat icon={MessageSquare} tone={unread.length ? "amber" : "slate"} label="Messages non lus" value={unread.length} onClick={() => c.go("messagerie")} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {showFin && (
          <Card className="xl:col-span-2" title="Recettes et dépenses" subtitle="6 derniers mois, d'après les opérations enregistrées">
            {txs.length ? <DualBars data={series.map((s) => ({ label: s.label, a: s.income, b: s.expense }))} /> : <p className="py-10 text-center text-sm text-slate-500">Aucune opération enregistrée.</p>}
          </Card>
        )}
        <Card title="Notifications et alertes">
          <ul className="space-y-2 text-sm">
            {soon.map((a) => <Alert key={a.id} tone="blue" icon={CalendarClock} text={`Rappel : « ${a.data.title} » à ${hhmm(a.data.start)}`} />)}
            {lateProjects.slice(0, 3).map((p) => <Alert key={p.id} tone="red" icon={AlertTriangle} text={`Projet en retard : ${p.data.name} (échéance ${fmtDate(p.data.due)})`} />)}
            {lateTasks.slice(0, 4).map((t) => <Alert key={t.id} tone="amber" icon={ListChecks} text={`Tâche en retard : ${t.data.title} (${fmtDate(t.data.due)}${t.data.assignee ? `, ${c.memberName(t.data.assignee)}` : ""})`} />)}
            {lateInvoices.slice(0, 3).map((i) => <Alert key={i.id} tone="red" icon={Receipt} text={`Facture ${i.data.number} en retard : reste ${c.fmt(balanceOf(i.data))}`} />)}
            {expiring.slice(0, 3).map((k) => <Alert key={k.id} tone="amber" icon={AlertTriangle} text={`Contrat « ${k.data.title} » : fin le ${fmtDate(k.data.end)}`} />)}
            {unread.length > 0 && <Alert tone="blue" icon={MessageSquare} text={`${unread.length} message(s) non lu(s)`} />}
            {!soon.length && !lateProjects.length && !lateTasks.length && !lateInvoices.length && !expiring.length && !unread.length && <li className="text-slate-500">Aucune alerte pour le moment.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Rendez-vous du jour" subtitle={fmtDate(day)}>
          {todays.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {todays.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2">
                  <span className="w-12 font-semibold">{hhmm(a.data.start)}</span>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.data.title}</span><span className="text-xs text-slate-500">{APPT_KIND[a.data.kind]}{a.data.client_id ? ` · ${c.clientName(a.data.client_id)}` : ""}</span></span>
                  <Badge tone={a.data.status === "confirme" ? "green" : "blue"}>{a.data.status === "confirme" ? "Confirmé" : "Prévu"}</Badge>
                </li>
              ))}
            </ul>
          ) : <Empty icon={CalendarClock} title="Aucun rendez-vous aujourd'hui" />}
        </Card>
        <Card title="Projets en cours">
          {projects.filter((p) => p.data.status === "en_cours").length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {projects.filter((p) => p.data.status === "en_cours").slice(0, 6).map((p) => {
                const ts = tasks.filter((t) => t.data.project_id === p.id);
                const pct = ts.length ? Math.round((ts.filter((t) => t.data.status === "termine").length / ts.length) * 100) : p.data.progress;
                return (
                  <li key={p.id}><button className="flex w-full items-center gap-3 py-2 text-left" onClick={() => c.go("projets", p.id)}>
                    <span className="min-w-0 flex-1"><span className="block truncate font-medium">{p.data.name}</span><span className="block h-1.5 rounded-full bg-slate-200"><span className="block h-1.5 rounded-full bg-[var(--brand)]" style={{ width: `${pct}%` }} /></span></span>
                    <span className="w-10 text-right text-xs text-slate-500">{pct} %</span>
                  </button></li>
                );
              })}
            </ul>
          ) : <Empty icon={FolderKanban} title="Aucun projet en cours" />}
        </Card>
      </div>
    </div>
  );
}

function Alert({ tone, icon: Icon, text }: { tone: "red" | "amber" | "blue"; icon: typeof AlertTriangle; text: string }) {
  const t = { red: "text-red-700 bg-red-50", amber: "text-amber-800 bg-amber-50", blue: "text-blue-800 bg-blue-50" }[tone];
  return <li className={`flex items-start gap-2 rounded-xl px-3 py-2 ${t}`}><Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><span>{text}</span></li>;
}
