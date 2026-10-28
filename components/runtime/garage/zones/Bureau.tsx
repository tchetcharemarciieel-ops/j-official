"use client";

import { BarChart3, Boxes, Download, LayoutDashboard, Trash2, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  EXPENSE_CATEGORIES,
  INVOICE_STATUS_LABELS,
  JOB_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PRESENT,
  activityReport,
  balance,
  dashboard,
  finances,
  fmtDate,
  fmtMinutes,
  fmtMoney,
  fmtQty,
  periodPreset,
  stockValue,
  today,
  type Client,
  type Doc,
  type Expense,
  type Invoice,
  type Job,
  type Payment,
  type Period,
  type Po,
  type Quote,
  type Vehicle,
} from "@/lib/garage/model";
import { ROLE_LABELS } from "@/lib/spec";
import { Btn, Card, Empty, Field, MemberSelect, PeriodPicker, Pill, Row, Stat, Tabs, byId, downloadCsv, inp, isMgr, useG, useIdem } from "../ui";
import { JobRow } from "./Accueil";
import { Workload } from "./Atelier";

type Tab = "tableau" | "finances" | "equipe" | "stock" | "rapports";

export function Bureau() {
  const [tab, setTab] = useState<Tab>("tableau");
  return (
    <div className="space-y-3">
      <Tabs<Tab>
        label="Sections du bureau"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "tableau", label: "Tableau de bord", icon: LayoutDashboard },
          { id: "finances", label: "Finances", icon: Wallet },
          { id: "equipe", label: "Mécaniciens", icon: Users },
          { id: "stock", label: "Stock et fournisseurs", icon: Boxes },
          { id: "rapports", label: "Rapports", icon: BarChart3 },
        ]}
      />
      {tab === "tableau" && <Dashboard />}
      {tab === "finances" && <Finances />}
      {tab === "equipe" && <Team />}
      {tab === "stock" && <StockSummary />}
      {tab === "rapports" && <Reports />}
    </div>
  );
}

const vehicleOf = (g: ReturnType<typeof useG>["g"], j: Doc<Job>) => byId<Vehicle>(g.data.vehicle, j.data.vehicle_id)?.data.plate ?? j.data.ref;

function Dashboard() {
  const { g, openJob, goZone, level } = useG();
  const d = useMemo(() => dashboard(g.data), [g.data]);
  const unpaidTotal = d.unpaid.reduce((a, i) => a + balance(i.data), 0);
  const nothing = !d.late.length && !d.urgent.length && !d.missing.length && !d.stockOut.length && !d.stockLow.length && !d.pendingQuotes.length && !d.unpaid.length && !d.openTools.length && !d.openTasks.length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Véhicules présents" value={d.present} tone="blue" onClick={() => goZone("accueil")} />
        <Stat label="En atelier" value={d.inRepair} tone="violet" onClick={() => goZone("atelier")} />
        <Stat label="Prêts à remettre" value={d.ready} tone="green" onClick={() => goZone("accueil")} />
        <Stat label="Devis en attente" value={d.pendingQuotes.length} tone="amber" />
      </div>
      <p className="text-xs text-slate-500">Indicateurs calculés à l&apos;instant sur les dossiers, devis, factures et stocks enregistrés.</p>
      {nothing && <Empty text="Aucune alerte : pas de retard, de pièce manquante ni de facture impayée." icon={LayoutDashboard} />}
      {d.late.length > 0 && <Card title={<span className="text-red-700">Réparations en retard ({d.late.length})</span>}><div className="space-y-1.5">{d.late.map((j) => <JobRow key={j.id} job={j} onOpen={() => openJob(j.id)} />)}</div></Card>}
      {d.urgent.length > 0 && <Card title={`Urgences (${d.urgent.length})`}><div className="space-y-1.5">{d.urgent.map((j) => <JobRow key={j.id} job={j} onOpen={() => openJob(j.id)} />)}</div></Card>}
      {d.pendingQuotes.length > 0 && (
        <Card title={`Devis envoyés sans réponse (${d.pendingQuotes.length})`}>
          <div className="space-y-1.5">
            {d.pendingQuotes.map((q: Doc<Quote>) => {
              const j = byId<Job>(g.data.job, q.data.job_id);
              return <Row key={q.id} onClick={j ? () => openJob(j.id) : undefined}><span className="min-w-0 flex-1 truncate"><span className="font-mono">{q.data.number}</span> · {j ? vehicleOf(g, j) : ""} · {byId<Client>(g.data.client, q.data.client_id)?.data.name}</span><span className="text-sm font-medium">{fmtMoney(q.data.total)}</span></Row>;
            })}
          </div>
        </Card>
      )}
      {d.missing.length > 0 && (
        <Card title={`Pièces manquantes signalées (${d.missing.length})`}>
          <div className="space-y-1.5">{d.missing.map(({ job, m }) => <Row key={m.id} onClick={() => openJob(job.id)}><span className="min-w-0 flex-1 truncate">{m.label} × {fmtQty(m.qty)} · {vehicleOf(g, job)}</span><Pill tone={m.status === "commandee" ? "blue" : "red"}>{m.status === "commandee" ? "Commandée" : "Signalée"}</Pill></Row>)}</div>
        </Card>
      )}
      {(d.stockOut.length > 0 || d.stockLow.length > 0) && (
        <Card title="Stock" actions={<Btn small kind="ghost" onClick={() => goZone("stock")}>Ouvrir le stock</Btn>}>
          <p className="text-sm"><strong className="text-red-700">{d.stockOut.length}</strong> pièce(s) épuisée(s) · <strong className="text-amber-700">{d.stockLow.length}</strong> sous le seuil</p>
          <p className="mt-1 truncate text-xs text-slate-500">{[...d.stockOut, ...d.stockLow].slice(0, 6).map((p) => p.data.name).join(", ")}</p>
        </Card>
      )}
      {d.unpaid.length > 0 && (
        <Card title={`Factures à encaisser (${d.unpaid.length})`} actions={<Btn small kind="ghost" onClick={() => goZone("accueil")}>Accueil › Factures</Btn>}>
          <p className="text-sm">Reste à encaisser : <strong>{fmtMoney(unpaidTotal)}</strong></p>
          <ul className="mt-1 space-y-0.5 text-xs text-slate-600">{d.unpaid.slice(0, 6).map((i) => <li key={i.id}>{i.data.number} · {INVOICE_STATUS_LABELS[i.data.status]} · reste {fmtMoney(balance(i.data))}</li>)}</ul>
        </Card>
      )}
      {d.openTools.length > 0 && <Card title={`Outils signalés (${d.openTools.length})`} actions={<Btn small kind="ghost" onClick={() => goZone("atelier")}>Atelier</Btn>}><p className="truncate text-sm">{d.openTools.map((t) => t.data.name).join(", ")}</p></Card>}
      {d.openTasks.length > 0 && <Card title={`Tâches en attente (${d.openTasks.length})`} actions={<Btn small kind="ghost" onClick={() => goZone("repos")}>Salle de repos</Btn>}><p className="truncate text-sm">{d.openTasks.map((t) => t.data.title).join(", ")}</p></Card>}
      {!isMgr(level) && <p className="text-xs text-slate-500">Les finances et rapports détaillés sont réservés aux gérants.</p>}
    </div>
  );
}

function Finances() {
  const { g, act, level, ask } = useG();
  const [period, setPeriod] = useState<Period>(periodPreset("month"));
  const [f, setF] = useState({ date: today(), category: EXPENSE_CATEGORIES[0] as string, amount: "" as number | "", description: "", zone: "garage" as Expense["zone"], reference: "" });
  const [key, resetKey] = useIdem();
  const [busy, setBusy] = useState(false);
  const fin = useMemo(() => finances(g.data, period), [g.data, period]);
  if (!isMgr(level)) return <Empty text="Les finances sont réservées aux gérants (gestionnaire, administrateur ou propriétaire)." icon={Wallet} />;
  return (
    <div className="space-y-3">
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Recettes encaissées" value={fmtMoney(fin.receipts)} tone="green" />
        <Stat label="Dépenses enregistrées" value={fmtMoney(fin.expenses)} tone="red" />
        <Stat label="Bénéfice estimé" value={fmtMoney(fin.profit)} tone={fin.profit >= 0 ? "blue" : "amber"} />
        <Stat label="Reste à encaisser (toutes périodes)" value={fmtMoney(fin.outstanding)} tone="amber" />
      </div>
      <p className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-600">
        <strong>Limites du bénéfice estimé :</strong> recettes réellement encaissées sur la période moins dépenses saisies sur la période. Les factures impayées ne sont pas comptées comme recettes ; les dépenses non saisies (salaires, loyer…), la valeur du stock et les taxes ne sont pas prises en compte. Ce n&apos;est pas un résultat comptable.
      </p>
      <Card title="Factures émises sur la période">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div><span className="block text-xs text-slate-500">Payées</span><strong>{fin.invoiceCounts.payee}</strong></div>
          <div><span className="block text-xs text-slate-500">Partiellement payées</span><strong>{fin.invoiceCounts.partielle}</strong></div>
          <div><span className="block text-xs text-slate-500">Impayées</span><strong>{fin.invoiceCounts.impayee}</strong></div>
        </div>
        <p className="mt-1 text-xs text-slate-500">Montant facturé : {fmtMoney(fin.invoiced)}</p>
      </Card>
      <Card title="Enregistrer une dépense">
        <form className="space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("expense.save", { ...f, idem: key });
          setBusy(false);
          if (r) (resetKey(), setF({ ...f, amount: "", description: "", reference: "" }));
        }}>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date"><input type="date" max={today()} className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
            <Field label="Montant (FCFA)"><input type="number" min={1} className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value === "" ? "" : Number(e.target.value) })} required /></Field>
            <Field label="Catégorie"><select className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Zone"><select className={inp} value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value as Expense["zone"] })}><option value="garage">Garage</option><option value="salle_repos">Salle de repos</option></select></Field>
          </div>
          <Field label="Description"><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} /></Field>
          <Field label="Justificatif (n° de facture, reçu…)" hint="Facultatif."><input className={inp} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} maxLength={120} /></Field>
          <Btn type="submit" busy={busy}>Enregistrer la dépense</Btn>
        </form>
      </Card>
      <Card title={`Dépenses de la période (${fin.expenseRows.length})`} actions={<Btn small kind="ghost" disabled={!fin.expenseRows.length} onClick={() => downloadCsv(`depenses-${period.from}-${period.to}.csv`, ["Date", "Catégorie", "Montant", "Zone", "Description", "Justificatif"], fin.expenseRows.map((e) => [e.data.date, e.data.category, e.data.amount, e.data.zone === "garage" ? "Garage" : "Salle de repos", e.data.description, e.data.reference]))}><Download className="h-3.5 w-3.5" aria-hidden />CSV</Btn>}>
        {fin.byCategory.length > 0 && <p className="mb-2 text-xs text-slate-600">{fin.byCategory.map(([c, v]) => `${c} : ${fmtMoney(v)}`).join(" · ")}</p>}
        {fin.expenseRows.length === 0 ? <p className="text-sm text-slate-500">Aucune dépense enregistrée sur la période.</p> : (
          <ul className="space-y-1">
            {fin.expenseRows.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{fmtDate(e.data.date)} · {e.data.category}{e.data.description ? ` · ${e.data.description}` : ""}{e.data.zone === "salle_repos" ? " (salle de repos)" : ""}</span>
                <span className="font-medium">{fmtMoney(e.data.amount)}</span>
                <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Retirer la dépense" onClick={async () => {
                  const reason = window.prompt("Motif du retrait de cette dépense (doublon, erreur…) :");
                  if (reason && reason.trim() && (await ask("Retirer cette dépense des calculs ? Elle reste dans l'historique."))) await act("expense.delete", { id: e.id, reason: reason.trim() });
                }}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={`Paiements encaissés (${fin.payments.length})`} actions={<Btn small kind="ghost" disabled={!fin.payments.length} onClick={() => downloadCsv(`recettes-${period.from}-${period.to}.csv`, ["Date", "Reçu", "Facture", "Montant", "Mode", "Référence"], fin.payments.map((p) => [p.data.received_at, p.data.receipt_no, byId<Invoice>(g.data.invoice, p.data.invoice_id)?.data.number ?? "", p.data.amount, PAYMENT_METHOD_LABELS[p.data.method], p.data.reference]))}><Download className="h-3.5 w-3.5" aria-hidden />CSV</Btn>}>
        {fin.payments.length === 0 ? <p className="text-sm text-slate-500">Aucun paiement reçu sur la période.</p> : (
          <ul className="space-y-1 text-sm">{(fin.payments as Doc<Payment>[]).map((p) => <li key={p.id} className="flex justify-between gap-2"><span className="truncate">{fmtDate(p.data.received_at)} · {p.data.receipt_no} · {PAYMENT_METHOD_LABELS[p.data.method]}</span><strong>{fmtMoney(p.data.amount)}</strong></li>)}</ul>
        )}
      </Card>
    </div>
  );
}

function Team() {
  const { g, act, level, openJob, projectId, mode } = useG();
  const open = (g.data.job as Doc<Job>[]).filter((j) => PRESENT.includes(j.data.status) && j.data.status !== "pret");
  return (
    <div className="space-y-3">
      <Card title="Rôles et autorisations" actions={(g.role === "owner" || g.role === "admin") && mode !== "local" ? <a href={`/projets/${projectId}?onglet=equipe`} className="text-sm text-blue-700 underline">Gérer l&apos;équipe</a> : undefined}>
        <ul className="space-y-1 text-sm">{g.members.map((m) => <li key={m.id} className="flex justify-between"><span>{m.name}</span><Pill>{ROLE_LABELS[m.role]}</Pill></li>)}</ul>
        <p className="mt-2 text-xs text-slate-500">Rôles du système existant : <strong>Employé</strong> = accueil et mécaniciens (dossiers, pièces, temps, paiements) ; <strong>Gestionnaire, Administrateur, Propriétaire</strong> = gérant (validation finale, finances, catalogue, ajustements, commandes) ; <strong>Lecteur</strong> = consultation seule. Les invitations et changements de rôle se font dans l&apos;onglet Équipe du logiciel.</p>
      </Card>
      {isMgr(level) && (
        <Card title={`Attribuer les interventions (${open.length})`}>
          {open.length === 0 ? <p className="text-sm text-slate-500">Aucune intervention en cours.</p> : (
            <ul className="space-y-2">
              {open.map((j) => (
                <li key={j.id} className="grid gap-1 rounded-xl border border-slate-200 p-2 sm:grid-cols-[1fr_200px] sm:items-end">
                  <button type="button" className="text-left text-sm" onClick={() => openJob(j.id)}><span className="font-medium">{vehicleOf(g, j)}</span> · {j.data.ref} · {JOB_STATUS_LABELS[j.data.status]}</button>
                  <MemberSelect value={j.data.mechanic_id} onChange={(v) => act("job.update", { id: j.id, mechanic_id: v })} label="Responsable" />
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}
      <Workload open={openJob} />
    </div>
  );
}

function StockSummary() {
  const { g, goZone } = useG();
  const d = dashboard(g.data);
  const v = stockValue(g.data.part);
  const openPo = (g.data.po as Doc<Po>[]).filter((p) => p.data.status === "commandee" || p.data.status === "partielle");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Valeur estimée" value={fmtMoney(v.value)} />
        <Stat label="Épuisées" value={d.stockOut.length} tone="red" />
        <Stat label="Sous le seuil" value={d.stockLow.length} tone="amber" />
        <Stat label="Commandes en cours" value={openPo.length} tone="blue" />
      </div>
      <p className="text-xs text-slate-500">{v.method}</p>
      <Card title="Pièces manquantes sur les dossiers">{d.missing.length === 0 ? <p className="text-sm text-slate-500">Aucune.</p> : <ul className="space-y-0.5 text-sm">{d.missing.map(({ job, m }) => <li key={m.id}>{m.label} × {fmtQty(m.qty)} · {job.data.ref}</li>)}</ul>}</Card>
      <Btn onClick={() => goZone("stock")}><Boxes className="h-4 w-4" aria-hidden />Ouvrir la zone Stock (inventaire, entrées et sorties, fournisseurs, commandes)</Btn>
    </div>
  );
}

function Reports() {
  const { g, level } = useG();
  const [period, setPeriod] = useState<Period>(periodPreset("month"));
  const rep = useMemo(() => activityReport(g.data, period), [g.data, period]);
  const fin = useMemo(() => finances(g.data, period), [g.data, period]);
  if (!isMgr(level)) return <Empty text="Les rapports sont réservés aux gérants." icon={BarChart3} />;
  const plate = (j: Doc<Job>) => byId<Vehicle>(g.data.vehicle, j.data.vehicle_id)?.data.plate ?? "";
  return (
    <div className="space-y-3">
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat label="Véhicules réparés (contrôle validé)" value={rep.repaired.length} tone="green" />
        <Stat label="Véhicules remis" value={rep.delivered.length} tone="blue" />
        <Stat label="Temps de travail saisi" value={fmtMinutes(rep.minutes)} />
        <Stat label="Recettes encaissées" value={fmtMoney(fin.receipts)} tone="green" />
        <Stat label="Dépenses" value={fmtMoney(fin.expenses)} tone="red" />
        <Stat label="Reste à encaisser" value={fmtMoney(fin.outstanding)} tone="amber" />
      </div>
      <Card title="Pièces et main-d'œuvre">
        <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-sm">
          <dt>Pièces facturées</dt><dd className="text-right font-medium">{fmtMoney(rep.partsBilled)}</dd>
          <dt>Main-d&apos;œuvre facturée</dt><dd className="text-right font-medium">{fmtMoney(rep.labourBilled)}</dd>
          <dt>Coût d&apos;achat des pièces sorties du stock</dt><dd className="text-right font-medium">{fmtMoney(rep.partsCost)}</dd>
        </dl>
        <p className="mt-1 text-xs text-slate-500">Montants issus des factures émises et des mouvements de stock de la période{rep.partsWithoutCost ? ` ; ${rep.partsWithoutCost} sortie(s) sans coût d'achat enregistré non valorisée(s)` : ""}.</p>
      </Card>
      <Card title={`Véhicules réparés (${rep.repaired.length})`} actions={<Btn small kind="ghost" onClick={() => downloadCsv(`rapport-garage-${period.from}-${period.to}.csv`, ["Indicateur", "Valeur"], [["Période", `${period.from} → ${period.to}`], ["Véhicules réparés", rep.repaired.length], ["Véhicules remis", rep.delivered.length], ["Recettes encaissées", fin.receipts], ["Dépenses", fin.expenses], ["Bénéfice estimé", fin.profit], ["Reste à encaisser", fin.outstanding], ["Pièces facturées", rep.partsBilled], ["Main-d'œuvre facturée", rep.labourBilled], ["Coût des pièces sorties", rep.partsCost], ["Minutes de travail saisies", rep.minutes], ...rep.repaired.map((j) => [`Réparé : ${j.data.ref}`, plate(j)])])}><Download className="h-3.5 w-3.5" aria-hidden />Exporter</Btn>}>
        {rep.repaired.length === 0 ? <p className="text-sm text-slate-500">Aucun véhicule réparé sur la période.</p> : <ul className="space-y-0.5 text-sm">{rep.repaired.map((j) => <li key={j.id}>{j.data.ref} · {plate(j)} · {byId<Client>(g.data.client, j.data.client_id)?.data.name}</li>)}</ul>}
      </Card>
    </div>
  );
}
