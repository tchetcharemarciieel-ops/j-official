"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/fetcher";
import type { RecordData } from "@/lib/records";

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

/**
 * Données d'un mini-logiciel. En mode publié, une nouvelle fiche saisie hors ligne est
 * gardée temporairement sur l'appareil puis envoyée au retour du réseau (envoi idempotent).
 * Aucune donnée existante n'est mise en cache sur l'appareil.
 */
export function useAppData(projectId: string, mode: "demo" | "live") {
  const [records, setRecords] = useState<Record<string, Rec[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const flushing = useRef(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await api<{ records: Record<string, Rec[]> }>(`/api/apps/${projectId}/records?mode=${mode}`);
      setRecords(res.records);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [projectId, mode]);

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

  const create = useCallback(
    async (entity: string, data: Record<string, unknown>) => {
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
    [projectId, mode],
  );

  const update = useCallback(
    async (rec: Rec, data: Record<string, unknown>) => {
      if (!navigator.onLine) throw new ApiError("Modification impossible hors ligne : reconnectez-vous.", 0, {});
      const res = await api<{ record: Rec }>(`/api/apps/${projectId}/records/${rec.id}`, { method: "PATCH", body: { mode, data, expectedUpdatedAt: rec.updated_at } });
      setRecords((r) => ({ ...r, [rec.entity]: (r[rec.entity] ?? []).map((x) => (x.id === rec.id ? res.record : x)) }));
      return res.record;
    },
    [projectId, mode],
  );

  const remove = useCallback(
    async (rec: Rec) => {
      if (!navigator.onLine) throw new ApiError("Suppression impossible hors ligne.", 0, {});
      await api(`/api/apps/${projectId}/records/${rec.id}?mode=${mode}`, { method: "DELETE" });
      setRecords((r) => ({ ...r, [rec.entity]: (r[rec.entity] ?? []).filter((x) => x.id !== rec.id) }));
    },
    [projectId, mode],
  );

  return { records, loading, error, online, pending, reload: load, create, update, remove };
}
