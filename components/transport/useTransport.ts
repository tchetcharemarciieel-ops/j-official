"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/fetcher";
import { COLLECTIONS, emptyData, type TransportData, type TransportRole } from "@/lib/transport/model";
import type { OpResult } from "@/lib/transport/engine";
import type { Permission } from "@/lib/team";

export type Member = { id: string; name: string; role: TransportRole; position: string | null; active: boolean };
export type TransportState = {
  data: TransportData;
  members: Member[];
  role: TransportRole;
  me: string;
  perms: Permission[] | null;
  slug: string;
  projectName: string;
  truncated?: string[];
  can: { manager: boolean; settings: boolean; team: boolean; finances: boolean; dispatch: boolean; couriers: boolean; missions: boolean };
};

/** Données et opérations du bureau : toutes les écritures passent par l'API (rôle et poste revérifiés par le serveur). */
export function useTransport(projectId: string, mode: "demo" | "live") {
  const [state, setState] = useState<TransportState | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<TransportState>(`/api/apps/${projectId}/transport?mode=${mode}`);
      for (const c of COLLECTIONS) r.data[c] ??= [];
      setState(r);
      setError("");
      setOffline(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) setOffline(true);
      else setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [projectId, mode]);

  useEffect(() => {
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && navigator.onLine && void load(), 20_000);
    const on = () => void load();
    window.addEventListener("online", on);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", on);
    };
  }, [load]);

  const op = useCallback(
    async (name: string, input: unknown): Promise<OpResult> => {
      const r = await api<OpResult>(`/api/apps/${projectId}/transport`, { body: { mode, op: name, input } });
      void load();
      return r;
    },
    [projectId, mode, load],
  );
  const fileUrl = useCallback((id: string | null | undefined) => (id ? `/api/apps/${projectId}/transport?mode=${mode}&file=${id}` : null), [projectId, mode]);
  const docUrl = useCallback((kind: string, id: string, date?: string) => `/api/apps/${projectId}/transport/doc?mode=${mode}&kind=${kind}&id=${id}${date ? `&date=${date}` : ""}`, [projectId, mode]);
  return { state, error, offline, load, op, fileUrl, docUrl, data: state?.data ?? emptyData() };
}
