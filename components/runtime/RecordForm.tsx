"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Entity, Field } from "@/lib/spec";
import type { Rec } from "./useAppData";

export function RecordForm({
  entity,
  record,
  readonly,
  related,
  onSubmit,
  onClose,
}: {
  entity: Entity;
  record?: Rec;
  readonly: string[];
  related: Record<string, { id: string; label: string }[]>;
  onSubmit: (data: Record<string, unknown>) => Promise<Record<string, string> | void>;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const v: Record<string, unknown> = {};
    for (const f of entity.fields) v[f.key] = record?.data[f.key] ?? (f.type === "boolean" ? false : f.type === "date" && !record ? new Date().toISOString().slice(0, 10) : "");
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const first = dialog.current?.querySelector<HTMLElement>("input,select,textarea");
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Contrôle immédiat des champs obligatoires ; la validation complète est faite par le serveur.
    const local: Record<string, string> = {};
    for (const f of entity.fields) if (f.required && f.type !== "boolean" && !readonly.includes(f.key) && String(values[f.key] ?? "").trim() === "") local[f.key] = "Champ obligatoire";
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    const payload = Object.fromEntries(Object.entries(values).filter(([k]) => !readonly.includes(k)));
    const serverErrors = await onSubmit(payload).finally(() => setSaving(false));
    if (serverErrors) setErrors(serverErrors);
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="form-title" className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 text-slate-900 shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 id="form-title" className="text-lg font-semibold">
            {record ? "Modifier" : "Ajouter"} : {entity.label.toLowerCase()}
          </h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
          {entity.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={values[f.key]} error={errors[f.key]} disabled={readonly.includes(f.key)} options={related[f.relation ?? ""] ?? []} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          ))}
          <div className="sticky bottom-0 flex gap-2 bg-white pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-50">Annuler</button>
            <button disabled={saving} className="flex-1 rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-60" style={{ background: "var(--app-primary)" }}>
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldInput({ field, value, error, disabled, options, onChange }: { field: Field; value: unknown; error?: string; disabled: boolean; options: { id: string; label: string }[]; onChange: (v: unknown) => void }) {
  const id = `f-${field.key}`;
  const cls = `w-full rounded-xl border px-3 py-2.5 text-base text-slate-900 outline-none focus:ring-2 disabled:bg-slate-100 disabled:text-slate-500 ${error ? "border-red-400" : "border-slate-300"}`;
  const common = { id, disabled, "aria-invalid": Boolean(error), "aria-describedby": error ? `${id}-err` : undefined };
  const str = value === null || value === undefined ? "" : String(value);
  let input: React.ReactNode;
  switch (field.type) {
    case "longtext":
      input = <textarea {...common} rows={3} className={cls} value={str} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "number":
    case "money":
      input = <input {...common} type="number" inputMode="decimal" step={field.type === "money" ? 1 : "any"} min={field.type === "money" ? 0 : undefined} className={cls} value={str} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "date":
      input = <input {...common} type="date" className={cls} value={str} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "boolean":
      input = (
        <label className="flex items-center gap-3 text-slate-700">
          <input {...common} type="checkbox" className="h-5 w-5" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> Oui
        </label>
      );
      break;
    case "select":
      input = (
        <select {...common} className={cls} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
      break;
    case "relation":
      input = (
        <select {...common} className={cls} value={str} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case "email":
      input = <input {...common} type="email" autoComplete="email" className={cls} value={str} onChange={(e) => onChange(e.target.value)} />;
      break;
    case "phone":
      input = <input {...common} type="tel" inputMode="tel" autoComplete="tel" className={cls} value={str} onChange={(e) => onChange(e.target.value)} />;
      break;
    default:
      input = <input {...common} type="text" className={cls} value={str} onChange={(e) => onChange(e.target.value)} maxLength={300} />;
  }
  return (
    <div>
      {field.type !== "boolean" ? (
        <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-700">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
          {disabled && <span className="ml-2 text-xs font-normal text-slate-600">(non modifiable avec votre rôle)</span>}
        </label>
      ) : (
        <p className="mb-1 text-sm font-medium text-slate-700">{field.label}</p>
      )}
      {input}
      {error && <p id={`${id}-err`} className="mt-1 text-sm text-red-600">{error}</p>}
    </div>
  );
}
