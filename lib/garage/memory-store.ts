import { COLLECTIONS, emptyData, type Col, type Doc, type GarageData } from "./model";
import type { GarageStore } from "./engine";

/**
 * Stockage en mémoire : tests automatiques et démo publique sans compte (données gardées
 * dans le navigateur). Même contrat que le stockage serveur, y compris le contrôle de version.
 */
export class MemoryStore implements GarageStore {
  private last = 0;
  constructor(
    public data: GarageData = emptyData(),
    private onChange?: (d: GarageData) => void,
  ) {
    for (const c of COLLECTIONS) this.data[c] ??= [];
  }

  private stamp() {
    this.last = Math.max(Date.now(), this.last + 1);
    return new Date(this.last).toISOString();
  }
  private changed() {
    this.onChange?.(this.data);
  }

  async list(col: Col) {
    return this.data[col].map((d) => structuredClone(d));
  }
  async get(col: Col, id: string) {
    const d = this.data[col].find((x) => x.id === id);
    return d ? structuredClone(d) : null;
  }
  async insert(col: Col, data: object, id?: string) {
    const docId = id ?? crypto.randomUUID();
    if (this.data[col].some((x) => x.id === docId)) throw new Error("Identifiant déjà utilisé.");
    const at = this.stamp();
    const doc: Doc = { id: docId, data: structuredClone(data) as Record<string, unknown>, created_at: at, updated_at: at };
    this.data[col] = [doc, ...this.data[col]];
    this.changed();
    return structuredClone(doc);
  }
  async cas(col: Col, doc: Doc, data: object) {
    const cur = this.data[col].find((x) => x.id === doc.id);
    if (!cur || cur.updated_at !== doc.updated_at) return null;
    cur.data = structuredClone(data) as Record<string, unknown>;
    cur.updated_at = this.stamp();
    this.changed();
    return structuredClone(cur);
  }
  async remove(col: Col, id: string) {
    this.data[col] = this.data[col].filter((x) => x.id !== id);
    this.changed();
  }
  async nextSeq(key: string) {
    const c = this.data.counter.find((x) => x.data.key === key);
    if (c) {
      c.data = { ...c.data, n: Number(c.data.n) + 1 };
      c.updated_at = this.stamp();
      this.changed();
      return Number(c.data.n);
    }
    await this.insert("counter", { key, n: 1 });
    return 1;
  }
}
