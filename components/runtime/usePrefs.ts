"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import type { AppPrefs } from "@/lib/app-prefs";
import type { DataMode } from "./useAppData";

const localKey = (projectId: string) => `msprefs:${projectId}`;

/**
 * Préférences d'affichage de l'utilisateur pour ce logiciel : enregistrées sur son compte
 * (retrouvées après reconnexion), ou dans le navigateur pour la démo publique sans compte.
 */
export function usePrefs(projectId: string, mode: DataMode) {
  const [prefs, setPrefs] = useState<AppPrefs>({});
  const [loaded, setLoaded] = useState(false);
  const current = useRef<AppPrefs>({});
  current.current = prefs;

  useEffect(() => {
    let alive = true;
    if (mode === "local") {
      try {
        setPrefs(JSON.parse(localStorage.getItem(localKey(projectId)) || "{}") as AppPrefs);
      } catch {
        /* stockage indisponible */
      }
      setLoaded(true);
      return;
    }
    api<{ prefs: AppPrefs }>(`/api/apps/${projectId}/prefs`)
      .then((r) => alive && setPrefs(r.prefs))
      .catch(() => undefined)
      .finally(() => alive && setLoaded(true));
    return () => {
      alive = false;
    };
  }, [projectId, mode]);

  const save = useCallback(
    (patch: AppPrefs) => {
      const next = { ...current.current, ...patch };
      current.current = next;
      setPrefs(next);
      if (mode === "local") {
        try {
          localStorage.setItem(localKey(projectId), JSON.stringify(next));
        } catch {
          /* stockage indisponible */
        }
      } else {
        void api(`/api/apps/${projectId}/prefs`, { method: "PUT", body: next }).catch(() => undefined);
      }
    },
    [projectId, mode],
  );

  return { prefs, loaded, save };
}
