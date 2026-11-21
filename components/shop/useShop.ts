"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/fetcher";
import { COLLECTIONS, emptyData, type ShopData, type ShopRole } from "@/lib/shop/model";
import type { OpResult } from "@/lib/shop/engine";
import type { Permission } from "@/lib/team";

export type Member = { id: string; name: string; role: ShopRole; active: boolean };
export type ShopState = {
  data: ShopData;
  members: Member[];
  role: ShopRole;
  me: string;
  perms: Permission[] | null;
  slug: string;
  projectName: string;
  zingopay: boolean;
  /** Collections dont l'historique le plus ancien n'est pas chargé (très gros volume). */
  truncated?: string[];
  can: { cost: boolean; finances: boolean; remises: boolean; settings: boolean; team: boolean };
};
export type QueuedSale = { input: Record<string, unknown> & { id: string; offline_at: string }; label: string; total: number; error?: string };

const cacheKey = (id: string, mode: string) => `msshop:${id}:${mode}:data`;
const queueKey = (id: string, mode: string) => `msshop:${id}:${mode}:queue`;
const read = <T,>(k: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* stockage plein : on continue sans cache */
  }
};

/**
 * Données et opérations de la boutique.
 * - Toutes les écritures passent par l'API (rôle et poste revérifiés par le serveur).
 * - Hors connexion : le catalogue reste consultable (dernière copie sur l'appareil) et les ventes
 *   sont mises en file avec leur identifiant unique, puis envoyées dès le retour d'Internet.
 *   Le serveur ne les enregistre qu'une fois, même si l'envoi est répété.
 */
export function useShop(projectId: string, mode: "demo" | "live") {
  const [state, setState] = useState<ShopState | null>(null);
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const [stale, setStale] = useState(false);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const syncing = useRef(false);

  const load = useCallback(async () => {
    try {
      const r = await api<ShopState>(`/api/apps/${projectId}/shop?mode=${mode}`);
      for (const c of COLLECTIONS) r.data[c] ??= [];
      setState(r);
      setStale(false);
      setError("");
      // Copie sur l'appareil pour consulter le catalogue sans connexion (sans les images).
      write(cacheKey(projectId, mode), { ...r, data: { ...r.data, photo: [] } });
    } catch (e) {
      const cached = read<ShopState | null>(cacheKey(projectId, mode), null);
      if (e instanceof ApiError && e.status === 0 && cached) {
        for (const c of COLLECTIONS) cached.data[c] ??= [];
        setState((s) => s ?? cached);
        setStale(true);
      } else setError(e instanceof Error ? e.message : "Chargement impossible.");
    }
  }, [projectId, mode]);

  const sync = useCallback(async () => {
    if (syncing.current) return;
    const q = read<QueuedSale[]>(queueKey(projectId, mode), []);
    if (!q.length) return;
    syncing.current = true;
    const left: QueuedSale[] = [];
    for (let k = 0; k < q.length; k++) {
      const item = q[k]!;
      if (item.error) {
        left.push(item);
        continue;
      }
      try {
        await api(`/api/apps/${projectId}/shop`, { body: { mode, op: "sale.create", input: item.input } });
      } catch (e) {
        if (e instanceof ApiError && e.status === 0) {
          left.push(...q.slice(k));
          break;
        }
        // Refus du serveur (ex. droits) : la vente reste signalée à l'écran, jamais perdue en silence.
        left.push({ ...item, error: e instanceof Error ? e.message : "Refusée" });
      }
    }
    const rest = left;
    write(queueKey(projectId, mode), rest);
    setQueue(rest);
    syncing.current = false;
    if (rest.length < q.length) await load();
  }, [projectId, mode, load]);

  useEffect(() => {
    setQueue(read<QueuedSale[]>(queueKey(projectId, mode), []));
    void load().then(sync);
    const on = () => {
      setOffline(false);
      void sync().then(load);
    };
    const off = () => setOffline(true);
    setOffline(typeof navigator !== "undefined" && !navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    // Données partagées par l'équipe : actualisation tant que la page est visible.
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) void load().then(sync);
    }, 25_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      clearInterval(t);
    };
  }, [projectId, mode, load, sync]);

  const op = useCallback(
    async (name: string, input: unknown, opts: { offlineLabel?: string; offlineTotal?: number } = {}): Promise<OpResult & { queued?: boolean }> => {
      try {
        const r = await api<OpResult>(`/api/apps/${projectId}/shop`, { body: { mode, op: name, input } });
        void load();
        return r;
      } catch (e) {
        if (e instanceof ApiError && e.status === 0 && name === "sale.create" && opts.offlineLabel) {
          const item: QueuedSale = { input: { ...(input as QueuedSale["input"]), offline_at: new Date().toISOString() }, label: opts.offlineLabel, total: opts.offlineTotal ?? 0 };
          const q = [...read<QueuedSale[]>(queueKey(projectId, mode), []), item];
          write(queueKey(projectId, mode), q);
          setQueue(q);
          return { message: "Pas de connexion : vente gardée sur cet appareil, elle sera envoyée automatiquement.", effects: [], queued: true, id: item.input.id };
        }
        throw e;
      }
    },
    [projectId, mode, load],
  );

  const dropQueued = useCallback(
    (id: string) => {
      const q = read<QueuedSale[]>(queueKey(projectId, mode), []).filter((x) => x.input.id !== id);
      write(queueKey(projectId, mode), q);
      setQueue(q);
    },
    [projectId, mode],
  );

  const img = useCallback((id: string | null | undefined) => (id ? `/api/apps/${projectId}/shop?mode=${mode}&img=${id}` : null), [projectId, mode]);

  return { state, error, offline, stale, queue, load, sync, op, dropQueued, img, data: state?.data ?? emptyData() };
}
