"use client";

import { parseCsv } from "./csv";
import { MAX_IMPORT_ROWS, MAX_UPLOAD_BYTES } from "./config";

export type Tabular = { header: string[]; rows: string[][]; truncated: boolean };

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/**
 * Lit un fichier CSV ou Excel (.xlsx) dans le navigateur. Le fichier n'est jamais exécuté
 * ni envoyé tel quel au serveur : seules les cellules lues sont transmises après validation.
 */
export async function readTabular(file: File): Promise<Tabular> {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error(`Fichier trop volumineux (2 Mo maximum).`);
  const name = file.name.toLowerCase();
  let all: string[][];
  if (name.endsWith(".csv") || file.type === "text/csv") {
    all = parseCsv(await file.text());
  } else if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/universal");
    const data = await readSheet(file);
    all = (data as unknown[][]).map((r) => r.map(cellToString));
  } else {
    throw new Error("Format non pris en charge. Utilisez un fichier .csv ou .xlsx.");
  }
  if (all.length < 2) throw new Error("Le fichier doit contenir une ligne d'en-têtes et au moins une ligne de données.");
  const [header, ...rows] = all;
  return { header: header!.slice(0, 60).map((h) => h.slice(0, 80)), rows: rows.slice(0, MAX_IMPORT_ROWS).map((r) => r.slice(0, 60).map((c) => c.slice(0, 5000))), truncated: rows.length > MAX_IMPORT_ROWS };
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

export async function readImage(file: File): Promise<{ mediaType: (typeof IMAGE_TYPES)[number]; data: string; preview: string }> {
  if (!IMAGE_TYPES.includes(file.type as (typeof IMAGE_TYPES)[number])) throw new Error("Image non prise en charge (JPEG, PNG, WebP ou GIF).");
  if (file.size > 3.5 * 1024 * 1024) throw new Error("Image trop volumineuse (3,5 Mo maximum).");
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const data = btoa(bin);
  return { mediaType: file.type as (typeof IMAGE_TYPES)[number], data, preview: `data:${file.type};base64,${data}` };
}
