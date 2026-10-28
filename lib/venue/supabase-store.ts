import "server-only";
import { createHash } from "node:crypto";
import { adminClient } from "../supabase/admin";
import { HttpError } from "../access";
import { COLLECTIONS, emptyData, entityKey, colFromEntity, type Col, type Doc, type VenueData } from "./model";
import type { VenueStore } from "./engine";

const COLS = "id,data,created_at,updated_at";

/** Identifiant stable d'un compteur : deux créations simultanées se heurtent à la clé primaire. */
function counterId(projectId: string, demo: boolean, key: string) {
  const h = createHash("sha256").update(`venue:${projectId}:${demo}:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Stockage du restaurant / de l'hôtel dans la table `records` existante (service_role, côté serveur uniquement).
 * Chaque écriture est tracée dans `record_history`, comme pour les autres modules.
 */
export class SupabaseStore implements VenueStore {
  private db = adminClient();
  constructor(
    private projectId: string,
    private demo: boolean,
    private actorId: string,
  ) {}

  private base(col: Col) {
    return this.db.from("records").select(COLS).eq("project_id", this.projectId).eq("is_demo", this.demo).eq("entity", entityKey(col));
  }

  private async history(col: Col, recordId: string, action: "create" | "update" | "delete", before: unknown, after: unknown) {
    if (col === "counter") return;
    await this.db.from("record_history").insert({ project_id: this.projectId, record_id: recordId, entity: entityKey(col), action, before: this.demo ? null : before, after: this.demo ? null : after, actor_id: this.actorId });
  }

  /** Toutes les données de l'établissement en une requête (les photos ne sont chargées qu'à la demande). */
  async all(): Promise<VenueData> {
    const out = emptyData();
    const entities = COLLECTIONS.filter((c) => c !== "photo" && c !== "counter").map(entityKey);
    const { data, error } = await this.db.from("records").select(`entity,${COLS}`).eq("project_id", this.projectId).eq("is_demo", this.demo).in("entity", entities).order("created_at", { ascending: false }).limit(20000);
    if (error) throw new HttpError(500, "Lecture des données de l'établissement impossible.");
    for (const r of data ?? []) {
      const col = colFromEntity(r.entity);
      if (col) out[col].push({ id: r.id, data: r.data, created_at: r.created_at, updated_at: r.updated_at });
    }
    return out;
  }

  async list(col: Col) {
    const { data, error } = await this.base(col).order("created_at", { ascending: false }).limit(20000);
    if (error) throw new HttpError(500, "Lecture impossible.");
    return (data ?? []) as Doc[];
  }
  async get(col: Col, id: string) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const { data } = await this.base(col).eq("id", id).maybeSingle();
    return (data as Doc | null) ?? null;
  }
  async insert(col: Col, data: object, id?: string) {
    const { data: row, error } = await this.db
      .from("records")
      .insert({ ...(id ? { id } : {}), project_id: this.projectId, entity: entityKey(col), data, is_demo: this.demo, created_by: this.actorId, updated_by: this.actorId })
      .select(COLS)
      .single();
    if (error || !row) throw new HttpError(500, "Enregistrement impossible.");
    await this.history(col, row.id, "create", null, data);
    return row as Doc;
  }
  async cas(col: Col, doc: Doc, data: object) {
    // Version strictement croissante : une ancienne version ne peut jamais correspondre à la nouvelle.
    const next = new Date(Math.max(Date.now(), Date.parse(doc.updated_at) + 1)).toISOString();
    const { data: row, error } = await this.db
      .from("records")
      .update({ data, updated_by: this.actorId, updated_at: next })
      .eq("id", doc.id)
      .eq("project_id", this.projectId)
      .eq("entity", entityKey(col))
      .eq("updated_at", doc.updated_at)
      .select(COLS)
      .maybeSingle();
    if (error) throw new HttpError(500, "Modification impossible.");
    if (!row) return null;
    await this.history(col, doc.id, "update", doc.data, data);
    return row as Doc;
  }
  async remove(col: Col, id: string) {
    const before = await this.get(col, id);
    await this.db.from("records").delete().eq("id", id).eq("project_id", this.projectId).eq("entity", entityKey(col));
    if (before) await this.history(col, id, "delete", before.data, null);
  }
  async nextSeq(key: string) {
    const cid = counterId(this.projectId, this.demo, key);
    for (let i = 0; i < 10; i++) {
      const cur = await this.get("counter", cid);
      if (!cur) {
        const { error } = await this.db.from("records").insert({ id: cid, project_id: this.projectId, entity: entityKey("counter"), data: { key, n: 1 }, is_demo: this.demo, created_by: this.actorId });
        if (!error) return 1;
        continue; // créé en même temps par une autre requête : on relit
      }
      const n = Number(cur.data.n) + 1;
      if (await this.cas("counter", cur, { key, n })) return n;
    }
    throw new HttpError(409, "Numérotation occupée, réessayez.");
  }

  /** Photos de l'établissement (chargées à la demande : elles sont lourdes). */
  async photos() {
    const { data } = await this.base("photo").order("created_at", { ascending: true }).limit(120);
    return (data ?? []) as Doc[];
  }
}
