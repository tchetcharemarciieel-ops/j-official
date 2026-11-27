"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/fetcher";
import { COLLECTIONS, emptyData, type EcoleData, type EcoleRole } from "@/lib/ecole/model";
import type { ChildReport } from "@/lib/ecole/visibility";
import type { OpResult } from "@/lib/ecole/engine";
import type { Permission } from "@/lib/team";

export type Member = { id: string; name: string; role: EcoleRole; position: string | null; active: boolean };
export type EcoleState = {
  data: EcoleData; members: Member[]; role: EcoleRole; me: string; perms: Permission[] | null; slug: string; projectName: string; truncated?: string[]; reports: ChildReport[];
  can: { manager: boolean; settings: boolean; team: boolean; parent: boolean; students: boolean; classes: boolean; teachers: boolean; notes: boolean; bulletins: boolean; presences: boolean; finances: boolean; announcements: boolean };
};

/** Données et opérations de l'école : toutes les écritures passent par l'API (rôle et poste revérifiés par le serveur). */
export function useEcole(projectId: string, mode: "demo" | "live") {
  const [state, setState] = useState<EcoleState | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const load = useCallback(async () => {
    try {
      const r = await api<EcoleState>(`/api/apps/${projectId}/ecole?mode=${mode}`);
      for (const c of COLLECTIONS) r.data[c] ??= [];
      setState(r); setError(""); setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOffline(true);
      else setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [projectId, mode]);
  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && navigator.onLine && void load(), 30_000);
    const on = () => void load();
    window.addEventListener("online", on);
    return () => { clearInterval(t); window.removeEventListener("online", on); };
  }, [load]);
  const op = useCallback(async (name: string, input: unknown): Promise<OpResult> => {
    const r = await api<OpResult>(`/api/apps/${projectId}/ecole`, { body: { mode, op: name, input } });
    void load();
    return r;
  }, [projectId, mode, load]);
  const fileUrl = useCallback((id: string | null | undefined) => (id ? `/api/apps/${projectId}/ecole?mode=${mode}&file=${id}` : null), [projectId, mode]);
  const docUrl = useCallback((kind: "bulletin" | "receipt", id: string, extra: Record<string, string> = {}) => `/api/apps/${projectId}/ecole/doc?mode=${mode}&kind=${kind}&id=${id}${Object.entries(extra).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join("")}`, [projectId, mode]);
  return { state, error, offline, load, op, fileUrl, docUrl, data: state?.data ?? emptyData() };
}
