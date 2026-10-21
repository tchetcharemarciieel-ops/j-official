/** Lecture CSV côté navigateur (séparateur ; ou , détecté automatiquement). Rien n'est exécuté. */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export type ColumnInfo = { name: string; type: "text" | "number" | "money" | "date" | "email" | "phone" | "boolean"; samples: string[]; empty: number; issues: number };

const FR_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

export function normalizeDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(FR_DATE);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

/** Détecte le type probable de chaque colonne et compte les valeurs incohérentes. */
export function detectColumns(header: string[], rows: string[][]): ColumnInfo[] {
  return header.map((name, idx) => {
    const values = rows.map((r) => (r[idx] ?? "").trim());
    const filled = values.filter(Boolean);
    const share = (re: (v: string) => boolean) => (filled.length ? filled.filter(re).length / filled.length : 0);
    const isNum = (v: string) => /^-?[\d\s]+([.,]\d+)?$/.test(v);
    const n = name.toLowerCase();
    let type: ColumnInfo["type"] = "text";
    if (share((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) > 0.8) type = "email";
    else if (share((v) => normalizeDate(v) !== null) > 0.8) type = "date";
    else if (share((v) => /^\+?[\d ().-]{8,20}$/.test(v)) > 0.8 && /t[ée]l|phone|portable|contact/.test(n)) type = "phone";
    else if (share(isNum) > 0.8) type = /prix|montant|total|co[uû]t|salaire|loyer|fcfa|xaf|tarif/.test(n) ? "money" : "number";
    else if (share((v) => /^(oui|non|vrai|faux|true|false|yes|no)$/i.test(v)) > 0.9) type = "boolean";
    const ok = (v: string) =>
      type === "number" || type === "money" ? isNum(v) : type === "date" ? normalizeDate(v) !== null : type === "email" ? /@/.test(v) : true;
    return { name: name.trim() || `Colonne ${idx + 1}`, type, samples: filled.slice(0, 3), empty: values.length - filled.length, issues: filled.filter((v) => !ok(v)).length };
  });
}

/** Prépare une valeur brute pour la validation serveur selon le type cible. */
export function prepareValue(type: string, v: string): string {
  const s = (v ?? "").trim();
  if (type === "date") return normalizeDate(s) ?? s;
  if (type === "number" || type === "money") return s.replace(/\s/g, "").replace(",", ".");
  if (type === "boolean") return /^(oui|vrai|true|yes|1)$/i.test(s) ? "true" : "false";
  return s;
}
