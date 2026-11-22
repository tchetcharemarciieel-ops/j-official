"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import type { FieldDef } from "@/lib/bureau/model";
import { useCtx } from "./context";
import { Badge, Field } from "@/components/shop/ui";

export { Badge, Card, Empty, Field, Modal, Pager, SearchBox, Stat, Tabs, paginate, downloadText, toCsv, dateFmt, timeFmt } from "@/components/shop/ui";

export const uid = () => crypto.randomUUID();
export const dtLocal = (iso: string) => iso.slice(0, 16);
export const hhmm = (iso: string) => iso.slice(11, 16);
export const fmtDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
export const fmtDate = (d: string | null | undefined) => (d ? new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—");

type Tone = "slate" | "green" | "amber" | "red" | "blue" | "violet";
export const TONES: Record<string, Tone> = {
  // projets, tâches, clients, contrats, rendez-vous, factures
  planifie: "slate", en_cours: "blue", termine: "green", suspendu: "amber", annule: "red", a_faire: "slate", prospect: "amber", actif: "green", inactif: "slate", archive: "slate", brouillon: "slate", envoye: "blue", envoyee: "blue", accepte: "green", refuse: "red", expire: "red", resilie: "red", prevu: "blue", confirme: "green", partielle: "amber", payee: "green", en_retard: "red", annulee: "red",
};
export const StatusBadge = ({ k, label }: { k: string; label: string }) => <Badge tone={TONES[k] ?? "slate"}>{label}</Badge>;

/** Sélecteur d'un client, d'un employé ou d'un membre de l'équipe. */
export function Pick({ label, value, onChange, options, empty = "—", required }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][]; empty?: string; required?: boolean }) {
  return (
    <Field label={label}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value)} required={required}>
        {!required && <option value="">{empty}</option>}
        {required && !value && <option value="">Choisir…</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Field>
  );
}

/** Choix de plusieurs membres de l'équipe (cases à cocher). */
export function MultiPick({ label, value, onChange, options }: { label: string; value: string[]; onChange: (v: string[]) => void; options: [string, string][] }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => {
          const on = value.includes(v);
          return <button type="button" key={v} onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])} className={`rounded-full border px-3 py-1 text-sm ${on ? "border-[var(--brand)] bg-[var(--brand)] text-white" : "border-slate-300"}`}>{l}</button>;
        })}
        {!options.length && <span className="text-sm text-slate-500">Aucun membre.</span>}
      </div>
    </div>
  );
}

export function DeleteButton({ label = "Supprimer", confirmText, onConfirm }: { label?: string; confirmText: string; onConfirm: () => void | Promise<unknown> }) {
  return <button type="button" className="btn btn-danger" onClick={() => confirm(confirmText) && void onConfirm()}><Trash2 className="h-4 w-4" /> {label}</button>;
}

/** Formulaire généré à partir de la définition des champs d'un module du métier. */
export function FieldsForm({ fields, values, onChange, relOptions }: { fields: FieldDef[]; values: Record<string, unknown>; onChange: (v: Record<string, unknown>) => void; relOptions: (rel: string) => [string, string][] }) {
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => {
        const v = values[f.key];
        const wide = f.type === "longtext";
        const lab = `${f.label}${f.required ? " *" : ""}`;
        return (
          <div key={f.key} className={wide ? "sm:col-span-2" : ""}>
            {f.type === "select" ? (
              <Field label={lab}><select className="input" value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option>{f.options?.map((o) => <option key={o}>{o}</option>)}</select></Field>
            ) : f.type === "relation" ? (
              <Field label={lab}><select className="input" value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)}><option value="">—</option>{relOptions(f.rel!).map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></Field>
            ) : f.type === "longtext" ? (
              <Field label={lab}><textarea className="input" rows={3} value={String(v ?? "")} onChange={(e) => set(f.key, e.target.value)} maxLength={4000} /></Field>
            ) : f.type === "boolean" ? (
              <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" checked={Boolean(v)} onChange={(e) => set(f.key, e.target.checked)} /> {f.label}</label>
            ) : (
              <Field label={lab}><input className="input" type={f.type === "date" ? "date" : f.type === "email" ? "email" : "text"} inputMode={f.type === "number" || f.type === "money" ? "decimal" : f.type === "phone" ? "tel" : undefined} value={String(v ?? "")} onChange={(e) => set(f.key, f.type === "number" || f.type === "money" ? e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") : e.target.value)} maxLength={200} /></Field>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Barres doubles (recettes / dépenses) en SVG : valeurs réelles uniquement. */
export function DualBars({ data }: { data: { label: string; a: number; b: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const w = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="Recettes et dépenses par mois">
        {data.map((d, i) => {
          const ha = (d.a / max) * 54;
          const hb = (d.b / max) * 54;
          return (
            <g key={i}>
              <rect x={i * w + w * 0.12} y={58 - ha} width={w * 0.36} height={Math.max(ha, d.a > 0 ? 0.8 : 0)} rx={0.7} fill="#16a34a" opacity={0.85}><title>{`${d.label} : recettes ${d.a}`}</title></rect>
              <rect x={i * w + w * 0.52} y={58 - hb} width={w * 0.36} height={Math.max(hb, d.b > 0 ? 0.8 : 0)} rx={0.7} fill="#ef4444" opacity={0.85}><title>{`${d.label} : dépenses ${d.b}`}</title></rect>
            </g>
          );
        })}
        <line x1="0" x2="100" y1="58.2" y2="58.2" stroke="#cbd5e1" strokeWidth="0.4" />
      </svg>
      <div className="mt-1 flex text-[10px] text-slate-500">{data.map((d, i) => <span key={i} style={{ width: `${w}%` }} className="truncate text-center">{d.label}</span>)}</div>
      <p className="mt-2 flex gap-4 text-xs text-slate-500"><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-green-600" />Recettes</span><span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-red-500" />Dépenses</span></p>
    </div>
  );
}

/** Zone de dépôt : lit un fichier (≤ 380 Ko) et renvoie son contenu base64. */
export function useFilePick() {
  const c = useCtx();
  const [busy, setBusy] = useState(false);
  const pick = async (file: File): Promise<{ name: string; mime: string; data: string } | null> => {
    if (file.size > 380_000) {
      c.notify("error", "Fichier trop lourd (380 Ko maximum). Compressez-le ou réduisez la taille de l'image.");
      return null;
    }
    setBusy(true);
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { name: file.name, mime: file.type || "application/octet-stream", data: btoa(bin) };
    } finally {
      setBusy(false);
    }
  };
  return { pick, busy };
}
