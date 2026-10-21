"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/fetcher";
import { validateRecord, type RecordData } from "@/lib/records";
import { sampleRecord } from "@/lib/checks";
import type { AppSpec } from "@/lib/spec";

export type Rec = { id: string; entity: string; data: RecordData; created_at: string; updated_at: string; pending?: boolean };
type Queued = { clientId: string; entity: string; data: Record<string, unknown>; queuedAt: string };

const queueKey = (projectId: string) => `msq:${projectId}`;

function readQueue(projectId: string): Queued[] {
  try {
    return JSON.parse(localStorage.getItem(queueKey(projectId)) || "[]") as Queued[];
  } catch {
    return [];
  }
}
function writeQueue(projectId: string, q: Queued[]) {
  try {
    if (q.length) localStorage.setItem(queueKey(projectId), JSON.stringify(q));
    else localStorage.removeItem(queueKey(projectId));
  } catch {
    /* stockage indisponible */
  }
}

export type DataMode = "demo" | "live" | "local";

const localKey = (projectId: string) => `msdemo:${projectId}`;

/** Données d'exemple pour la démo publique (liens entre tables respectés). */
export function seedLocal(spec: AppSpec): Record<string, Rec[]> {
  const out: Record<string, Rec[]> = {};
  const ordered = [...spec.entities].sort((a, b) => Number(a.fields.some((f) => f.type === "relation")) - Number(b.fields.some((f) => f.type === "relation")));
  for (const e of ordered) {
    out[e.key] = Array.from({ length: 6 }, (_, i) => {
      const data = sampleRecord(e, i);
      for (const f of e.fields) if (f.type === "relation" && f.relation && out[f.relation]?.length) data[f.key] = out[f.relation]![i % out[f.relation]!.length]!.id;
      const at = new Date(Date.now() - i * 9 * 86400000).toISOString();
      return { id: crypto.randomUUID(), entity: e.key, data, created_at: at, updated_at: at };
    });
  }
  return out;
}

function readLocal(projectId: string): Record<string, Rec[]> | null {
  try {
    const raw = localStorage.getItem(localKey(projectId));
    return raw ? (JSON.parse(raw) as Record<string, Rec[]>) : null;
  } catch {
    return null;
  }
}
function writeLocal(projectId: string, records: Record<string, Rec[]>) {
  try {
    localStorage.setItem(localKey(projectId), JSON.stringify(records));
  } catch {
    /* stockage indisponible : la démo fonctionne en mémoire */
  }
}

/**
 * Données d'un mini-logiciel. En mode « local » (démo publique sans compte), tout reste
 * dans le navigateur avec la même validation que le serveur. En mode publié, une nouvelle fiche saisie hors ligne est
 * gardée temporairement sur l'appareil puis envoyée au retour du réseau (envoi idempotent).
 * Aucune donnée existante n'est mise en cache sur l'appareil.
 */
export function useAppData(projectId: string, mode: DataMode, spec?: AppSpec) {
  const [records, setRecords] = useState<Record<string, Rec[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);

  const local = mode === "local";

  const load = useCallback(async () => {
    setError("");
    if (local) {
      const stored = readLocal(projectId);
      const keys = new Set((spec?.entities ?? []).map((e) => e.key));
      const next = stored ?? (spec ? seedLocal(spec) : {});
      for (const k of keys) next[k] ??= [];
      setRecords(next);
      if (!stored) writeLocal(projectId, next);
      setLoading(false);
      return;
    }
    try {
      const res = await api<{ records: Record<string, Rec[]> }>(`/api/apps/${projectId}/records?mode=${mode}`);
      setRecords(res.records);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [projectId, mode, local, spec]);

  const flush = useCallback(async () => {
    if (mode !== "live" || flushing.current || !navigator.onLine) return;
    flushing.current = true;
    try {
      let q = readQueue(projectId);
      for (const item of [...q]) {
        try {
          await api(`/api/apps/${projectId}/records`, { body: { mode, entity: item.entity, data: item.data, clientId: item.clientId } });
          q = q.filter((x) => x.clientId !== item.clientId);
        } catch (e) {
          // Erreur de validation : la fiche est retirée de la file pour ne pas bloquer les suivantes.
          if (e instanceof ApiError && e.status >= 400 && e.status < 500) q = q.filter((x) => x.clientId !== item.clientId);
          else break;
        }
        writeQueue(projectId, q);
      }
      setPending(q.length);
      await load();
    } finally {
      flushing.current = false;
    }
  }, [projectId, mode, load]);

  useEffect(() => {
    void load();
    setOnline(navigator.onLine);
    setPending(readQueue(projectId).length);
    const up = () => {
      setOnline(true);
      void flush();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    void flush();
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, [load, flush, projectId]);

  const localWrite = useCallback(
    (fn: (r: Record<string, Rec[]>) => Record<string, Rec[]>) =>
      setRecords((r) => {
        const next = fn(r);
        writeLocal(projectId, next);
        return next;
      }),
    [projectId],
  );

  const localValidate = useCallback(
    (entityKey: string, data: Record<string, unknown>, partial: boolean) => {
      const entity = spec?.entities.find((e) => e.key === entityKey);
      if (!entity) throw new ApiError("Table introuvable.", 404, {});
      const v = validateRecord(entity, data, partial);
      if (!v.ok) throw new ApiError("Certains champs sont invalides.", 422, { fieldErrors: v.errors });
      return v.data;
    },
    [spec],
  );

  const create = useCallback(
    async (entity: string, data: Record<string, unknown>) => {
      if (local) {
        const clean = localValidate(entity, data, false);
        const at = new Date().toISOString();
        const record: Rec = { id: crypto.randomUUID(), entity, data: clean, created_at: at, updated_at: at };
        localWrite((r) => ({ ...r, [entity]: [record, ...(r[entity] ?? [])] }));
        return { queued: false as const, record };
      }
      if (mode === "live" && !navigator.onLine) {
        const item: Queued = { clientId: crypto.randomUUID(), entity, data, queuedAt: new Date().toISOString() };
        const q = [...readQueue(projectId), item];
        writeQueue(projectId, q);
        setPending(q.length);
        setRecords((r) => ({ ...r, [entity]: [{ id: item.clientId, entity, data: data as RecordData, created_at: item.queuedAt, updated_at: item.queuedAt, pending: true }, ...(r[entity] ?? [])] }));
        return { queued: true as const };
      }
      const res = await api<{ record: Rec }>(`/api/apps/${projectId}/records`, { body: { mode, entity, data } });
      setRecords((r) => ({ ...r, [entity]: [res.record, ...(r[entity] ?? [])] }));
      return { queued: false as const, record: res.record };
    },
    [projectId, mode, local, localValidate, localWrite],
  );

  const update = useCallback(
    async (rec: Rec, data: Record<string, unknown>) => {
      if (local) {
        const clean = localValidate(rec.entity, data, true);
        const record: Rec = { ...rec, data: { ...rec.data, ...clean }, updated_at: new Date().toISOString() };
        localWrite((r) => ({ ...r, [rec.entity]: (r[rec.entity] ?? []).map((x) => (x.id === rec.id ? record : x)) }));
        return record;
      }
      if (!navigator.onLine) throw new ApiError("Modification impossible hors ligne : reconnectez-vous.", 0, {});
      const res = await api<{ record: Rec }>(`/api/apps/${projectId}/records/${rec.id}`, { method: "PATCH", body: { mode, data, expectedUpdatedAt: rec.updated_at } });
      setRecords((r) => ({ ...r, [rec.entity]: (r[rec.entity] ?? []).map((x) => (x.id === rec.id ? res.record : x)) }));
      return res.record;
    },
    [projectId, mode, local, localValidate, localWrite],
  );

  const remove = useCallback(
    async (rec: Rec) => {
      if (local) {
        localWrite((r) => ({ ...r, [rec.entity]: (r[rec.entity] ?? []).filter((x) => x.id !== rec.id) }));
        return;
      }
      if (!navigator.onLine) throw new ApiError("Suppression impossible hors ligne.", 0, {});
      await api(`/api/apps/${projectId}/records/${rec.id}?mode=${mode}`, { method: "DELETE" });
      setRecords((r) => ({ ...r, [rec.entity]: (r[rec.entity] ?? []).filter((x) => x.id !== rec.id) }));
    },
    [projectId, mode, local, localWrite],
  );

  const reset = useCallback(() => {
    if (!local || !spec) return;
    const next = seedLocal(spec);
    writeLocal(projectId, next);
    setRecords(next);
  }, [local, spec, projectId]);

  return { records, loading, error, online, pending, reload: load, create, update, remove, reset };
}
