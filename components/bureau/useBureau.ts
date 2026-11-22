"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/fetcher";
import { COLLECTIONS, emptyData, type BureauData, type BureauRole } from "@/lib/bureau/model";
import type { OpResult } from "@/lib/bureau/engine";
import type { Permission } from "@/lib/team";

export type Member = { id: string; name: string; role: BureauRole; position: string | null; active: boolean };
export type BureauState = {
  data: BureauData;
  members: Member[];
  role: BureauRole;
  me: string;
  perms: Permission[] | null;
  slug: string;
  projectName: string;
  truncated?: string[];
  can: { manager: boolean; settings: boolean; team: boolean; finances: boolean; people: boolean };
};

/** Données et opérations du bureau : toutes les écritures passent par l'API (rôle et poste revérifiés par le serveur). */
export function useBureau(projectId: string, mode: "demo" | "live") {
  const [state, setState] = useState<BureauState | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api<BureauState>(`/api/apps/${projectId}/bureau?mode=${mode}`);
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
      const r = await api<OpResult>(`/api/apps/${projectId}/bureau`, { body: { mode, op: name, input } });
      void load();
      return r;
    },
    [projectId, mode, load],
  );
  const fileUrl = useCallback((id: string | null | undefined) => (id ? `/api/apps/${projectId}/bureau?mode=${mode}&file=${id}` : null), [projectId, mode]);
  const docUrl = useCallback((kind: string, id: string, pid?: string) => `/api/apps/${projectId}/bureau/doc?mode=${mode}&kind=${kind}&id=${id}${pid ? `&pid=${pid}` : ""}`, [projectId, mode]);
  return { state, error, offline, load, op, fileUrl, docUrl, data: state?.data ?? emptyData() };
}
