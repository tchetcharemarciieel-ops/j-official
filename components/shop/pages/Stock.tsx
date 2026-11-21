"use client";

import { ArrowDownToLine, ArrowUpFromLine, Boxes, ClipboardCheck, Download, History } from "lucide-react";
import { useMemo, useState } from "react";
import { MOVE_TYPES, STOCK_STATE_LABELS, expiringLots, hasVariants, reservedOf, stockState, stockValue, variantLabel, type Doc, type Move, type Product } from "@/lib/shop/model";
import { useCtx } from "../context";
import { Badge, Card, Empty, Field, Modal, Pager, SearchBox, Tabs, downloadText, fcfa, opKey, paginate, qtyFmt, timeFmt, toCsv } from "../ui";

type Row = { p: Doc<Product>; vid: string | null; label: string; qty: number; reserved: number };

export function Stock() {
  const c = useCtx();
  const [tab, setTab] = useState<"state" | "moves" | "inventory">("state");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"" | "rupture" | "faible" | "peremption">("");
  const [page, setPage] = useState(1);
  const [move, setMove] = useState<{ type: "entree" | "sortie" | "perte" | "endommage" | "ajustement"; row?: Row } | null>(null);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const p of c.products) {
      if (hasVariants(p.data)) for (const v of p.data.variants) out.push({ p, vid: v.id, label: `${p.data.name} — ${variantLabel(v)}`, qty: v.stock, reserved: reservedOf(p.data, v.id) });
      else out.push({ p, vid: null, label: p.data.name, qty: p.data.stock, reserved: reservedOf(p.data, null) });
    }
    const n = q.trim().toLowerCase();
    return out
      .filter((r) => !n || r.label.toLowerCase().includes(n) || r.p.data.barcode.includes(n) || r.p.data.sku.toLowerCase().includes(n))
      .filter((r) => !only || (only === "peremption" ? expiringLots(r.p.data).length > 0 : only === "rupture" ? r.qty <= 0 : r.qty > 0 && r.qty <= r.p.data.min_qty))
      .sort((a, b) => a.qty - b.qty || a.label.localeCompare(b.label, "fr"));
  }, [c.products, q, only]);
  const value = c.products.reduce((a, p) => a + stockValue(p.data), 0);
  const pg = paginate(rows, page, 30);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Articles suivis" value={rows.length} />
        <Kpi label="Ruptures" value={c.products.filter((p) => stockState(p.data) === "rupture").length} tone="text-red-600" />
        <Kpi label="Presque épuisés" value={c.products.filter((p) => stockState(p.data) === "faible").length} tone="text-amber-600" />
        {c.s.can.cost && <Kpi label="Valeur du stock (prix d'achat)" value={fcfa(value)} />}
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => setMove({ type: "entree" })}><ArrowDownToLine className="h-4 w-4" /> Entrée de marchandises</button>
        <button className="btn btn-ghost" onClick={() => setMove({ type: "sortie" })}><ArrowUpFromLine className="h-4 w-4" /> Sortie / perte</button>
        <button className="btn btn-ghost" onClick={() => setTab("inventory")}><ClipboardCheck className="h-4 w-4" /> Faire un inventaire</button>
      </div>
      <Tabs value={tab} onChange={setTab} items={[["state", "État du stock"], ["moves", "Historique des mouvements"], ["inventory", "Inventaire"]]} />
      {tab === "state" && (
        <>
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} /></div>
            <Tabs value={only} onChange={(v) => (setOnly(v), setPage(1))} items={[["", "Tout"], ["rupture", "Ruptures"], ["faible", "Presque épuisés"], ["peremption", "Péremption < 30 j"]]} />
          </div>
          {rows.length === 0 ? (
            <Empty icon={Boxes} title="Aucun article" text="Ajoutez des produits pour suivre leur stock." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr><th className="px-4 py-2">Article</th><th className="px-2 text-right">Stock</th><th className="px-2 text-right">Réservé</th><th className="px-2">État</th><th className="px-2" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {pg.rows.map((r) => {
                    const st = r.qty <= 0 ? "rupture" : r.qty <= r.p.data.min_qty ? "faible" : "ok";
                    const lots = !r.vid ? expiringLots(r.p.data) : [];
                    return (
                      <tr key={`${r.p.id}:${r.vid}`}>
                        <td className="px-4 py-2">
                          <span className="font-medium">{r.label}</span>
                          {lots.length > 0 && <span className="block text-xs text-amber-700">Périme bientôt : {lots.map((l) => `lot ${l.number} (${qtyFmt(l.qty)}) le ${l.expiry}`).join(", ")}</span>}
                        </td>
                        <td className="px-2 text-right font-semibold">{qtyFmt(r.qty)} <span className="text-xs font-normal text-slate-500">{r.p.data.unit}</span></td>
                        <td className="px-2 text-right text-slate-500">{r.reserved ? qtyFmt(r.reserved) : "—"}</td>
                        <td className="px-2"><Badge tone={st === "rupture" ? "red" : st === "faible" ? "amber" : "green"}>{STOCK_STATE_LABELS[st]}</Badge></td>
                        <td className="whitespace-nowrap px-2 text-right">
                          <button className="rounded-lg px-2 py-1 text-xs text-[var(--brand)] hover:bg-slate-100" onClick={() => setMove({ type: "entree", row: r })}>+ Entrée</button>
                          <button className="rounded-lg px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" onClick={() => setMove({ type: "ajustement", row: r })}>Corriger</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
        </>
      )}
      {tab === "moves" && <Moves />}
      {tab === "inventory" && <Inventory onDone={() => setTab("state")} />}
      {move && <MoveModal type={move.type} row={move.row} onClose={() => setMove(null)} />}
    </div>
  );
}

function Kpi({ label, value, tone = "" }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Moves() {
  const c = useCtx();
  const [type, setType] = useState("");
  const [page, setPage] = useState(1);
  const name = (m: Move) => {
    const p = (c.data.product as Doc<Product>[]).find((x) => x.id === m.product_id);
    const v = p?.data.variants.find((x) => x.id === m.variant_id);
    return p ? (v ? `${p.data.name} — ${variantLabel(v)}` : p.data.name) : "Produit supprimé";
  };
  const rows = (c.data.move as Doc<Move>[]).filter((m) => !type || m.data.type === type).sort((a, b) => b.data.at.localeCompare(a.data.at));
  const pg = paginate(rows, page, 40);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <select className="input !w-auto" value={type} onChange={(e) => (setType(e.target.value), setPage(1))} aria-label="Type de mouvement">
          <option value="">Tous les mouvements</option>
          {Object.entries(MOVE_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button className="btn btn-ghost ml-auto !py-1.5 text-sm" disabled={!rows.length} onClick={() => downloadText("mouvements-stock.csv", toCsv([["date", "article", "type", "quantite", "stock_apres", "motif", "reference", "par"], ...rows.map((m) => [new Date(m.data.at).toLocaleString("fr-FR"), name(m.data), MOVE_TYPES[m.data.type], m.data.qty, m.data.after, m.data.reason, m.data.ref, c.memberName(m.data.by)])]))}><Download className="h-4 w-4" /> Exporter</button>
      </div>
      {rows.length === 0 ? <Empty icon={History} title="Aucun mouvement" /> : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm shadow-sm">
          {pg.rows.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2">
              <span className={`w-16 text-right font-semibold ${m.data.qty > 0 ? "text-emerald-700" : m.data.qty < 0 ? "text-red-600" : "text-slate-500"}`}>{m.data.qty > 0 ? "+" : ""}{qtyFmt(m.data.qty)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{name(m.data)}</span>
                <span className="block truncate text-xs text-slate-500">{MOVE_TYPES[m.data.type]}{m.data.ref ? ` · ${m.data.ref}` : ""}{m.data.reason && m.data.reason !== name(m.data) ? ` · ${m.data.reason}` : ""}{m.data.lot ? ` · lot ${m.data.lot}` : ""}</span>
              </span>
              <span className="text-right text-xs text-slate-500">{timeFmt(m.data.at)}<br />{c.memberName(m.data.by)} · reste {qtyFmt(m.data.after)}</span>
            </li>
          ))}
        </ul>
      )}
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
    </div>
  );
}

function MoveModal({ type: initial, row, onClose }: { type: "entree" | "sortie" | "perte" | "endommage" | "ajustement"; row?: Row; onClose: () => void }) {
  const c = useCtx();
  const [type, setType] = useState(initial);
  const [pid, setPid] = useState(row?.p.id ?? "");
  const [vid, setVid] = useState(row?.vid ?? "");
  const [f, setF] = useState({ qty: "", unit_cost: "", reason: "", lot: "", expiry: "" });
  const [key] = useState(() => opKey("mv"));
  const p = c.products.find((x) => x.id === pid);
  const lotted = p && !hasVariants(p.data) && p.data.track_expiry;
  const submit = async () => {
    const r = await c.run("stock.move", { product_id: pid, variant_id: vid || null, type, qty: f.qty.replace(",", "."), reason: f.reason, unit_cost: type === "entree" ? f.unit_cost : undefined, lot: type === "entree" && lotted ? { number: f.lot, expiry: f.expiry } : null, op_key: key });
    if (r) onClose();
  };
  return (
    <Modal title="Mouvement de stock" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Annuler</button><button className="btn btn-primary" disabled={!pid || !f.qty || (p && hasVariants(p.data) && !vid) || (type === "ajustement" && !f.reason)} onClick={submit}>Enregistrer</button></>}>
      <div className="space-y-3">
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="entree">Entrée de marchandises</option>
            <option value="sortie">Sortie (usage, cadeau…)</option>
            <option value="perte">Perte / vol</option>
            <option value="endommage">Produit endommagé</option>
            <option value="ajustement">Correction (nouvelle quantité exacte)</option>
          </select>
        </Field>
        <Field label="Produit">
          <select className="input" value={pid} onChange={(e) => (setPid(e.target.value), setVid(""))}>
            <option value="">Choisir…</option>
            {c.products.map((x) => <option key={x.id} value={x.id}>{x.data.name}</option>)}
          </select>
        </Field>
        {p && hasVariants(p.data) && (
          <Field label="Variante">
            <select className="input" value={vid} onChange={(e) => setVid(e.target.value)}>
              <option value="">Choisir…</option>
              {p.data.variants.map((v) => <option key={v.id} value={v.id}>{variantLabel(v)} (stock {qtyFmt(v.stock)})</option>)}
            </select>
          </Field>
        )}
        <Field label={type === "ajustement" ? `Quantité réelle comptée (${p?.data.unit ?? ""})` : `Quantité (${p?.data.unit ?? ""})`}><input className="input" inputMode="decimal" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value.replace(/[^\d.,]/g, "") })} /></Field>
        {type === "entree" && c.s.can.cost && <Field label="Prix d'achat unitaire (facultatif)" hint="Met à jour le prix d'achat du produit."><input className="input" inputMode="numeric" value={f.unit_cost} onChange={(e) => setF({ ...f, unit_cost: e.target.value.replace(/\D/g, "") })} /></Field>}
        {type === "entree" && lotted && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Numéro de lot"><input className="input" value={f.lot} onChange={(e) => setF({ ...f, lot: e.target.value })} /></Field>
            <Field label="Péremption"><input className="input" type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} /></Field>
          </div>
        )}
        <Field label={type === "ajustement" ? "Raison (obligatoire)" : "Motif (facultatif)"}><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} maxLength={200} /></Field>
      </div>
    </Modal>
  );
}

function Inventory({ onDone }: { onDone: () => void }) {
  const c = useCtx();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [q, setQ] = useState("");
  const [key] = useState(() => opKey("inv"));
  const items = c.products.flatMap((p) => (hasVariants(p.data) ? p.data.variants.map((v) => ({ k: `${p.id}:${v.id}`, pid: p.id, vid: v.id, label: `${p.data.name} — ${variantLabel(v)}`, qty: v.stock, unit: p.data.unit })) : [{ k: `${p.id}:`, pid: p.id, vid: null as string | null, label: p.data.name, qty: p.data.stock, unit: p.data.unit }]));
  const shown = items.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()));
  const filled = items.filter((i) => counts[i.k] !== undefined && counts[i.k] !== "");
  const diffs = filled.filter((i) => Number(counts[i.k]!.replace(",", ".")) !== i.qty);
  return (
    <Card title="Inventaire" subtitle="Comptez les articles en rayon et saisissez la quantité réelle. Seuls les articles saisis sont corrigés.">
      <SearchBox value={q} onChange={setQ} />
      <ul className="mt-3 max-h-[55vh] divide-y divide-slate-100 overflow-y-auto">
        {shown.map((i) => {
          const v = counts[i.k];
          const d = v !== undefined && v !== "" ? Number(v.replace(",", ".")) - i.qty : null;
          return (
            <li key={i.k} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1">{i.label} <span className="text-xs text-slate-500">(théorique {qtyFmt(i.qty)} {i.unit})</span></span>
              {d !== null && d !== 0 && <span className={`text-xs font-semibold ${d > 0 ? "text-emerald-700" : "text-red-600"}`}>{d > 0 ? "+" : ""}{qtyFmt(d)}</span>}
              <input className="input !w-24" inputMode="decimal" value={v ?? ""} onChange={(e) => setCounts({ ...counts, [i.k]: e.target.value.replace(/[^\d.,]/g, "") })} aria-label={`Quantité comptée de ${i.label}`} />
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <span className="text-sm text-slate-600">{filled.length} article(s) compté(s), {diffs.length} écart(s)</span>
        <button className="btn btn-primary ml-auto" disabled={!filled.length} onClick={async () => {
          if (await c.run("stock.inventory", { counts: filled.map((i) => ({ product_id: i.pid, variant_id: i.vid, counted: counts[i.k]!.replace(",", ".") })), note: "Inventaire", op_key: key })) onDone();
        }}>Valider l'inventaire</button>
      </div>
    </Card>
  );
}
