"use client";

import { Armchair, Droplets, KeyRound, ListTodo, Megaphone, Package, Plus, Sparkles, Trash2, Wallet } from "lucide-react";
import { useState } from "react";
import {
  EQUIP_CONDITIONS,
  EQUIP_CONDITION_LABELS,
  TASK_KINDS,
  TASK_KIND_LABELS,
  TASK_STATUS_LABELS,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtQty,
  today,
  type Doc,
  type Equip,
  type Expense,
  type Locker,
  type Settings,
  type Supply,
  type SupplyMove,
  type Task,
  type TaskStatus,
} from "@/lib/garage/model";
import { Btn, Card, Empty, Field, MemberSelect, Modal, Pill, Stat, Tabs, byId, inp, isMgr, useG, useIdem } from "../ui";

type Tab = "signaler" | "taches" | "equipements" | "fournitures" | "organisation" | "depenses";

export function Repos() {
  const { g } = useG();
  const [tab, setTab] = useState<Tab>("signaler");
  const tasks = (g.data.task as Doc<Task>[]).filter((t) => t.data.zone === "salle_repos");
  const lowSupplies = (g.data.supply as Doc<Supply>[]).filter((s) => s.data.qty <= s.data.min_qty).length;
  return (
    <div className="space-y-3">
      <Tabs<Tab>
        label="Sections de la salle de repos"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "signaler", label: "Signaler", icon: Megaphone },
          { id: "taches", label: "Nettoyage et tâches", icon: ListTodo, count: tasks.filter((t) => t.data.status === "a_faire" || t.data.status === "en_cours").length },
          { id: "equipements", label: "Équipements", icon: Armchair },
          { id: "fournitures", label: "Fournitures", icon: Package, count: lowSupplies },
          { id: "organisation", label: "Organisation", icon: KeyRound },
          { id: "depenses", label: "Dépenses", icon: Wallet },
        ]}
      />
      {tab === "signaler" && <Quick done={() => setTab("taches")} />}
      {tab === "taches" && <Tasks />}
      {tab === "equipements" && <Equipment />}
      {tab === "fournitures" && <Supplies />}
      {tab === "organisation" && <Organisation />}
      {tab === "depenses" && <Expenses />}
    </div>
  );
}

// ---------- Signalement rapide ----------

const QUICK: { title: string; kind: Task["kind"]; icon: typeof Droplets }[] = [
  { title: "Fuite d'eau", kind: "reparation", icon: Droplets },
  { title: "Manque de savon", kind: "entretien", icon: Sparkles },
  { title: "Manque de papier", kind: "entretien", icon: Package },
  { title: "Salle à nettoyer", kind: "nettoyage", icon: Sparkles },
];

function Quick({ done }: { done: () => void }) {
  const { g, act, level } = useG();
  const [f, setF] = useState<{ title: string; kind: Task["kind"]; description: string; assignee_id: string | null; due: string }>({ title: "", kind: "reparation", description: "", assignee_id: null, due: "" });
  const [busy, setBusy] = useState(false);
  const broken = (g.data.equip as Doc<Equip>[]).filter((e) => e.data.condition === "bon" || e.data.condition === "use");
  const [eq, setEq] = useState("");
  if (level < 1) return <Empty text="Votre rôle (lecture seule) ne permet pas de signaler un problème." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">Un problème dans la salle de repos ? Choisissez-le : une tâche est créée{isMgr(level) ? " et vous pouvez l'attribuer" : " et le gérant l'attribuera"}.</p>
      <div className="grid grid-cols-2 gap-2">
        {QUICK.map((q) => (
          <button key={q.title} type="button" onClick={() => setF({ ...f, title: q.title, kind: q.kind })} className={`tab-press flex items-center gap-2 rounded-xl border p-3 text-left text-sm ${f.title === q.title ? "border-[var(--app-primary)] bg-slate-50 font-semibold" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
            <q.icon className="h-5 w-5 shrink-0" style={{ color: "var(--app-primary)" }} aria-hidden />{q.title}
          </button>
        ))}
      </div>
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await act("task.save", { zone: "salle_repos", ...f, due: f.due || null });
        setBusy(false);
        if (r) {
          setF({ title: "", kind: "reparation", description: "", assignee_id: null, due: "" });
          done();
        }
      }}>
        <Field label="Problème"><input className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={160} placeholder="Ex. : robinet qui goutte" /></Field>
        <Field label="Précision (lieu, urgence…)"><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Field>
        {isMgr(level) && (
          <div className="grid grid-cols-2 gap-2">
            <MemberSelect value={f.assignee_id} onChange={(v) => setF({ ...f, assignee_id: v })} label="Attribuer à" />
            <Field label="À faire avant le"><input type="date" className={inp} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
          </div>
        )}
        <Btn type="submit" busy={busy} className="w-full">Signaler</Btn>
      </form>
      {broken.length > 0 && (
        <Card title="Un équipement est en panne ?">
          <form className="flex gap-1.5" onSubmit={async (e) => {
            e.preventDefault();
            if (eq && (await act("equip.report", { id: eq, condition: "panne", note: "" }))) (setEq(""), done());
          }}>
            <label className="sr-only" htmlFor="qeq">Équipement</label>
            <select id="qeq" className={inp} value={eq} onChange={(e) => setEq(e.target.value)} required><option value="">— Équipement —</option>{broken.map((x) => <option key={x.id} value={x.id}>{x.data.name}</option>)}</select>
            <Btn type="submit" small kind="danger">Signaler la panne</Btn>
          </form>
        </Card>
      )}
    </div>
  );
}

// ---------- Tâches ----------

function TaskItem({ task }: { task: Doc<Task> }) {
  const { g, act, level, name, ask } = useG();
  const t = task.data;
  const [finish, setFinish] = useState(false);
  const [cost, setCost] = useState<number | "">("");
  const [expense, setExpense] = useState(false);
  const [assign, setAssign] = useState(false);
  const mine = t.assignee_id === g.me || isMgr(level);
  const equip = byId<Equip>(g.data.equip, t.equipment_id);
  const late = t.due && t.due < today() && (t.status === "a_faire" || t.status === "en_cours");
  const go = (to: TaskStatus) => act("task.status", { id: task.id, to });
  return (
    <li className="rounded-xl border border-slate-200 p-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 font-medium">{t.title}</span>
        <Pill tone={t.kind === "reparation" ? "red" : t.kind === "nettoyage" ? "blue" : "slate"}>{TASK_KIND_LABELS[t.kind]}</Pill>
        <Pill tone={t.status === "fait" ? "green" : t.status === "en_cours" ? "blue" : t.status === "annule" ? "slate" : "amber"}>{TASK_STATUS_LABELS[t.status]}</Pill>
        {late && <Pill tone="red">En retard</Pill>}
      </div>
      <p className="mt-0.5 text-xs text-slate-500">{[t.description, equip && `Équipement : ${equip.data.name}`, t.assignee_id ? `Pour ${name(t.assignee_id)}` : "Non attribuée", t.due && `avant le ${fmtDate(t.due)}`, t.done_at && `terminée le ${fmtDateTime(t.done_at)}`, t.cost !== null && `coût ${fmtMoney(t.cost)}`].filter(Boolean).join(" · ")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {isMgr(level) && (t.status === "a_faire" || t.status === "en_cours") && <Btn small kind="ghost" onClick={() => setAssign(!assign)}>{t.assignee_id ? "Réattribuer" : "Attribuer"}</Btn>}
        {mine && t.status === "a_faire" && <Btn small kind="soft" onClick={() => go("en_cours")}>Commencer</Btn>}
        {mine && (t.status === "a_faire" || t.status === "en_cours") && <Btn small onClick={() => setFinish(true)}>Terminer</Btn>}
        {isMgr(level) && (t.status === "a_faire" || t.status === "en_cours") && <Btn small kind="danger" onClick={async () => (await ask("Annuler cette tâche ? Elle restera dans l'historique.")) && go("annule")}>Annuler</Btn>}
        {isMgr(level) && (t.status === "fait" || t.status === "annule") && <Btn small kind="ghost" onClick={() => go("a_faire")}>Rouvrir</Btn>}
      </div>
      {assign && (
        <div className="mt-2">
          <MemberSelect value={t.assignee_id} label="Attribuer à" onChange={async (v) => (await act("task.save", { id: task.id, zone: t.zone, kind: t.kind, title: t.title, description: t.description, assignee_id: v, due: t.due })) && setAssign(false)} />
        </div>
      )}
      {finish && (
        <Modal title={`Terminer : ${t.title}`} onClose={() => setFinish(false)}>
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            if (await act("task.status", { id: task.id, to: "fait", cost: cost === "" ? null : cost, record_expense: expense && cost !== "" && cost > 0 })) setFinish(false);
          }}>
            {(t.kind === "reparation" || t.kind === "entretien") && <Field label="Coût réel (facultatif)"><input type="number" min={0} className={inp} value={cost} onChange={(e) => setCost(e.target.value === "" ? "" : Number(e.target.value))} /></Field>}
            {isMgr(level) && cost !== "" && cost > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={expense} onChange={(e) => setExpense(e.target.checked)} />Ajouter ce coût aux dépenses du garage</label>}
            {equip && t.kind === "reparation" && <p className="text-xs text-slate-500">L&apos;équipement « {equip.data.name} » repassera en « Bon état ».</p>}
            <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={() => setFinish(false)}>Annuler</Btn><Btn type="submit">Confirmer</Btn></div>
          </form>
        </Modal>
      )}
    </li>
  );
}

function Tasks() {
  const { g, act, level } = useG();
  const [filter, setFilter] = useState<"ouvertes" | "toutes" | "miennes">("ouvertes");
  const [f, setF] = useState({ kind: "nettoyage" as Task["kind"], title: "", description: "", assignee_id: null as string | null, due: "" });
  const [show, setShow] = useState(false);
  const all = (g.data.task as Doc<Task>[]).filter((t) => t.data.zone === "salle_repos");
  const list = all.filter((t) => (filter === "toutes" ? true : filter === "miennes" ? t.data.assignee_id === g.me : t.data.status === "a_faire" || t.data.status === "en_cours"));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="tf">Filtre</label>
        <select id="tf" className={`${inp} !w-auto`} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="ouvertes">À faire et en cours</option>
          <option value="miennes">Mes tâches</option>
          <option value="toutes">Historique complet</option>
        </select>
        {level >= 1 && <Btn small onClick={() => setShow(!show)}><Plus className="h-3.5 w-3.5" aria-hidden />Tâche</Btn>}
      </div>
      {show && (
        <Card title="Nouvelle tâche">
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            if (await act("task.save", { zone: "salle_repos", ...f, due: f.due || null })) (setShow(false), setF({ ...f, title: "", description: "" }));
          }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Type"><select className={inp} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as Task["kind"] })}>{TASK_KINDS.map((k) => <option key={k} value={k}>{TASK_KIND_LABELS[k]}</option>)}</select></Field>
              <Field label="À faire avant le"><input type="date" className={inp} value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></Field>
            </div>
            <Field label="Tâche"><input className={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={160} placeholder="Ex. : nettoyage du sol et des tables" /></Field>
            <Field label="Détails"><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} /></Field>
            {isMgr(level) && <MemberSelect value={f.assignee_id} onChange={(v) => setF({ ...f, assignee_id: v })} label="Attribuer à" />}
            <Btn type="submit" small>Créer</Btn>
          </form>
        </Card>
      )}
      {list.length === 0 ? <Empty text={all.length ? "Aucune tâche pour ce filtre." : "Aucune tâche enregistrée."} icon={ListTodo} /> : <ul className="space-y-2">{list.map((t) => <TaskItem key={t.id} task={t} />)}</ul>}
    </div>
  );
}

// ---------- Équipements ----------

function Equipment() {
  const { g, act, level, ask } = useG();
  const [edit, setEdit] = useState<Doc<Equip> | "new" | null>(null);
  const [f, setF] = useState<Equip>({ name: "", qty: 1, condition: "bon", notes: "" });
  const [hist, setHist] = useState<string | null>(null);
  const list = g.data.equip as Doc<Equip>[];
  const tasks = g.data.task as Doc<Task>[];
  if (edit)
    return (
      <Card title={edit === "new" ? "Nouvel équipement" : edit.data.name}>
        <form className="space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await act("equip.save", { id: edit === "new" ? null : edit.id, ...f })) setEdit(null);
        }}>
          <Field label="Meuble ou équipement"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} placeholder="Table, chaise, réfrigérateur, micro-ondes…" /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quantité"><input type="number" min={0} className={inp} value={f.qty} onChange={(e) => setF({ ...f, qty: Number(e.target.value) })} required /></Field>
            <Field label="État"><select className={inp} value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value as Equip["condition"] })}>{EQUIP_CONDITIONS.map((c) => <option key={c} value={c}>{EQUIP_CONDITION_LABELS[c]}</option>)}</select></Field>
          </div>
          <Field label="Notes"><input className={inp} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={500} /></Field>
          <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={() => setEdit(null)}>Annuler</Btn><Btn type="submit">Enregistrer</Btn></div>
        </form>
      </Card>
    );
  return (
    <div className="space-y-3">
      {isMgr(level) && <Btn small onClick={() => (setF({ name: "", qty: 1, condition: "bon", notes: "" }), setEdit("new"))}><Plus className="h-3.5 w-3.5" aria-hidden />Équipement</Btn>}
      {list.length === 0 ? <Empty text="Aucun meuble ni équipement enregistré." icon={Armchair} /> : (
        <ul className="space-y-2">
          {list.map((e) => {
            const repairs = tasks.filter((t) => t.data.equipment_id === e.id);
            return (
              <li key={e.id} className="rounded-xl border border-slate-200 p-2.5 text-sm">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="min-w-0 flex-1"><strong>{e.data.name}</strong> × {e.data.qty}{e.data.notes ? <span className="block text-xs text-slate-500">{e.data.notes}</span> : null}</span>
                  <Pill tone={e.data.condition === "bon" ? "green" : e.data.condition === "use" ? "amber" : "red"}>{EQUIP_CONDITION_LABELS[e.data.condition]}</Pill>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {level >= 1 && (e.data.condition === "bon" || e.data.condition === "use") && <Btn small kind="danger" onClick={async () => {
                    const note = window.prompt(`Décrivez le problème de « ${e.data.name} » :`) ?? "";
                    if (await ask(`Signaler « ${e.data.name} » en panne et créer une tâche de réparation ?`)) await act("equip.report", { id: e.id, condition: "panne", note });
                  }}>Signaler une panne</Btn>}
                  {isMgr(level) && <Btn small kind="ghost" onClick={() => (setF(e.data), setEdit(e))}>Modifier</Btn>}
                  <Btn small kind="ghost" onClick={() => setHist(hist === e.id ? null : e.id)}>Réparations ({repairs.length})</Btn>
                </div>
                {hist === e.id && (repairs.length === 0 ? <p className="mt-2 text-xs text-slate-500">Aucune réparation enregistrée.</p> : <ul className="mt-2 space-y-0.5 text-xs text-slate-600">{repairs.map((t) => <li key={t.id}>{fmtDate(t.created_at)} · {t.data.title} · {TASK_STATUS_LABELS[t.data.status]}{t.data.cost !== null ? ` · ${fmtMoney(t.data.cost)}` : ""}</li>)}</ul>)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Fournitures ----------

function Supplies() {
  const { g, act, level, name } = useG();
  const [add, setAdd] = useState(false);
  const [f, setF] = useState({ name: "", unit: "unité", min_qty: 1, initial_qty: 0 });
  const [move, setMove] = useState<{ s: Doc<Supply>; dir: 1 | -1 } | null>(null);
  const [m, setM] = useState({ qty: 1, reason: "", cost: "" as number | "", expense: true });
  const [key, resetKey] = useIdem();
  const list = g.data.supply as Doc<Supply>[];
  const moves = g.data.supply_move as Doc<SupplyMove>[];
  return (
    <div className="space-y-3">
      {isMgr(level) && <Btn small onClick={() => setAdd(!add)}><Plus className="h-3.5 w-3.5" aria-hidden />Fourniture</Btn>}
      {add && (
        <Card title="Nouvelle fourniture">
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            if (await act("supply.save", f)) (setAdd(false), setF({ name: "", unit: "unité", min_qty: 1, initial_qty: 0 }));
          }}>
            <Field label="Fourniture"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} placeholder="Eau, savon, papier toilette…" /></Field>
            <div className="grid grid-cols-3 gap-2">
              <Field label="Unité"><input className={inp} value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} required maxLength={20} /></Field>
              <Field label="Seuil d'alerte"><input type="number" min={0} step="any" className={inp} value={f.min_qty} onChange={(e) => setF({ ...f, min_qty: Number(e.target.value) })} /></Field>
              <Field label="Quantité comptée"><input type="number" min={0} step="any" className={inp} value={f.initial_qty} onChange={(e) => setF({ ...f, initial_qty: Number(e.target.value) })} /></Field>
            </div>
            <Btn type="submit" small>Ajouter</Btn>
          </form>
        </Card>
      )}
      {list.length === 0 ? <Empty text="Aucune fourniture suivie." icon={Package} /> : (
        <ul className="space-y-2">
          {list.map((s) => {
            const low = s.data.qty <= s.data.min_qty;
            const last = moves.filter((x) => x.data.supply_id === s.id).slice(0, 3);
            return (
              <li key={s.id} className="rounded-xl border border-slate-200 p-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1"><strong>{s.data.name}</strong><span className="block text-xs text-slate-500">seuil {fmtQty(s.data.min_qty)} {s.data.unit}{s.data.last_cost !== null ? ` · dernier coût ${fmtMoney(s.data.last_cost)}/${s.data.unit}` : ""}</span></span>
                  <span className={`text-base font-bold ${low ? "text-red-700" : ""}`}>{fmtQty(s.data.qty)} <span className="text-xs font-normal">{s.data.unit}</span></span>
                  {low && <Pill tone="red">À racheter</Pill>}
                </div>
                {level >= 1 && (
                  <div className="mt-2 flex gap-1.5">
                    <Btn small kind="soft" onClick={() => (setM({ qty: 1, reason: "", cost: "", expense: true }), setMove({ s, dir: 1 }))}>Entrée / achat</Btn>
                    <Btn small kind="soft" disabled={s.data.qty <= 0} onClick={() => (setM({ qty: 1, reason: "", cost: "", expense: false }), setMove({ s, dir: -1 }))}>Sortie</Btn>
                  </div>
                )}
                {last.length > 0 && <ul className="mt-1.5 space-y-0.5 text-xs text-slate-500">{last.map((x) => <li key={x.id}>{fmtDateTime(x.data.at)} · {x.data.qty > 0 ? "+" : ""}{fmtQty(x.data.qty)} · {x.data.reason}{x.data.cost !== null ? ` · ${fmtMoney(x.data.cost)}` : ""} · {name(x.data.by)}</li>)}</ul>}
              </li>
            );
          })}
        </ul>
      )}
      {move && (
        <Modal title={`${move.dir > 0 ? "Entrée" : "Sortie"} : ${move.s.data.name}`} onClose={() => setMove(null)}>
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            const r = await act("supply.move", { id: move.s.id, qty: move.dir * m.qty, reason: m.reason, cost: move.dir > 0 && m.cost !== "" ? m.cost : null, record_expense: move.dir > 0 && isMgr(level) && m.expense && m.cost !== "" && m.cost > 0, idem: key });
            if (r) (resetKey(), setMove(null));
          }}>
            <Field label={`Quantité (${move.s.data.unit})`}><input type="number" min={0.01} max={move.dir < 0 ? move.s.data.qty : undefined} step="any" className={inp} value={m.qty} onChange={(e) => setM({ ...m, qty: Number(e.target.value) })} required /></Field>
            <Field label="Motif"><input className={inp} value={m.reason} onChange={(e) => setM({ ...m, reason: e.target.value })} maxLength={200} placeholder={move.dir > 0 ? "Achat, don…" : "Mise à disposition…"} /></Field>
            {move.dir > 0 && <Field label="Coût total réel de l'achat (facultatif)"><input type="number" min={0} className={inp} value={m.cost} onChange={(e) => setM({ ...m, cost: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>}
            {move.dir > 0 && isMgr(level) && m.cost !== "" && m.cost > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={m.expense} onChange={(e) => setM({ ...m, expense: e.target.checked })} />Enregistrer cet achat dans les dépenses</label>}
            <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={() => setMove(null)}>Annuler</Btn><Btn type="submit">Enregistrer</Btn></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------- Organisation ----------

function Organisation() {
  const { g, act, level, name } = useG();
  const settings = (g.data.settings[0] as Doc<Settings> | undefined)?.data ?? { capacity: null, seats: null, rules: [] };
  const [f, setF] = useState({ capacity: (settings.capacity ?? "") as number | "", seats: (settings.seats ?? "") as number | "", rules: settings.rules });
  const [rule, setRule] = useState("");
  const [lk, setLk] = useState<{ id: string | null; number: string; assignee_id: string | null; status: Locker["status"]; note: string } | null>(null);
  const lockers = g.data.locker as Doc<Locker>[];
  const mgr = isMgr(level);
  return (
    <div className="space-y-3">
      <Card title="Capacité et règles" actions={mgr ? <Btn small onClick={() => act("settings.save", { ...f, rules: f.rules })}>Enregistrer</Btn> : undefined}>
        <fieldset disabled={!mgr} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Capacité d'accueil (personnes)"><input type="number" min={0} className={inp} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
            <Field label="Nombre de places assises"><input type="number" min={0} className={inp} value={f.seats} onChange={(e) => setF({ ...f, seats: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
          </div>
          <p className="text-sm font-medium text-slate-700">Règles d&apos;utilisation</p>
          {f.rules.length === 0 ? <p className="text-sm text-slate-500">Aucune règle.</p> : (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {f.rules.map((r) => <li key={r.id}><span className="flex items-start gap-2"><span className="flex-1">{r.text}</span>{mgr && <button type="button" className="text-slate-400 hover:text-red-600" aria-label="Retirer la règle" onClick={() => setF({ ...f, rules: f.rules.filter((x) => x.id !== r.id) })}><Trash2 className="h-3.5 w-3.5" aria-hidden /></button>}</span></li>)}
            </ol>
          )}
          {mgr && (
            <div className="flex gap-1.5">
              <label className="sr-only" htmlFor="rule">Nouvelle règle</label>
              <input id="rule" className={inp} value={rule} onChange={(e) => setRule(e.target.value)} maxLength={300} placeholder="Ex. : laver sa vaisselle après usage" />
              <Btn small kind="soft" disabled={!rule.trim()} onClick={() => (setF({ ...f, rules: [...f.rules, { id: crypto.randomUUID(), text: rule.trim() }] }), setRule(""))}>Ajouter</Btn>
            </div>
          )}
          {mgr && <p className="text-xs text-slate-500">Cliquez sur « Enregistrer » pour conserver les changements.</p>}
        </fieldset>
      </Card>
      <Card title={`Casiers (${lockers.length})`} actions={mgr ? <Btn small kind="soft" onClick={() => setLk({ id: null, number: "", assignee_id: null, status: "libre", note: "" })}><Plus className="h-3.5 w-3.5" aria-hidden />Casier</Btn> : undefined}>
        {lockers.length === 0 ? <p className="text-sm text-slate-500">Aucun casier enregistré.</p> : (
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {lockers.map((l) => (
              <button key={l.id} type="button" disabled={!mgr} onClick={() => setLk({ id: l.id, ...l.data })} className={`rounded-xl border p-2 text-left text-xs ${l.data.status === "libre" ? "border-green-200 bg-green-50" : l.data.status === "hors_service" ? "border-slate-200 bg-slate-100" : "border-blue-200 bg-blue-50"}`}>
                <span className="block text-sm font-bold">{l.data.number}</span>
                {l.data.status === "attribue" ? name(l.data.assignee_id) : l.data.status === "libre" ? "Libre" : "Hors service"}
              </button>
            ))}
          </div>
        )}
      </Card>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Casiers libres" value={lockers.filter((l) => l.data.status === "libre").length} tone="green" />
        <Stat label="Équipements" value={(g.data.equip as Doc<Equip>[]).reduce((a, e) => a + e.data.qty, 0)} />
        <Stat label="En panne" value={(g.data.equip as Doc<Equip>[]).filter((e) => e.data.condition === "panne" || e.data.condition === "endommage").length} tone="red" />
      </div>
      {lk && (
        <Modal title={lk.id ? `Casier ${lk.number}` : "Nouveau casier"} onClose={() => setLk(null)}>
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            if (await act("locker.save", lk)) setLk(null);
          }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Numéro"><input className={inp} value={lk.number} onChange={(e) => setLk({ ...lk, number: e.target.value })} required maxLength={20} /></Field>
              <Field label="État"><select className={inp} value={lk.status} onChange={(e) => setLk({ ...lk, status: e.target.value as Locker["status"] })}><option value="libre">Libre</option><option value="attribue">Attribué</option><option value="hors_service">Hors service</option></select></Field>
            </div>
            {lk.status !== "hors_service" && <MemberSelect value={lk.assignee_id} onChange={(v) => setLk({ ...lk, assignee_id: v, status: v ? "attribue" : "libre" })} label="Attribué à" />}
            <Field label="Note"><input className={inp} value={lk.note} onChange={(e) => setLk({ ...lk, note: e.target.value })} maxLength={300} /></Field>
            <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={() => setLk(null)}>Annuler</Btn><Btn type="submit">Enregistrer</Btn></div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ---------- Dépenses ----------

function Expenses() {
  const { g, act, level } = useG();
  const [f, setF] = useState({ date: today(), category: "Fournitures", amount: "" as number | "", description: "" });
  const [key, resetKey] = useIdem();
  if (!isMgr(level)) return <Empty text="Les dépenses sont réservées aux gérants." icon={Wallet} />;
  const list = (g.data.expense as Doc<Expense>[]).filter((e) => e.data.zone === "salle_repos" && !e.data.deleted);
  const total = list.reduce((a, e) => a + e.data.amount, 0);
  const repairs = (g.data.task as Doc<Task>[]).filter((t) => t.data.zone === "salle_repos" && t.data.cost !== null);
  return (
    <div className="space-y-3">
      <Card title="Ajouter une dépense de la salle de repos">
        <form className="space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          if (await act("expense.save", { ...f, zone: "salle_repos", idem: key })) (resetKey(), setF({ ...f, amount: "", description: "" }));
        }}>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Date"><input type="date" max={today()} className={inp} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></Field>
            <Field label="Catégorie"><select className={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option>Fournitures</option><option>Entretien</option><option>Mobilier</option><option>Autre</option></select></Field>
            <Field label="Montant"><input type="number" min={1} className={inp} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value === "" ? "" : Number(e.target.value) })} required /></Field>
          </div>
          <Field label="Description"><input className={inp} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} /></Field>
          <Btn type="submit" small>Enregistrer</Btn>
        </form>
      </Card>
      <Card title={`Dépenses enregistrées : ${fmtMoney(total)}`}>
        {list.length === 0 ? <p className="text-sm text-slate-500">Aucune dépense pour la salle de repos.</p> : <ul className="space-y-1 text-sm">{list.map((e) => <li key={e.id} className="flex justify-between gap-2"><span className="truncate">{fmtDate(e.data.date)} · {e.data.category}{e.data.description ? ` · ${e.data.description}` : ""}</span><strong>{fmtMoney(e.data.amount)}</strong></li>)}</ul>}
        <p className="mt-2 text-xs text-slate-500">Ces dépenses sont aussi comptées dans les finances du bureau.</p>
      </Card>
      {repairs.length > 0 && <Card title="Coûts de réparation suivis"><ul className="space-y-0.5 text-sm">{repairs.map((t) => <li key={t.id} className="flex justify-between gap-2"><span className="truncate">{t.data.title}</span><span>{fmtMoney(t.data.cost!)}</span></li>)}</ul></Card>}
    </div>
  );
}
