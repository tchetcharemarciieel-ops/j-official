import type { Entity, Field } from "./spec";

export type RecordData = Record<string, string | number | boolean | null>;

export type ValidationResult =
  | { ok: true; data: RecordData }
  | { ok: false; errors: Record<string, string> };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[0-9 ().-]{6,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function coerce(field: Field, raw: unknown): { value: RecordData[string]; error?: string } {
  const empty = raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "");
  if (empty) {
    if (field.type === "boolean") return { value: false };
    return field.required ? { value: null, error: "Champ obligatoire" } : { value: null };
  }
  switch (field.type) {
    case "text":
    case "longtext": {
      const s = String(raw).trim();
      const max = field.type === "text" ? 300 : 5000;
      if (s.length > max) return { value: null, error: `${max} caractères maximum` };
      return { value: s };
    }
    case "number":
    case "money": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(n)) return { value: null, error: "Nombre invalide" };
      if (field.type === "money" && n < 0) return { value: null, error: "Le montant doit être positif" };
      return { value: field.type === "money" ? Math.round(n) : n };
    }
    case "date": {
      const s = String(raw).slice(0, 10);
      if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) return { value: null, error: "Date invalide" };
      return { value: s };
    }
    case "boolean":
      return { value: raw === true || raw === "true" || raw === "on" || raw === "1" || raw === 1 };
    case "email": {
      const s = String(raw).trim().toLowerCase();
      return EMAIL_RE.test(s) ? { value: s } : { value: null, error: "E-mail invalide" };
    }
    case "phone": {
      const s = String(raw).trim();
      return PHONE_RE.test(s) ? { value: s } : { value: null, error: "Numéro invalide" };
    }
    case "select": {
      const s = String(raw);
      if (field.options && !field.options.includes(s)) return { value: null, error: "Choix non autorisé" };
      return { value: s };
    }
    case "relation": {
      const s = String(raw);
      if (!/^[0-9a-f-]{36}$/i.test(s)) return { value: null, error: "Référence invalide" };
      return { value: s };
    }
  }
}

/**
 * Valide et normalise un enregistrement selon la définition de la table.
 * Les clés inconnues sont ignorées (aucune donnée arbitraire n'est stockée).
 * `partial` : en mise à jour, seuls les champs fournis sont validés.
 */
export function validateRecord(entity: Entity, input: Record<string, unknown>, partial = false): ValidationResult {
  const data: RecordData = {};
  const errors: Record<string, string> = {};
  for (const field of entity.fields) {
    if (partial && !(field.key in input)) continue;
    const { value, error } = coerce(field, input[field.key]);
    if (error) errors[field.key] = error;
    else data[field.key] = value;
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, data };
}

export function formatValue(field: Field, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.type) {
    case "money":
      return `${Number(value).toLocaleString("fr-FR")} FCFA`;
    case "number":
      return Number(value).toLocaleString("fr-FR");
    case "boolean":
      return value ? "Oui" : "Non";
    case "date":
      return new Date(String(value) + "T00:00:00").toLocaleDateString("fr-FR");
    default:
      return String(value);
  }
}

export function toCsv(entity: Entity, rows: { data: RecordData }[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise les formules (injection CSV dans les tableurs)
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[";\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = entity.fields.map((f) => esc(f.label)).join(";");
  const lines = rows.map((r) => entity.fields.map((f) => esc(r.data[f.key])).join(";"));
  return [header, ...lines].join("\n");
}
