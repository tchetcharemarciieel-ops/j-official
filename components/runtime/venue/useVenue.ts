"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/fetcher";
import { runOp, type OpResult } from "@/lib/venue/engine";
import { MemoryStore } from "@/lib/venue/memory-store";
import { COLLECTIONS, defaultSettings, emptyData, type Doc, type Settings, type VenueData, type VenueKind, type VenueRole } from "@/lib/venue/model";
import type { Role } from "@/lib/spec";
import type { DataMode } from "../useAppData";

export type Member = { id: string; name: string; role: Role };
export type VenueState = { data: VenueData; members: Member[]; role: VenueRole; me: string; kind: VenueKind };

const LOCAL_ID = "00000000-0000-4000-8000-000000000001";
const localKey = (projectId: string) => `msvenue:${projectId}`;

function readLocal(projectId: string): VenueData {
  try {
    const raw = localStorage.getItem(localKey(projectId));
    const parsed = raw ? (JSON.parse(raw) as VenueData) : emptyData();
    for (const c of COLLECTIONS) parsed[c] ??= [];
    return parsed;
  } catch {
    return emptyData();
  }
}

/** Paramètres du questionnaire (valeurs par défaut tant qu'il n'a pas été rempli). */
export function venueSettings(s: VenueState | null, kind: VenueKind): Settings {
  const d = s?.data.settings[0] as Doc<Settings> | undefined;
  return { ...defaultSettings(kind), ...(d?.data ?? {}), kind };
}

/**
 * Données et opérations du restaurant ou de l'hôtel (même fonctionnement que le garage) :
 * API serveur en ligne, moteur identique exécuté dans le navigateur pour la démo sans compte.
 */
export function useVenue(projectId: string, mode: DataMode, role: Role, kind: VenueKind | null) {
  const [state, setState] = useState<VenueState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const mem = useRef<MemoryStore | null>(null);
  const local = mode === "local";
  const enabled = kind !== null;

  const load = useCallback(async () => {
    if (!kind) return;
    setError("");
    if (local) {
      mem.current ??= new MemoryStore(readLocal(projectId), (d) => {
        try {
          localStorage.setItem(localKey(projectId), JSON.stringify(d));
        } catch {
          /* stockage plein ou indisponible : la démo continue en mémoire */
        }
      });
      setState({ data: structuredClone(mem.current.data), members: [{ id: LOCAL_ID, name: "Vous (démo)", role: "owner" }], role: "owner", me: LOCAL_ID, kind });
      setLoading(false);
      return;
    }
    try {
      setState(await api<VenueState>(`/api/apps/${projectId}/venue?mode=${mode}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, [projectId, mode, local, kind]);

  useEffect(() => {
    void load();
  }, [load]);

  // Données partagées par l'équipe (commandes, cuisine) : actualisation fréquente tant que la page est visible.
  const [fast, setFast] = useState(false);
  useEffect(() => {
    if (local || !enabled) return;
    const t = setInterval(() => document.visibilityState === "visible" && void load(), fast ? 8_000 : 20_000);
    return () => clearInterval(t);
  }, [local, enabled, load, fast]);

  const run = useCallback(
    async (op: string, input: unknown): Promise<OpResult> => {
      if (local) {
        const res = await runOp({ store: mem.current!, actor: { id: LOCAL_ID, role: role === "viewer" ? "viewer" : "owner" }, members: [LOCAL_ID], kind: kind! }, op, input);
        setState((s) => (s ? { ...s, data: structuredClone(mem.current!.data) } : s));
        return res;
      }
      if (!navigator.onLine) throw new ApiError("Hors ligne : cette opération nécessite Internet.", 0, {});
      const res = await api<OpResult>(`/api/apps/${projectId}/venue`, { body: { mode, op, input } });
      await load();
      return res;
    },
    [local, projectId, mode, role, load, kind],
  );

  const photos = useCallback(async (): Promise<Doc[]> => {
    if (local) return mem.current?.data.photo ?? [];
    const r = await api<{ photos: Doc[] }>(`/api/apps/${projectId}/venue?mode=${mode}&photos=1`);
    return r.photos;
  }, [local, projectId, mode]);

  return { state, loading, error, reload: load, run, photos, setFast };
}

export type VenueApi = ReturnType<typeof useVenue>;
