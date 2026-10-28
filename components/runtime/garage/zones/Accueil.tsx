"use client";

import { Bell, Car, ClipboardList, FilePlus2, Pencil, Plus, Receipt, Users } from "lucide-react";
import { useMemo, useState } from "react";
import {
  INVOICE_STATUS_LABELS,
  JOB_STATUS_LABELS,
  PRESENT,
  PRIORITIES,
  PRIORITY_LABELS,
  balance,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  isLate,
  normalizePlate,
  searchable,
  type Client,
  type Doc,
  type Invoice,
  type Job,
  type JobStatus,
  type Vehicle,
} from "@/lib/garage/model";
import { InvoiceDoc } from "../docs";
import { InvoiceCard, JobDossier, PRIORITY_TONE, STATUS_TONE } from "../JobDossier";
import { Btn, Card, Empty, Field, MemberSelect, Pill, Row, Search, Tabs, byId, inp, isMgr, useG, useIdem } from "../ui";

type Tab = "suivi" | "nouvelle" | "clients" | "factures";

export function Accueil({ jobId, setJobId }: { jobId: string | null; setJobId: (id: string | null) => void }) {
  const { g } = useG();
  const [tab, setTab] = useState<Tab>("suivi");
  const [prefill, setPrefill] = useState<{ client_id: string; vehicle_id: string } | null>(null);
  const ready = (g.data.job as Doc<Job>[]).filter((j) => j.data.status === "pret");
  if (jobId) return <JobDossier jobId={jobId} onBack={() => setJobId(null)} focus="accueil" />;
  return (
    <div className="space-y-3">
      {ready.length > 0 && (
        <button type="button" onClick={() => setTab("suivi")} className="flex w-full items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-left text-sm text-green-800">
          <Bell className="h-4 w-4 shrink-0" aria-hidden />
          <span><strong>{ready.length} véhicule{ready.length > 1 ? "s" : ""} prêt{ready.length > 1 ? "s" : ""}</strong> à remettre : prévenez le{ready.length > 1 ? "s" : ""} client{ready.length > 1 ? "s" : ""}.</span>
        </button>
      )}
      <Tabs<Tab>
        label="Sections de l'accueil"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "suivi", label: "Suivi des véhicules", icon: ClipboardList, count: (g.data.job as Doc<Job>[]).filter((j) => PRESENT.includes(j.data.status)).length },
          { id: "nouvelle", label: "Nouvelle intervention", icon: FilePlus2 },
          { id: "clients", label: "Clients", icon: Users },
          { id: "factures", label: "Factures", icon: Receipt },
        ]}
      />
      {tab === "suivi" && <Tracking open={setJobId} />}
      {tab === "nouvelle" && <NewJob prefill={prefill} onCreated={(id) => (setPrefill(null), setJobId(id))} onClients={() => setTab("clients")} />}
      {tab === "clients" && <Clients open={setJobId} newJob={(client_id, vehicle_id) => (setPrefill({ client_id, vehicle_id }), setTab("nouvelle"))} />}
      {tab === "factures" && <Invoices />}
    </div>
  );
}

// ---------- Suivi ----------

const GROUPS: JobStatus[] = ["pret", "attente", "diagnostic", "reparation", "controle"];

export function JobRow({ job, onOpen }: { job: Doc<Job>; onOpen: () => void }) {
  const { g, name } = useG();
  const v = byId<Vehicle>(g.data.vehicle, job.data.vehicle_id);
  const c = byId<Client>(g.data.client, job.data.client_id);
  return (
    <Row onClick={onOpen}>
      <Car className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{v?.data.plate ?? "?"} <span className="font-normal text-slate-500">· {v ? `${v.data.make} ${v.data.model}` : ""}</span></span>
        <span className="block truncate text-xs text-slate-500">{job.data.ref} · {c?.data.name ?? "?"}{job.data.mechanic_id ? ` · ${name(job.data.mechanic_id)}` : ""}{job.data.planned_end ? ` · fin prévue ${fmtDate(job.data.planned_end)}` : ""}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <Pill tone={STATUS_TONE[job.data.status]}>{JOB_STATUS_LABELS[job.data.status]}</Pill>
        {isLate(job.data) ? <Pill tone="red">En retard</Pill> : job.data.priority !== "normale" ? <Pill tone={PRIORITY_TONE[job.data.priority]}>{PRIORITY_LABELS[job.data.priority]}</Pill> : null}
      </span>
    </Row>
  );
}

function Tracking({ open }: { open: (id: string) => void }) {
  const { g } = useG();
  const [q, setQ] = useState("");
  const jobs = g.data.job as Doc<Job>[];
  const match = (j: Doc<Job>) => {
    if (!q.trim()) return true;
    const v = byId<Vehicle>(g.data.vehicle, j.data.vehicle_id);
    const c = byId<Client>(g.data.client, j.data.client_id);
    return searchable(`${j.data.ref} ${v?.data.plate ?? ""} ${normalizePlate(v?.data.plate ?? "")} ${c?.data.name ?? ""}`).includes(searchable(q.trim()));
  };
  const delivered = jobs.filter((j) => j.data.status === "remis" && match(j)).slice(0, 10);
  if (!jobs.length) return <Empty text="Aucun véhicule enregistré pour l'instant. Créez la première intervention dès qu'un client dépose sa voiture." icon={Car} />;
  return (
    <div className="space-y-3">
      <Search value={q} onChange={setQ} placeholder="Rechercher une immatriculation, un dossier, un client…" />
      {GROUPS.map((s) => {
        const list = jobs.filter((j) => j.data.status === s && match(j));
        return (
          <section key={s} aria-label={JOB_STATUS_LABELS[s]}>
            <h4 className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{JOB_STATUS_LABELS[s]}<span className="rounded-full bg-slate-100 px-1.5 text-slate-600">{list.length}</span></h4>
            {list.length === 0 ? <p className="text-xs text-slate-400">Aucun véhicule.</p> : <div className="space-y-1.5">{list.map((j) => <JobRow key={j.id} job={j} onOpen={() => open(j.id)} />)}</div>}
          </section>
        );
      })}
      <section aria-label="Remis récemment">
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Remis récemment</h4>
        {delivered.length === 0 ? <p className="text-xs text-slate-400">Aucun.</p> : <div className="space-y-1.5">{delivered.map((j) => <JobRow key={j.id} job={j} onOpen={() => open(j.id)} />)}</div>}
      </section>
    </div>
  );
}

// ---------- Nouvelle intervention ----------

function NewJob({ prefill, onCreated, onClients }: { prefill: { client_id: string; vehicle_id: string } | null; onCreated: (id: string) => void; onClients: () => void }) {
  const { g, act, level } = useG();
  const [f, setF] = useState({ client_id: prefill?.client_id ?? "", vehicle_id: prefill?.vehicle_id ?? "", complaint: "", requested_work: "", mileage: "" as number | "", priority: "normale" as Job["priority"], mechanic_id: null as string | null, planned_end: "", planned_minutes: "" as number | "", requires_quote: true });
  const [q, setQ] = useState("");
  const [key, resetKey] = useIdem();
  const [busy, setBusy] = useState(false);
  const clients = g.data.client as Doc<Client>[];
  const vehicles = (g.data.vehicle as Doc<Vehicle>[]).filter((v) => v.data.client_id === f.client_id);
  const filtered = q.trim() ? clients.filter((c) => searchable(`${c.data.name} ${c.data.phone}`).includes(searchable(q))) : clients;
  const vehicle = vehicles.find((v) => v.id === f.vehicle_id);
  if (level < 1) return <Empty text="Votre rôle (lecture seule) ne permet pas de créer une intervention." />;
  if (!clients.length) return <Empty text="Enregistrez d'abord le client et son véhicule." icon={Users}><Btn small onClick={onClients}>Aller aux clients</Btn></Empty>;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await act("job.create", { ...f, mileage: f.mileage === "" ? null : f.mileage, planned_end: f.planned_end || null, planned_minutes: f.planned_minutes === "" ? null : f.planned_minutes, idem: key });
      setBusy(false);
      if (r?.id) {
        resetKey();
        onCreated(r.id);
      }
    }}>
      <Card title="Client et véhicule">
        <div className="space-y-2">
          <Search value={q} onChange={setQ} placeholder="Filtrer les clients…" />
          <Field label="Client">
            <select className={inp} value={f.client_id} onChange={(e) => setF({ ...f, client_id: e.target.value, vehicle_id: "" })} required>
              <option value="">— Choisir —</option>
              {filtered.map((c) => <option key={c.id} value={c.id}>{c.data.name}{c.data.phone ? ` · ${c.data.phone}` : ""}</option>)}
            </select>
          </Field>
          <Field label="Véhicule" hint={f.client_id && !vehicles.length ? "Ce client n'a pas encore de véhicule : ajoutez-le dans l'onglet Clients." : undefined}>
            <select className={inp} value={f.vehicle_id} onChange={(e) => setF({ ...f, vehicle_id: e.target.value })} required disabled={!f.client_id}>
              <option value="">— Choisir —</option>
              {vehicles.map((v) => <option key={v.id} value={v.id}>{v.data.plate} · {v.data.make} {v.data.model}</option>)}
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Demande">
        <div className="space-y-2">
          <Field label="Panne ou demande du client"><textarea className={inp} rows={3} value={f.complaint} onChange={(e) => setF({ ...f, complaint: e.target.value })} required maxLength={2000} /></Field>
          <Field label="Travaux demandés"><textarea className={inp} rows={2} value={f.requested_work} onChange={(e) => setF({ ...f, requested_work: e.target.value })} maxLength={2000} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Kilométrage" hint={vehicle?.data.mileage !== null && vehicle?.data.mileage !== undefined ? `Dernier relevé : ${vehicle.data.mileage.toLocaleString("fr-FR")} km` : undefined}><input type="number" min={0} className={inp} value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
            <Field label="Priorité">
              <select className={inp} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Job["priority"] })}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
              </select>
            </Field>
            <Field label="Fin prévue"><input type="date" className={inp} value={f.planned_end} onChange={(e) => setF({ ...f, planned_end: e.target.value })} /></Field>
            <Field label="Temps prévu (min)"><input type="number" min={0} className={inp} value={f.planned_minutes} onChange={(e) => setF({ ...f, planned_minutes: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
          </div>
          <MemberSelect value={f.mechanic_id} onChange={(v) => setF({ ...f, mechanic_id: v })} />
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={f.requires_quote} disabled={!isMgr(level)} onChange={(e) => setF({ ...f, requires_quote: e.target.checked })} />
            <span>Travaux soumis à devis : la réparation ne démarre qu&apos;après l&apos;accord du client{!isMgr(level) ? " (modifiable par un gérant)" : ""}</span>
          </label>
          <p className="text-xs text-slate-500">Vous pourrez ajouter des photos dans le dossier après sa création.</p>
        </div>
      </Card>
      <Btn type="submit" busy={busy} className="w-full">Créer l&apos;intervention</Btn>
    </form>
  );
}

// ---------- Clients et véhicules ----------

function ClientForm({ client, onDone }: { client?: Doc<Client>; onDone: (id?: string) => void }) {
  const { act } = useG();
  const [f, setF] = useState<Client>(client?.data ?? { name: "", phone: "", email: "", address: "", notes: "" });
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await act("client.save", { id: client?.id ?? null, ...f });
      setBusy(false);
      if (r) onDone(r.id);
    }}>
      <Field label="Nom complet ou entreprise"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Téléphone"><input type="tel" className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></Field>
        <Field label="E-mail"><input type="email" className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} /></Field>
      </div>
      <Field label="Adresse"><input className={inp} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={200} /></Field>
      <Field label="Notes"><textarea className={inp} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field>
      <p className="text-xs text-slate-500">Au moins un téléphone ou un e-mail est demandé pour prévenir le client.</p>
      <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={() => onDone()}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
    </form>
  );
}

function VehicleForm({ clientId, vehicle, onDone }: { clientId: string; vehicle?: Doc<Vehicle>; onDone: () => void }) {
  const { act } = useG();
  const [f, setF] = useState({ plate: vehicle?.data.plate ?? "", make: vehicle?.data.make ?? "", model: vehicle?.data.model ?? "", year: (vehicle?.data.year ?? "") as number | "", vin: vehicle?.data.vin ?? "", mileage: (vehicle?.data.mileage ?? "") as number | "" });
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-2 rounded-xl bg-slate-50 p-2.5" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await act("vehicle.save", { id: vehicle?.id ?? null, client_id: clientId, ...f });
      setBusy(false);
      if (r) onDone();
    }}>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Immatriculation"><input className={`${inp} uppercase`} value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} required maxLength={20} /></Field>
        <Field label="Kilométrage"><input type="number" min={0} className={inp} value={f.mileage} onChange={(e) => setF({ ...f, mileage: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
        <Field label="Marque"><input className={inp} value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} required maxLength={60} /></Field>
        <Field label="Modèle"><input className={inp} value={f.model} onChange={(e) => setF({ ...f, model: e.target.value })} required maxLength={60} /></Field>
        <Field label="Année"><input type="number" min={1900} max={2100} className={inp} value={f.year} onChange={(e) => setF({ ...f, year: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
        <Field label="N° de série (VIN)"><input className={`${inp} uppercase`} value={f.vin} onChange={(e) => setF({ ...f, vin: e.target.value })} maxLength={40} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Btn small kind="ghost" onClick={onDone}>Annuler</Btn><Btn small type="submit" busy={busy}>{vehicle ? "Enregistrer" : "Ajouter le véhicule"}</Btn></div>
    </form>
  );
}

function Clients({ open, newJob }: { open: (jobId: string) => void; newJob: (clientId: string, vehicleId: string) => void }) {
  const { g, level } = useG();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | "new" | null>(null);
  const [editClient, setEditClient] = useState(false);
  const [vForm, setVForm] = useState<string | "new" | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const clients = g.data.client as Doc<Client>[];
  const vehicles = g.data.vehicle as Doc<Vehicle>[];
  const results = useMemo(() => {
    const s = searchable(q.trim());
    if (!s) return clients.slice(0, 50);
    const plate = normalizePlate(q);
    return clients.filter((c) => searchable(`${c.data.name} ${c.data.phone} ${c.data.email}`).includes(s) || (plate.length >= 2 && vehicles.some((v) => v.data.client_id === c.id && normalizePlate(v.data.plate).includes(plate)))).slice(0, 50);
  }, [q, clients, vehicles]);

  if (sel === "new") return <Card title="Nouveau client"><ClientForm onDone={(id) => setSel(id ?? null)} /></Card>;
  const client = sel ? byId<Client>(clients, sel) : undefined;
  if (client) {
    const own = vehicles.filter((v) => v.data.client_id === client.id);
    const jobs = (g.data.job as Doc<Job>[]).filter((j) => j.data.client_id === client.id);
    return (
      <div className="space-y-3">
        <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => (setSel(null), setEditClient(false))}>← Tous les clients</button>
        <Card title={client.data.name} actions={level >= 1 && !editClient ? <Btn small kind="ghost" onClick={() => setEditClient(true)}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</Btn> : undefined}>
          {editClient ? <ClientForm client={client} onDone={() => setEditClient(false)} /> : (
            <dl className="grid grid-cols-[90px_1fr] gap-y-1 text-sm">
              <dt className="text-slate-500">Téléphone</dt><dd>{client.data.phone || "—"}</dd>
              <dt className="text-slate-500">E-mail</dt><dd className="truncate">{client.data.email || "—"}</dd>
              <dt className="text-slate-500">Adresse</dt><dd>{client.data.address || "—"}</dd>
              {client.data.notes && (<><dt className="text-slate-500">Notes</dt><dd>{client.data.notes}</dd></>)}
            </dl>
          )}
        </Card>
        <Card title={`Véhicules (${own.length})`} actions={level >= 1 && vForm === null ? <Btn small kind="soft" onClick={() => setVForm("new")}><Plus className="h-3.5 w-3.5" aria-hidden />Véhicule</Btn> : undefined}>
          {vForm === "new" && <VehicleForm clientId={client.id} onDone={() => setVForm(null)} />}
          {own.length === 0 && vForm !== "new" && <p className="text-sm text-slate-500">Aucun véhicule enregistré.</p>}
          <ul className="space-y-2">
            {own.map((v) => {
              const vJobs = jobs.filter((j) => j.data.vehicle_id === v.id);
              const openJob = vJobs.find((j) => !["remis", "annule"].includes(j.data.status));
              return (
                <li key={v.id} className="rounded-xl border border-slate-200 p-2.5">
                  {vForm === v.id ? <VehicleForm clientId={client.id} vehicle={v} onDone={() => setVForm(null)} /> : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="min-w-0 flex-1 text-sm"><strong>{v.data.plate}</strong> · {v.data.make} {v.data.model}{v.data.year ? ` (${v.data.year})` : ""}<span className="block text-xs text-slate-500">{v.data.mileage !== null ? `${v.data.mileage.toLocaleString("fr-FR")} km` : "Kilométrage non relevé"} · {vJobs.length} intervention(s)</span></span>
                        {level >= 1 && <Btn small kind="ghost" onClick={() => setVForm(v.id)}>Modifier</Btn>}
                        <Btn small kind="ghost" onClick={() => setHistory(history === v.id ? null : v.id)}>Historique</Btn>
                        {openJob ? <Btn small kind="soft" onClick={() => open(openJob.id)}>Dossier {openJob.data.ref}</Btn> : level >= 1 && <Btn small onClick={() => newJob(client.id, v.id)}>Nouvelle intervention</Btn>}
                      </div>
                      {history === v.id && (
                        <div className="mt-2 space-y-1.5">
                          {vJobs.length === 0 ? <p className="text-xs text-slate-500">Aucune intervention pour ce véhicule.</p> : vJobs.map((j) => (
                            <Row key={j.id} onClick={() => open(j.id)}>
                              <span className="min-w-0 flex-1"><span className="block text-sm">{j.data.ref} · {fmtDate(j.created_at)}</span><span className="block truncate text-xs text-slate-500">{j.data.complaint}</span></span>
                              <Pill tone={STATUS_TONE[j.data.status]}>{JOB_STATUS_LABELS[j.data.status]}</Pill>
                            </Row>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1"><Search value={q} onChange={setQ} placeholder="Nom, téléphone, e-mail ou immatriculation…" /></div>
        {level >= 1 && <Btn onClick={() => setSel("new")}><Plus className="h-4 w-4" aria-hidden />Client</Btn>}
      </div>
      {clients.length === 0 ? <Empty text="Aucun client enregistré." icon={Users} /> : results.length === 0 ? <Empty text="Aucun client ne correspond à cette recherche." /> : (
        <div className="space-y-1.5">
          {results.map((c) => {
            const plates = vehicles.filter((v) => v.data.client_id === c.id).map((v) => v.data.plate);
            return (
              <Row key={c.id} onClick={() => setSel(c.id)}>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{c.data.name}</span><span className="block truncate text-xs text-slate-500">{c.data.phone || c.data.email}{plates.length ? ` · ${plates.join(", ")}` : ""}</span></span>
              </Row>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Factures ----------

export function Invoices() {
  const { g } = useG();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"open" | "all" | Invoice["status"]>("open");
  const [sel, setSel] = useState<string | null>(null);
  const [print, setPrint] = useState(false);
  const all = g.data.invoice as Doc<Invoice>[];
  const name = (inv: Invoice) => byId<Client>(g.data.client, inv.client_id)?.data.name ?? (inv.customer_name || "Client de passage");
  const list = all.filter((i) => (status === "all" ? true : status === "open" ? !i.data.cancelled && i.data.status !== "payee" : i.data.status === status) && (!q.trim() || searchable(`${i.data.number} ${name(i.data)}`).includes(searchable(q))));
  const inv = sel ? byId<Invoice>(all, sel) : undefined;
  if (inv)
    return (
      <div className="space-y-3">
        <button type="button" className="text-sm text-slate-500 hover:underline" onClick={() => setSel(null)}>← Toutes les factures</button>
        <p className="text-sm">{name(inv.data)}{inv.data.job_id ? ` · dossier ${byId<Job>(g.data.job, inv.data.job_id)?.data.ref ?? ""}` : ""}</p>
        <InvoiceCard invoice={inv} onPrint={() => setPrint(true)} />
        {print && <InvoiceDoc invoice={inv} onClose={() => setPrint(false)} />}
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1"><Search value={q} onChange={setQ} placeholder="Numéro ou client…" /></div>
        <label className="sr-only" htmlFor="invst">Statut</label>
        <select id="invst" className={`${inp} sm:!w-48`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">À encaisser</option>
          <option value="all">Toutes</option>
          {(["impayee", "partielle", "payee", "annulee"] as const).map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>)}
        </select>
      </div>
      {all.length === 0 ? <Empty text="Aucune facture. Elles se génèrent depuis un dossier (onglet Facture) ou une vente au comptoir (zone Stock)." icon={Receipt} /> : list.length === 0 ? <Empty text="Aucune facture pour ce filtre." /> : (
        <div className="space-y-1.5">
          {list.map((i) => (
            <Row key={i.id} onClick={() => setSel(i.id)}>
              <span className="min-w-0 flex-1"><span className="block text-sm"><span className="font-mono">{i.data.number}</span> · {name(i.data)}</span><span className="block text-xs text-slate-500">{fmtDate(i.data.issued_at)} · total {fmtMoney(i.data.total)}{balance(i.data) > 0 ? ` · reste ${fmtMoney(balance(i.data))}` : ""}</span></span>
              <Pill tone={i.data.status === "payee" ? "green" : i.data.status === "partielle" ? "amber" : i.data.status === "annulee" ? "slate" : "red"}>{INVOICE_STATUS_LABELS[i.data.status]}</Pill>
            </Row>
          ))}
        </div>
      )}
      <p className="text-xs text-slate-500">Dernière mise à jour : {fmtDateTime(new Date().toISOString())}</p>
    </div>
  );
}
