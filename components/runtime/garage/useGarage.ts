"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/fetcher";
import { runOp, type OpResult } from "@/lib/garage/engine";
import { MemoryStore } from "@/lib/garage/memory-store";
import { COLLECTIONS, emptyData, type Doc, type GarageData, type GarageRole } from "@/lib/garage/model";
import type { Role } from "@/lib/spec";
import type { DataMode } from "../useAppData";

export type Member = { id: string; name: string; role: Role };
export type GarageState = { data: GarageData; members: Member[]; role: GarageRole; me: string };

const LOCAL_ID = "00000000-0000-4000-8000-000000000001";
const localKey = (projectId: string) => `msgarage:${projectId}`;

function readLocal(projectId: string): GarageData {
  try {
    const raw = localStorage.getItem(localKey(projectId));
    const parsed = raw ? (JSON.parse(raw) as GarageData) : emptyData();
    for (const c of COLLECTIONS) parsed[c] ??= [];
    return parsed;
  } catch {
    return emptyData();
  }
}

/**
 * Données et opérations du garage.
 * - live / demo : API serveur (rôle revérifié à chaque opération, données en base).
 * - local (démo publique sans compte) : même moteur exécuté dans le navigateur, sur des
 *   données vides au départ et gardées sur cet appareil. Aucune fiche fictive n'est créée.
 */
export function useGarage(projectId: string, mode: DataMode, role: Role, enabled = true) {
  const [state, setState] = useState<GarageState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mem = useRef<MemoryStore | null>(null);
  const local = mode === "local";

  const load = useCallback(async () => {
    if (!enabled) return;
    setError("");
    if (local) {
      mem.current ??= new MemoryStore(readLocal(projectId), (d) => {
        try {
          localStorage.setItem(localKey(projectId), JSON.stringify(d));
        } catch {
          /* stockage plein ou indisponible : la démo continue en mémoire */
        }
      });
      setState({ data: structuredClone(mem.current.data), members: [{ id: LOCAL_ID, name: "Vous (démo)", role: "owner" }], role: "owner", me: LOCAL_ID });
      setLoading(false);
      return;
    }
    try {
      const r = await api<GarageState>(`/api/apps/${projectId}/garage?mode=${mode}`);
      setState(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [projectId, mode, local, enabled]);

  useEffect(() => {
    void load();
  }, [load]);

  // Données partagées par toute l'équipe : actualisation régulière tant que la page est visible.
  useEffect(() => {
    if (local || !enabled) return;
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 20_000);
    return () => clearInterval(t);
  }, [local, enabled, load]);

  const run = useCallback(
    async (op: string, input: unknown): Promise<OpResult> => {
      if (local) {
        const res = await runOp({ store: mem.current!, actor: { id: LOCAL_ID, role: role === "viewer" ? "viewer" : "owner" }, members: [LOCAL_ID] }, op, input);
        setState((s) => (s ? { ...s, data: structuredClone(mem.current!.data) } : s));
        return res;
      }
      if (!navigator.onLine) throw new ApiError("Hors ligne : cette opération nécessite Internet.", 0, {});
      const res = await api<OpResult>(`/api/apps/${projectId}/garage`, { body: { mode, op, input } });
      await load();
      return res;
    },
    [local, projectId, mode, role, load],
  );

  const photos = useCallback(
    async (jobId: string): Promise<Doc[]> => {
      if (local) return (mem.current?.data.photo ?? []).filter((p) => p.data.job_id === jobId);
      const r = await api<{ photos: Doc[] }>(`/api/apps/${projectId}/garage?mode=${mode}&photos=${encodeURIComponent(jobId)}`);
      return r.photos;
    },
    [local, projectId, mode],
  );

  return { state, loading, error, reload: load, run, photos };
}

export type GarageApi = ReturnType<typeof useGarage>;
