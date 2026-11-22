"use client";

import { Download, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AGENCY_TYPES, SECTOR_MODULES, enabledSectorKeys, fieldText, type Doc, type ModuleDef, type SectorRecord } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Badge, DeleteButton, Empty, FieldsForm, Modal, Pager, SearchBox, Tabs, downloadText, paginate, toCsv } from "../ui";

/** Modules du métier (immobilier, communication, cabinet, commercial, bureau classique) : fiches définies par le type d'agence. */
export function Sector() {
  const c = useCtx();
  const keys = enabledSectorKeys(c.settings);
  const [mod, setMod] = useState(keys[0] ?? "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [edit, setEdit] = useState<Doc<SectorRecord> | "new" | null>(null);
  const def: ModuleDef | undefined = SECTOR_MODULES[keys.includes(mod) ? mod : keys[0] ?? ""];
  const canEdit = c.may("metier");
  const rows = useMemo(() => {
    if (!def) return [];
    const n = q.trim().toLowerCase();
    return (c.data.record as Doc<SectorRecord>[]).filter((r) => r.data.mod === def.key && (!n || def.fields.some((f) => fieldText(f, r.data.data[f.key], c.lookup).toLowerCase().includes(n)))).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [c.data.record, def, q, c.lookup]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def) return <Empty icon={Plus} title="Aucun module du métier activé" text="Activez-les dans Réglages > Modules." />;
  const cols = def.fields.filter((f) => f.list).slice(0, 4);
  const shown = cols.length ? cols : def.fields.slice(0, 3);
  const pg = paginate(rows, page, 25);
  const statusKey = def.status;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{AGENCY_TYPES[c.settings.agency_type].icon} {AGENCY_TYPES[c.settings.agency_type].label}</p>
      <Tabs value={def.key} onChange={(k) => (setMod(k), setPage(1), setQ(""))} items={keys.map((k) => [k, `${SECTOR_MODULES[k]!.icon} ${SECTOR_MODULES[k]!.label}`] as [string, string])} />
      <p className="text-xs text-slate-500">{def.description}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[12rem] flex-1"><SearchBox value={q} onChange={(v) => (setQ(v), setPage(1))} /></div>
        {canEdit && <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus className="h-4 w-4" /> {def.singular}</button>}
        <button className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadText(`${def.key}.csv`, toCsv([def.fields.map((f) => f.label), ...rows.map((r) => def.fields.map((f) => fieldText(f, r.data.data[f.key], c.lookup)))]))}><Download className="h-4 w-4" /> Exporter</button>
      </div>
      {rows.length === 0 ? <Empty icon={Plus} title={`Aucune fiche « ${def.singular.toLowerCase()} »`} action={canEdit ? <button className="btn btn-primary" onClick={() => setEdit("new")}>Ajouter</button> : undefined} /> : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500"><tr>{shown.map((f) => <th key={f.key} className="px-3 py-2">{f.label}</th>)}</tr></thead>
            <tbody>{pg.rows.map((r) => (
              <tr key={r.id} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50" onClick={() => setEdit(r)}>
                {shown.map((f) => { const t = fieldText(f, r.data.data[f.key], c.lookup); return <td key={f.key} className="max-w-[16rem] truncate px-3 py-2">{f.key === statusKey && t ? <Badge>{t}</Badge> : t || "—"}</td>; })}
              </tr>))}</tbody>
          </table>
        </div>
      )}
      <Pager page={pg.page} pages={pg.pages} onPage={setPage} />
      {edit && <RecordForm def={def} rec={edit === "new" ? null : edit} canEdit={canEdit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function RecordForm({ def, rec, canEdit, onClose }: { def: ModuleDef; rec: Doc<SectorRecord> | null; canEdit: boolean; onClose: () => void }) {
  const c = useCtx();
  const [v, setV] = useState<Record<string, unknown>>({ ...(rec?.data.data ?? {}) });
  const relOptions = (rel: string): [string, string][] => {
    if (rel === "client") return (c.data.client as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
    if (rel === "employee") return (c.data.employee as Doc<{ name: string }>[]).map((x) => [x.id, x.data.name]);
    return (c.data.record as Doc<SectorRecord>[]).filter((r) => r.data.mod === rel).map((r) => [r.id, c.lookup(rel, r.id)]);
  };
  const missing = def.fields.filter((f) => f.required && (v[f.key] === undefined || v[f.key] === "" || v[f.key] === null)).map((f) => f.label);
  return (
    <Modal wide title={`${rec ? "" : "Nouveau — "}${def.singular}`} onClose={onClose} footer={canEdit ? (
      <>
        {rec && <DeleteButton confirmText="Supprimer cette fiche ?" onConfirm={async () => (await c.run("record.delete", { id: rec.id })) && onClose()} />}
        <button className="btn btn-primary" disabled={missing.length > 0} title={missing.length ? `À remplir : ${missing.join(", ")}` : undefined} onClick={async () => (await c.run("record.save", { id: rec?.id, mod: def.key, data: v })) && onClose()}>Enregistrer</button>
      </>
    ) : <button className="btn btn-ghost" onClick={onClose}>Fermer</button>}>
      <fieldset disabled={!canEdit}><FieldsForm fields={def.fields} values={v} onChange={setV} relOptions={relOptions} /></fieldset>
    </Modal>
  );
}
