"use client";

import { useCallback, useMemo, useState } from "react";
import { LEVEL, type VenueKind } from "@/lib/venue/model";
import type { DataMode } from "../useAppData";
import { Btn, Modal } from "./ui";
import { venueSettings, type VenueApi } from "./useVenue";

type Notify = (kind: "success" | "error" | "info", message: string) => void;

/**
 * Contexte partagé par les écrans du restaurant / de l'hôtel (panneau des zones, Vision IA) :
 * données, rôle, exécution des opérations avec message et confirmation.
 */
export function useVenueContext({ api, mode, projectId, appName, kind, notify, goZone }: { api: VenueApi; mode: DataMode; projectId: string; appName: string; kind: VenueKind; notify: Notify; goZone: (zone: string, option?: string) => void }) {
  const [confirm, setConfirm] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null);
  const ask = useCallback((message: string) => new Promise<boolean>((resolve) => setConfirm({ message, resolve })), []);
  const answer = (ok: boolean) => {
    confirm?.resolve(ok);
    setConfirm(null);
  };
  const s = api.state;
  const settings = venueSettings(s, kind);
  const ctx = useMemo(() => {
    if (!s) return null;
    return {
      v: s,
      api,
      mode,
      projectId,
      appName,
      kind,
      settings,
      level: LEVEL[s.role],
      name: (id: string | null | undefined) => (id ? (s.members.find((m) => m.id === id)?.name ?? "Ancien membre") : "—"),
      ask,
      act: async (op: string, input: unknown, opts?: { confirm?: string; quiet?: boolean }) => {
        if (opts?.confirm && !(await ask(opts.confirm))) return null;
        try {
          const r = await api.run(op, input);
          if (!opts?.quiet) notify(r.duplicate ? "info" : "success", r.message);
          return r;
        } catch (e) {
          notify("error", e instanceof Error ? e.message : "Opération impossible.");
          return null;
        }
      },
      goZone,
    };
    // `settings` est recalculé à partir de `s` : inutile de le suivre séparément.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s, api, mode, projectId, appName, kind, ask, notify, goZone]);

  const confirmUi = confirm ? (
    <Modal title="Confirmation" onClose={() => answer(false)}>
      <p className="text-sm text-slate-700">{confirm.message}</p>
      <div className="mt-4 flex justify-end gap-2">
        <Btn kind="ghost" onClick={() => answer(false)}>Annuler</Btn>
        <Btn onClick={() => answer(true)}>Confirmer</Btn>
      </div>
    </Modal>
  ) : null;
  return { ctx, confirmUi };
}
