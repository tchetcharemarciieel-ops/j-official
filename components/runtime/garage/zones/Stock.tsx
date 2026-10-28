"use client";

import { AlertTriangle, ArrowDownUp, BarChart3, Boxes, Download, Pencil, Plus, ShoppingCart, Trash2, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import {
  MOVE_TYPE_LABELS,
  PO_STATUS_LABELS,
  activityReport,
  dormantParts,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtQty,
  inPeriod,
  periodPreset,
  searchable,
  stockAlerts,
  stockValue,
  suggestedQty,
  today,
  type Client,
  type Doc,
  type Job,
  type Move,
  type Part,
  type Period,
  type Po,
  type Supplier,
} from "@/lib/garage/model";
import { Btn, Card, Empty, Field, Modal, PeriodPicker, Pill, Row, Search, Stat, Tabs, byId, downloadCsv, inp, isMgr, useG, useIdem } from "../ui";

type Tab = "inventaire" | "mouvements" | "alertes" | "vente" | "fournisseurs" | "commandes" | "rapports";

export function Stock() {
  const { g } = useG();
  const [tab, setTab] = useState<Tab>("inventaire");
  const [poDraft, setPoDraft] = useState<{ supplier_id: string; lines: { part_id: string; qty: number }[] } | null>(null);
  const alerts = stockAlerts(g.data.part);
  return (
    <div className="space-y-3">
      <Tabs<Tab>
        label="Sections du stock"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "inventaire", label: "Inventaire", icon: Boxes },
          { id: "mouvements", label: "Mouvements", icon: ArrowDownUp },
          { id: "alertes", label: "Alertes", icon: AlertTriangle, count: alerts.out.length + alerts.low.length },
          { id: "vente", label: "Vente", icon: ShoppingCart },
          { id: "fournisseurs", label: "Fournisseurs", icon: Truck },
          { id: "commandes", label: "Commandes", icon: Plus, count: (g.data.po as Doc<Po>[]).filter((p) => p.data.status === "commandee" || p.data.status === "partielle").length },
          { id: "rapports", label: "Valeur et rapports", icon: BarChart3 },
        ]}
      />
      {tab === "inventaire" && <Inventory />}
      {tab === "mouvements" && <Moves />}
      {tab === "alertes" && <Alerts onOrder={(d) => (setPoDraft(d), setTab("commandes"))} />}
      {tab === "vente" && <Sale />}
      {tab === "fournisseurs" && <Suppliers />}
      {tab === "commandes" && <Orders draft={poDraft} clearDraft={() => setPoDraft(null)} />}
      {tab === "rapports" && <Reports />}
    </div>
  );
}

const partLabel = (p?: Doc<Part>) => (p ? `${p.data.name}${p.data.ref ? ` (${p.data.ref})` : ""}` : "Pièce supprimée");

// ---------- Inventaire ----------

function PartForm({ part, onDone }: { part?: Doc<Part>; onDone: () => void }) {
  const { g, act } = useG();
  const [f, setF] = useState({
    name: part?.data.name ?? "",
    ref: part?.data.ref ?? "",
    category: part?.data.category ?? "",
    location: part?.data.location ?? "",
    min_qty: part?.data.min_qty ?? 0,
    buy_price: (part?.data.buy_price ?? "") as number | "",
    sell_price: (part?.data.sell_price ?? "") as number | "",
    supplier_id: part?.data.supplier_id ?? "",
    active: part?.data.active ?? true,
    initial_qty: 0,
  });
  const [busy, setBusy] = useState(false);
  const cats = [...new Set((g.data.part as Doc<Part>[]).map((p) => p.data.category).filter(Boolean))];
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const { initial_qty, ...rest } = f;
      const r = await act("part.save", { id: part?.id ?? null, ...rest, supplier_id: f.supplier_id || null, ...(part ? {} : { initial_qty }) });
      setBusy(false);
      if (r) onDone();
    }}>
      <Field label="Nom de la pièce"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Référence"><input className={inp} value={f.ref} onChange={(e) => setF({ ...f, ref: e.target.value })} maxLength={60} /></Field>
        <Field label="Catégorie">
          <input className={inp} list="cats" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} maxLength={60} />
          <datalist id="cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Emplacement"><input className={inp} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} maxLength={60} placeholder="Étagère B2…" /></Field>
        <Field label="Seuil minimum"><input type="number" min={0} step="any" className={inp} value={f.min_qty} onChange={(e) => setF({ ...f, min_qty: Number(e.target.value) })} required /></Field>
        <Field label="Prix d'achat (FCFA)"><input type="number" min={0} className={inp} value={f.buy_price} onChange={(e) => setF({ ...f, buy_price: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
        <Field label="Prix de vente (FCFA)"><input type="number" min={0} className={inp} value={f.sell_price} onChange={(e) => setF({ ...f, sell_price: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
      </div>
      <Field label="Fournisseur habituel">
        <select className={inp} value={f.supplier_id} onChange={(e) => setF({ ...f, supplier_id: e.target.value })}>
          <option value="">—</option>
          {(g.data.supplier as Doc<Supplier>[]).map((s) => <option key={s.id} value={s.id}>{s.data.name}</option>)}
        </select>
      </Field>
      {!part && <Field label="Quantité actuellement en stock" hint="Comptée physiquement : elle crée un mouvement « Stock initial »."><input type="number" min={0} step="any" className={inp} value={f.initial_qty} onChange={(e) => setF({ ...f, initial_qty: Number(e.target.value) })} /></Field>}
      {part && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Pièce active (décocher pour la retirer des listes sans perdre son historique)</label>}
      <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onDone}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer</Btn></div>
    </form>
  );
}

function PartDetail({ part, onBack }: { part: Doc<Part>; onBack: () => void }) {
  const { g, act, level, name, ask } = useG();
  const [edit, setEdit] = useState(false);
  const [rcv, setRcv] = useState({ qty: 1, unit_cost: (part.data.buy_price ?? "") as number | "", reason: "" });
  const [adj, setAdj] = useState({ counted: part.data.qty, reason: "" });
  const [rk, resetR] = useIdem();
  const [ak, resetA] = useIdem();
  const moves = (g.data.move as Doc<Move>[]).filter((m) => m.data.part_id === part.id);
  const supplier = byId<Supplier>(g.data.supplier, part.data.supplier_id);
  if (edit) return <Card title="Modifier la pièce"><PartForm part={part} onDone={() => setEdit(false)} /></Card>;
  return (
    <div className="space-y-3">
      <button type="button" className="text-sm text-slate-500 hover:underline" onClick={onBack}>← Inventaire</button>
      <Card title={partLabel(part)} actions={isMgr(level) ? <Btn small kind="ghost" onClick={() => setEdit(true)}><Pencil className="h-3.5 w-3.5" aria-hidden />Modifier</Btn> : undefined}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="En stock" value={fmtQty(part.data.qty)} tone={part.data.qty <= 0 ? "red" : part.data.qty <= part.data.min_qty ? "amber" : "green"} />
          <Stat label="Seuil" value={fmtQty(part.data.min_qty)} />
          <Stat label="Prix achat" value={part.data.buy_price !== null ? fmtMoney(part.data.buy_price) : "—"} />
        </div>
        <p className="mt-2 text-xs text-slate-500">{[part.data.category, part.data.location && `Emplacement ${part.data.location}`, supplier && `Fournisseur ${supplier.data.name}`, part.data.sell_price !== null && `Vente ${fmtMoney(part.data.sell_price)}`].filter(Boolean).join(" · ") || "—"}{!part.data.active && " · INACTIVE"}</p>
      </Card>
      {level >= 1 && part.data.active && (
        <Card title="Réception hors commande">
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            if (await act("stock.receive", { part_id: part.id, ...rcv, unit_cost: rcv.unit_cost === "" ? null : rcv.unit_cost, idem: rk })) (resetR(), setRcv({ ...rcv, qty: 1, reason: "" }));
          }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantité reçue"><input type="number" min={0.01} step="any" className={inp} value={rcv.qty} onChange={(e) => setRcv({ ...rcv, qty: Number(e.target.value) })} required /></Field>
              <Field label="Coût unitaire réel"><input type="number" min={0} className={inp} value={rcv.unit_cost} onChange={(e) => setRcv({ ...rcv, unit_cost: e.target.value === "" ? "" : Number(e.target.value) })} /></Field>
            </div>
            <Field label="Motif / bon de livraison"><input className={inp} value={rcv.reason} onChange={(e) => setRcv({ ...rcv, reason: e.target.value })} maxLength={200} /></Field>
            <Btn type="submit" small>Enregistrer la réception</Btn>
          </form>
        </Card>
      )}
      {isMgr(level) && (
        <Card title="Ajustement après inventaire">
          <form className="space-y-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!(await ask(`Fixer le stock de « ${part.data.name} » à ${adj.counted} (actuellement ${part.data.qty}) ?`))) return;
            if (await act("stock.adjust", { part_id: part.id, ...adj, idem: ak })) (resetA(), setAdj({ ...adj, reason: "" }));
          }}>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Quantité comptée"><input type="number" min={0} step="any" className={inp} value={adj.counted} onChange={(e) => setAdj({ ...adj, counted: Number(e.target.value) })} required /></Field>
              <Field label="Motif"><input className={inp} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} required maxLength={200} placeholder="Inventaire, casse…" /></Field>
            </div>
            <Btn type="submit" small kind="soft">Ajuster</Btn>
          </form>
        </Card>
      )}
      <Card title="Historique des mouvements">
        {moves.length === 0 ? <p className="text-sm text-slate-500">Aucun mouvement.</p> : <MoveList moves={moves} name={name} showPart={false} />}
      </Card>
    </div>
  );
}

function MoveList({ moves, name, showPart }: { moves: Doc<Move>[]; name: (id: string) => string; showPart: boolean }) {
  const { g, openJob } = useG();
  return (
    <ul className="space-y-1">
      {moves.map((m) => {
        const job = byId<Job>(g.data.job, m.data.job_id);
        return (
          <li key={m.id} className="flex items-start gap-2 text-sm">
            <span className={`w-14 shrink-0 text-right font-mono ${m.data.qty < 0 ? "text-red-700" : "text-green-700"}`}>{m.data.qty > 0 ? "+" : ""}{fmtQty(m.data.qty)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate">{showPart ? `${partLabel(byId<Part>(g.data.part, m.data.part_id))} · ` : ""}{MOVE_TYPE_LABELS[m.data.type]}{m.data.reason ? ` — ${m.data.reason}` : ""}</span>
              <span className="block text-xs text-slate-500">{fmtDateTime(m.data.at)} · {name(m.data.by)} · solde {fmtQty(m.data.balance_after)}{job && <> · <button type="button" className="underline" onClick={() => openJob(job.id)}>{job.data.ref}</button></>}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Inventory() {
  const { g, level } = useG();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [sup, setSup] = useState("");
  const [avail, setAvail] = useState<"" | "ok" | "low" | "out" | "inactive">("");
  const [sel, setSel] = useState<string | "new" | null>(null);
  const parts = g.data.part as Doc<Part>[];
  const cats = [...new Set(parts.map((p) => p.data.category).filter(Boolean))].sort();
  const list = parts
    .filter((p) => (avail === "inactive" ? !p.data.active : p.data.active))
    .filter((p) => !cat || p.data.category === cat)
    .filter((p) => !sup || p.data.supplier_id === sup)
    .filter((p) => (avail === "ok" ? p.data.qty > p.data.min_qty : avail === "low" ? p.data.qty > 0 && p.data.qty <= p.data.min_qty : avail === "out" ? p.data.qty <= 0 : true))
    .filter((p) => !q.trim() || searchable(`${p.data.name} ${p.data.ref} ${p.data.location}`).includes(searchable(q)))
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
  if (sel === "new") return <Card title="Nouvelle pièce"><PartForm onDone={() => setSel(null)} /></Card>;
  const part = sel ? byId<Part>(parts, sel) : undefined;
  if (part) return <PartDetail part={part} onBack={() => setSel(null)} />;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1"><Search value={q} onChange={setQ} placeholder="Nom, référence, emplacement…" /></div>
        {isMgr(level) && <Btn onClick={() => setSel("new")}><Plus className="h-4 w-4" aria-hidden />Pièce</Btn>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Catégorie"><select className={inp} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes</option>{cats.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Fournisseur"><select className={inp} value={sup} onChange={(e) => setSup(e.target.value)}><option value="">Tous</option>{(g.data.supplier as Doc<Supplier>[]).map((s) => <option key={s.id} value={s.id}>{s.data.name}</option>)}</select></Field>
        <Field label="Disponibilité">
          <select className={inp} value={avail} onChange={(e) => setAvail(e.target.value as typeof avail)}>
            <option value="">Toutes</option>
            <option value="ok">Disponible</option>
            <option value="low">Sous le seuil</option>
            <option value="out">Épuisée</option>
            <option value="inactive">Inactives</option>
          </select>
        </Field>
      </div>
      {parts.length === 0 ? <Empty text="Aucune pièce dans le catalogue." icon={Boxes}>{!isMgr(level) && <p className="text-xs">Un gérant peut ajouter les pièces.</p>}</Empty> : list.length === 0 ? <Empty text="Aucune pièce pour ces filtres." /> : (
        <div className="space-y-1.5">
          {list.map((p) => (
            <Row key={p.id} onClick={() => setSel(p.id)}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{partLabel(p)}</span><span className="block truncate text-xs text-slate-500">{[p.data.category, p.data.location].filter(Boolean).join(" · ") || "—"}</span></span>
              <span className="text-right"><span className="block font-semibold">{fmtQty(p.data.qty)}</span>{p.data.qty <= 0 ? <Pill tone="red">Épuisée</Pill> : p.data.qty <= p.data.min_qty ? <Pill tone="amber">Sous le seuil</Pill> : null}</span>
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Mouvements ----------

function Moves() {
  const { g, name } = useG();
  const [period, setPeriod] = useState<Period>(periodPreset("month"));
  const [type, setType] = useState("");
  const moves = (g.data.move as Doc<Move>[]).filter((m) => inPeriod(m.data.at, period) && (!type || m.data.type === type));
  return (
    <div className="space-y-3">
      <PeriodPicker value={period} onChange={setPeriod} />
      <div className="flex gap-2">
        <label className="sr-only" htmlFor="mvt">Type</label>
        <select id="mvt" className={inp} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les mouvements</option>
          {Object.entries(MOVE_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Btn kind="ghost" disabled={!moves.length} onClick={() => downloadCsv(`mouvements-stock-${period.from}-${period.to}.csv`, ["Date", "Pièce", "Type", "Quantité", "Solde", "Coût unitaire", "Motif", "Dossier", "Utilisateur"], moves.map((m) => [m.data.at, partLabel(byId<Part>(g.data.part, m.data.part_id)), MOVE_TYPE_LABELS[m.data.type], m.data.qty, m.data.balance_after, m.data.unit_cost, m.data.reason, byId<Job>(g.data.job, m.data.job_id)?.data.ref ?? "", name(m.data.by)]))}><Download className="h-4 w-4" aria-hidden />CSV</Btn>
      </div>
      {moves.length === 0 ? <Empty text="Aucun mouvement sur cette période." icon={ArrowDownUp} /> : <MoveList moves={moves} name={name} showPart />}
    </div>
  );
}

// ---------- Alertes et réapprovisionnement ----------

function Alerts({ onOrder }: { onOrder: (d: { supplier_id: string; lines: { part_id: string; qty: number }[] }) => void }) {
  const { g, level } = useG();
  const { out, low } = stockAlerts(g.data.part);
  const list = [...out, ...low];
  const bySupplier = new Map<string, Doc<Part>[]>();
  for (const p of list) bySupplier.set(p.data.supplier_id ?? "", [...(bySupplier.get(p.data.supplier_id ?? "") ?? []), p]);
  if (!list.length) return <Empty text="Aucune pièce sous son seuil minimum." icon={AlertTriangle} />;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2"><Stat label="Épuisées" value={out.length} tone="red" /><Stat label="Sous le seuil" value={low.length} tone="amber" /></div>
      <p className="text-xs text-slate-500">Liste de réapprovisionnement : quantité proposée pour revenir au double du seuil. Aucune commande n&apos;est créée sans votre action.</p>
      {[...bySupplier.entries()].map(([sid, parts]) => {
        const s = byId<Supplier>(g.data.supplier, sid);
        return (
          <Card key={sid || "none"} title={s ? s.data.name : "Sans fournisseur habituel"} actions={s && isMgr(level) ? <Btn small kind="soft" onClick={() => onOrder({ supplier_id: sid, lines: parts.map((p) => ({ part_id: p.id, qty: suggestedQty(p.data) })) })}>Préparer une commande</Btn> : undefined}>
            <ul className="space-y-1">
              {parts.map((p) => (
                <li key={p.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{partLabel(p)}</span>
                  <span className="text-xs text-slate-500">stock {fmtQty(p.data.qty)} / seuil {fmtQty(p.data.min_qty)}</span>
                  <Pill tone={p.data.qty <= 0 ? "red" : "amber"}>à commander : {suggestedQty(p.data)}</Pill>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

// ---------- Vente au comptoir ----------

function Sale() {
  const { g, act, level } = useG();
  const parts = (g.data.part as Doc<Part>[]).filter((p) => p.data.active && p.data.qty > 0);
  const [lines, setLines] = useState<{ part_id: string; qty: number; unit_price: number | "" }[]>([{ part_id: "", qty: 1, unit_price: "" }]);
  const [client, setClient] = useState("");
  const [customer, setCustomer] = useState("");
  const [key, resetKey] = useIdem();
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((a, l) => {
    const p = byId<Part>(parts, l.part_id);
    const price = l.unit_price === "" ? (p?.data.sell_price ?? 0) : l.unit_price;
    return a + Math.round(l.qty * price);
  }, 0);
  if (level < 1) return <Empty text="Votre rôle (lecture seule) ne permet pas d'enregistrer une vente." />;
  if (!parts.length) return <Empty text="Aucune pièce disponible à la vente." icon={ShoppingCart} />;
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await act("invoice.sale", { client_id: client || null, customer_name: customer, lines: lines.filter((l) => l.part_id).map((l) => ({ ...l, unit_price: l.unit_price === "" ? null : l.unit_price })), idem: key });
      setBusy(false);
      if (r) {
        resetKey();
        setLines([{ part_id: "", qty: 1, unit_price: "" }]);
      }
    }}>
      <Card title="Pièces vendues">
        <div className="space-y-2">
          {lines.map((l, i) => {
            const p = byId<Part>(parts, l.part_id);
            return (
              <div key={i} className="grid grid-cols-[1fr_64px_96px_auto] items-end gap-1.5">
                <Field label={i === 0 ? "Pièce" : ""}>
                  <select className={inp} value={l.part_id} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, part_id: e.target.value, unit_price: "" } : x)))} required>
                    <option value="">—</option>
                    {parts.map((pp) => <option key={pp.id} value={pp.id}>{partLabel(pp)} — {fmtQty(pp.data.qty)}</option>)}
                  </select>
                </Field>
                <Field label={i === 0 ? "Qté" : ""}><input type="number" min={0.01} max={p?.data.qty} step="any" className={inp} value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} required /></Field>
                <Field label={i === 0 ? "Prix unitaire" : ""}><input type="number" min={0} className={inp} placeholder={p?.data.sell_price !== null && p?.data.sell_price !== undefined ? String(p.data.sell_price) : "À saisir"} value={l.unit_price} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, unit_price: e.target.value === "" ? "" : Number(e.target.value) } : x)))} required={p ? p.data.sell_price === null : false} /></Field>
                <button type="button" className="mb-1 rounded-lg p-2 text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => setLines(lines.length > 1 ? lines.filter((_, k) => k !== i) : lines)}><Trash2 className="h-4 w-4" aria-hidden /></button>
              </div>
            );
          })}
        </div>
        <Btn small kind="soft" className="mt-2" onClick={() => setLines([...lines, { part_id: "", qty: 1, unit_price: "" }])}><Plus className="h-3.5 w-3.5" aria-hidden />Ligne</Btn>
      </Card>
      <Card title="Client">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Client enregistré"><select className={inp} value={client} onChange={(e) => setClient(e.target.value)}><option value="">— Client de passage —</option>{(g.data.client as Doc<Client>[]).map((c) => <option key={c.id} value={c.id}>{c.data.name}</option>)}</select></Field>
          {!client && <Field label="Nom (facultatif)"><input className={inp} value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={120} /></Field>}
        </div>
      </Card>
      <p className="text-right text-sm">Total : <strong>{fmtMoney(total)}</strong></p>
      <p className="text-xs text-slate-500">La vente crée une facture (impayée tant qu&apos;aucun paiement n&apos;est enregistré dans Accueil › Factures) et déduit le stock une seule fois.</p>
      <Btn type="submit" busy={busy} className="w-full">Enregistrer la vente</Btn>
    </form>
  );
}

// ---------- Fournisseurs ----------

function Suppliers() {
  const { g, act, level } = useG();
  const [sel, setSel] = useState<Doc<Supplier> | "new" | null>(null);
  const empty: Supplier = { name: "", contact: "", phone: "", email: "", address: "", notes: "", active: true };
  const [f, setF] = useState<Supplier>(empty);
  const [busy, setBusy] = useState(false);
  const list = g.data.supplier as Doc<Supplier>[];
  if (sel)
    return (
      <Card title={sel === "new" ? "Nouveau fournisseur" : sel.data.name}>
        <form className="space-y-2" onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const r = await act("supplier.save", { id: sel === "new" ? null : sel.id, ...f });
          setBusy(false);
          if (r) setSel(null);
        }}>
          <fieldset disabled={!isMgr(level)} className="space-y-2">
            <Field label="Raison sociale"><input className={inp} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={120} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Contact"><input className={inp} value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} maxLength={120} /></Field>
              <Field label="Téléphone"><input type="tel" className={inp} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} /></Field>
              <Field label="E-mail"><input type="email" className={inp} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={120} /></Field>
              <Field label="Adresse"><input className={inp} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={200} /></Field>
            </div>
            <Field label="Notes"><textarea className={inp} rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Fournisseur actif</label>
          </fieldset>
          <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={() => setSel(null)}>Fermer</Btn>{isMgr(level) && <Btn type="submit" busy={busy}>Enregistrer</Btn>}</div>
        </form>
      </Card>
    );
  return (
    <div className="space-y-3">
      {isMgr(level) && <Btn onClick={() => (setF(empty), setSel("new"))}><Plus className="h-4 w-4" aria-hidden />Fournisseur</Btn>}
      {list.length === 0 ? <Empty text="Aucun fournisseur enregistré." icon={Truck} /> : (
        <div className="space-y-1.5">
          {list.map((s) => (
            <Row key={s.id} onClick={() => (setF(s.data), setSel(s))}>
              <span className="min-w-0 flex-1"><span className="block truncate font-medium">{s.data.name}</span><span className="block truncate text-xs text-slate-500">{[s.data.contact, s.data.phone, s.data.email].filter(Boolean).join(" · ") || "—"}</span></span>
              {!s.data.active && <Pill>Inactif</Pill>}
            </Row>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Commandes d'achat ----------

type PoLineEdit = { id?: string; part_id: string; qty: number; unit_cost: number | "" };

function PoForm({ po, draft, onDone }: { po?: Doc<Po>; draft?: { supplier_id: string; lines: { part_id: string; qty: number }[] } | null; onDone: () => void }) {
  const { g, act } = useG();
  const parts = (g.data.part as Doc<Part>[]).filter((p) => p.data.active);
  const [supplier, setSupplier] = useState(po?.data.supplier_id ?? draft?.supplier_id ?? "");
  const [lines, setLines] = useState<PoLineEdit[]>(po ? po.data.lines.map((l) => ({ id: l.id, part_id: l.part_id, qty: l.qty, unit_cost: l.unit_cost ?? "" })) : draft ? draft.lines.map((l) => ({ ...l, unit_cost: byId<Part>(parts, l.part_id)?.data.buy_price ?? "" })) : [{ part_id: "", qty: 1, unit_cost: "" }]);
  const [extra, setExtra] = useState(po?.data.extra_costs ?? 0);
  const [note, setNote] = useState(po?.data.note ?? "");
  const [busy, setBusy] = useState(false);
  const total = lines.reduce((a, l) => a + Math.round(l.qty * (l.unit_cost === "" ? 0 : l.unit_cost)), 0) + extra;
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true);
      const r = await act("po.save", { id: po?.id ?? null, supplier_id: supplier, lines: lines.filter((l) => l.part_id).map((l) => ({ ...l, unit_cost: l.unit_cost === "" ? null : l.unit_cost })), extra_costs: extra, note });
      setBusy(false);
      if (r) onDone();
    }}>
      <Field label="Fournisseur"><select className={inp} value={supplier} onChange={(e) => setSupplier(e.target.value)} required><option value="">—</option>{(g.data.supplier as Doc<Supplier>[]).filter((s) => s.data.active || s.id === supplier).map((s) => <option key={s.id} value={s.id}>{s.data.name}</option>)}</select></Field>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-[1fr_64px_96px_auto] items-end gap-1.5">
          <Field label={i === 0 ? "Pièce" : ""}><select className={inp} value={l.part_id} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, part_id: e.target.value, unit_cost: byId<Part>(parts, e.target.value)?.data.buy_price ?? x.unit_cost } : x)))} required><option value="">—</option>{parts.map((p) => <option key={p.id} value={p.id}>{partLabel(p)}</option>)}</select></Field>
          <Field label={i === 0 ? "Qté" : ""}><input type="number" min={0.01} step="any" className={inp} value={l.qty} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} required /></Field>
          <Field label={i === 0 ? "Coût unitaire" : ""}><input type="number" min={0} className={inp} value={l.unit_cost} onChange={(e) => setLines(lines.map((x, k) => (k === i ? { ...x, unit_cost: e.target.value === "" ? "" : Number(e.target.value) } : x)))} /></Field>
          <button type="button" className="mb-1 rounded-lg p-2 text-slate-400 hover:text-red-600" aria-label="Retirer" onClick={() => setLines(lines.length > 1 ? lines.filter((_, k) => k !== i) : lines)}><Trash2 className="h-4 w-4" aria-hidden /></button>
        </div>
      ))}
      <Btn small kind="soft" onClick={() => setLines([...lines, { part_id: "", qty: 1, unit_cost: "" }])}><Plus className="h-3.5 w-3.5" aria-hidden />Ligne</Btn>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Frais supplémentaires (transport…)"><input type="number" min={0} className={inp} value={extra} onChange={(e) => setExtra(Number(e.target.value))} /></Field>
        <Field label="Note"><input className={inp} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></Field>
      </div>
      <p className="text-right text-sm">Montant estimé : <strong>{fmtMoney(total)}</strong></p>
      <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onDone}>Annuler</Btn><Btn type="submit" busy={busy}>{po ? "Enregistrer" : "Créer en brouillon"}</Btn></div>
    </form>
  );
}

function Receive({ po, onClose }: { po: Doc<Po>; onClose: () => void }) {
  const { g, act } = useG();
  const pending = po.data.lines.filter((l) => l.received_qty < l.qty);
  const [rows, setRows] = useState(pending.map((l) => ({ part_id: l.part_id, qty: Math.round((l.qty - l.received_qty) * 100) / 100, max: Math.round((l.qty - l.received_qty) * 100) / 100, unit_cost: (l.unit_cost ?? "") as number | "" })));
  const [extra, setExtra] = useState(0);
  const [expense, setExpense] = useState(true);
  const [key] = useIdem();
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Réception de ${po.data.number}`} onClose={onClose}>
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await act("po.receive", { id: po.id, lines: rows.map((x) => ({ part_id: x.part_id, qty: x.qty, unit_cost: x.unit_cost === "" ? null : x.unit_cost })), extra_costs: extra, record_expense: expense, idem: key });
        setBusy(false);
        if (r) onClose();
      }}>
        <p className="text-xs text-slate-500">Saisissez uniquement ce qui a été réellement livré. Le stock est mis à jour à l&apos;enregistrement.</p>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_72px_96px] items-end gap-1.5">
            <span className="pb-2 text-sm">{partLabel(byId<Part>(g.data.part, r.part_id))} <span className="text-xs text-slate-500">(reste {r.max})</span></span>
            <Field label="Reçu"><input type="number" min={0} max={r.max} step="any" className={inp} value={r.qty} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, qty: Number(e.target.value) } : x)))} /></Field>
            <Field label="Coût réel"><input type="number" min={0} className={inp} value={r.unit_cost} onChange={(e) => setRows(rows.map((x, k) => (k === i ? { ...x, unit_cost: e.target.value === "" ? "" : Number(e.target.value) } : x)))} /></Field>
          </div>
        ))}
        <Field label="Frais supplémentaires réels"><input type="number" min={0} className={inp} value={extra} onChange={(e) => setExtra(Number(e.target.value))} /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={expense} onChange={(e) => setExpense(e.target.checked)} />Enregistrer le montant de cette réception dans les dépenses (décochez si la facture fournisseur est déjà saisie dans les dépenses)</label>
        <div className="flex justify-end gap-2"><Btn kind="ghost" onClick={onClose}>Annuler</Btn><Btn type="submit" busy={busy}>Enregistrer la réception</Btn></div>
      </form>
    </Modal>
  );
}

function Orders({ draft, clearDraft }: { draft: { supplier_id: string; lines: { part_id: string; qty: number }[] } | null; clearDraft: () => void }) {
  const { g, act, level, ask } = useG();
  const [edit, setEdit] = useState<Doc<Po> | "new" | null>(draft ? "new" : null);
  const [receive, setReceive] = useState<Doc<Po> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const list = g.data.po as Doc<Po>[];
  if (edit) return <Card title={edit === "new" ? "Nouvelle commande" : `Modifier ${edit.data.number}`}><PoForm po={edit === "new" ? undefined : edit} draft={edit === "new" ? draft : null} onDone={() => (setEdit(null), clearDraft())} /></Card>;
  return (
    <div className="space-y-3">
      {isMgr(level) && <Btn onClick={() => setEdit("new")} disabled={!(g.data.supplier as Doc[]).length} title={!(g.data.supplier as Doc[]).length ? "Ajoutez d'abord un fournisseur" : undefined}><Plus className="h-4 w-4" aria-hidden />Commande</Btn>}
      {list.length === 0 ? <Empty text="Aucune commande d'achat." icon={Truck} /> : list.map((po) => {
        const s = byId<Supplier>(g.data.supplier, po.data.supplier_id);
        const amount = po.data.lines.reduce((a, l) => a + Math.round(l.qty * (l.unit_cost ?? 0)), 0) + po.data.extra_costs;
        return (
          <Card key={po.id} title={<span className="flex items-center gap-2"><span className="font-mono">{po.data.number}</span><Pill tone={po.data.status === "recue" ? "green" : po.data.status === "annulee" ? "slate" : po.data.status === "partielle" ? "amber" : po.data.status === "commandee" ? "blue" : "slate"}>{PO_STATUS_LABELS[po.data.status]}</Pill></span>} actions={<Btn small kind="ghost" onClick={() => setOpen(open === po.id ? null : po.id)}>{open === po.id ? "Masquer" : "Détail"}</Btn>}>
            <p className="text-sm">{s?.data.name ?? "?"} · {po.data.lines.length} ligne(s) · {fmtMoney(amount)} · {fmtDate(po.created_at)}</p>
            {open === po.id && (
              <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                {po.data.lines.map((l) => <li key={l.id}>{partLabel(byId<Part>(g.data.part, l.part_id))} : {fmtQty(l.received_qty)} / {fmtQty(l.qty)} reçu(s){l.unit_cost !== null ? ` · ${fmtMoney(l.unit_cost)}/u` : ""}</li>)}
                {po.data.receptions.map((r, i) => <li key={i}>Réception du {fmtDateTime(r.at)}{r.extra_costs ? ` · frais ${fmtMoney(r.extra_costs)}` : ""}</li>)}
              </ul>
            )}
            {isMgr(level) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {po.data.status === "brouillon" && <Btn small kind="ghost" onClick={() => setEdit(po)}>Modifier</Btn>}
                {po.data.status === "brouillon" && <Btn small onClick={async () => (await ask(`Marquer ${po.data.number} comme passée chez le fournisseur ?`)) && act("po.status", { id: po.id, to: "commandee" })}>Marquer commandée</Btn>}
                {(po.data.status === "commandee" || po.data.status === "partielle") && <Btn small onClick={() => setReceive(po)}>Enregistrer une réception</Btn>}
                {["brouillon", "commandee", "partielle"].includes(po.data.status) && <Btn small kind="danger" onClick={async () => (await ask(`Annuler la commande ${po.data.number} ?`)) && act("po.status", { id: po.id, to: "annulee" })}>Annuler</Btn>}
              </div>
            )}
          </Card>
        );
      })}
      {receive && <Receive po={receive} onClose={() => setReceive(null)} />}
    </div>
  );
}

// ---------- Valeur et rapports ----------

function Reports() {
  const { g } = useG();
  const [period, setPeriod] = useState<Period>(periodPreset("month"));
  const [days, setDays] = useState(90);
  const value = useMemo(() => stockValue(g.data.part), [g.data.part]);
  const rep = useMemo(() => activityReport(g.data, period), [g.data, period]);
  const dormant = useMemo(() => dormantParts(g.data, days), [g.data, days]);
  const parts = g.data.part as Doc<Part>[];
  return (
    <div className="space-y-3">
      <Card title="Valeur estimée du stock" actions={<Btn small kind="ghost" disabled={!parts.length} onClick={() => downloadCsv(`inventaire-${today()}.csv`, ["Nom", "Référence", "Catégorie", "Emplacement", "Quantité", "Seuil", "Prix achat", "Prix vente", "Valeur", "Active"], parts.map((p) => [p.data.name, p.data.ref, p.data.category, p.data.location, p.data.qty, p.data.min_qty, p.data.buy_price, p.data.sell_price, p.data.buy_price !== null ? Math.round(p.data.qty * p.data.buy_price) : "", p.data.active ? "oui" : "non"]))}><Download className="h-3.5 w-3.5" aria-hidden />Inventaire CSV</Btn>}>
        <p className="text-2xl font-bold">{fmtMoney(value.value)}</p>
        <p className="text-xs text-slate-500">Méthode : {value.method}</p>
        {value.unpriced.length > 0 && <p className="mt-1 text-xs text-amber-700">{value.unpriced.length} pièce(s) en stock sans prix d&apos;achat, non valorisée(s) : {value.unpriced.slice(0, 5).map((p) => p.data.name).join(", ")}{value.unpriced.length > 5 ? "…" : ""}</p>}
      </Card>
      <Card title="Pièces les plus utilisées">
        <PeriodPicker value={period} onChange={setPeriod} />
        {rep.topParts.length === 0 ? <p className="mt-2 text-sm text-slate-500">Aucune pièce utilisée ou vendue sur la période.</p> : (
          <ol className="mt-2 space-y-1 text-sm">
            {rep.topParts.map(([pid, q]) => <li key={pid} className="flex justify-between"><span className="truncate">{partLabel(byId<Part>(parts, pid))}</span><span className="font-medium">{fmtQty(q)}</span></li>)}
          </ol>
        )}
        <p className="mt-2 text-xs text-slate-500">Coût des pièces sorties : {fmtMoney(rep.partsCost)}{rep.partsWithoutCost ? ` (${rep.partsWithoutCost} sortie(s) sans coût enregistré, non comptée(s))` : ""}</p>
      </Card>
      <Card title="Pièces sans mouvement">
        <Field label="Depuis (jours)"><input type="number" min={1} className={`${inp} !w-28`} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value)))} /></Field>
        {dormant.length === 0 ? <p className="mt-2 text-sm text-slate-500">Toutes les pièces actives ont bougé sur la période.</p> : <ul className="mt-2 space-y-0.5 text-sm">{dormant.map((p) => <li key={p.id} className="flex justify-between"><span className="truncate">{partLabel(p)}</span><span className="text-slate-500">{fmtQty(p.data.qty)} en stock</span></li>)}</ul>}
      </Card>
    </div>
  );
}
