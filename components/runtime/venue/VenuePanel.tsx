"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LEVEL, PHOTO_CATEGORY_LABELS, type Doc, type Photo, type PhotoCategory, type VenueKind, type VenueZone } from "@/lib/venue/model";
import type { DataMode } from "../useAppData";
import { Back, Btn, Modal, OptionCard, VenueCtx } from "./ui";
import { venueSettings, type VenueApi } from "./useVenue";
import { RoomDetail, RoomsList } from "./m-hotel";
import { ZONE_META, zoneOptions } from "./zones";

type Props = {
  kind: VenueKind;
  zones: VenueZone[];
  zone: VenueZone;
  onZone: (z: VenueZone) => void;
  onClose: () => void;
  api: VenueApi;
  projectId: string;
  mode: DataMode;
  appName: string;
  notify: (kind: "success" | "error" | "info", message: string) => void;
  /** Chambre sélectionnée sur le plan (hôtel). */
  roomId: string | null;
  onRoom: (id: string | null) => void;
  /** Fonction à ouvrir directement (lien depuis une autre zone). */
  request: { option: string; n: number } | null;
};

/** Panneau latéral gauche : s'ouvre au clic sur une zone du plan, sans quitter la vue 3D. */
export function VenuePanel({ kind, zones, zone, onZone, onClose, api, projectId, mode, appName, notify, roomId, onRoom, request }: Props) {
  const [option, setOption] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; resolve: (ok: boolean) => void } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const meta = ZONE_META[kind][zone]!;
  const settings = venueSettings(api.state, kind);
  const options = zoneOptions(kind, zone, settings.room_service === true);

  // Fonction demandée depuis une autre zone : ouverte dès que la nouvelle zone s'affiche.
  const pending = useRef<string | null>(null);
  useEffect(() => {
    setOption(pending.current);
    pending.current = null;
    panel.current?.focus();
  }, [zone]);
  useEffect(() => {
    if (request) setOption(request.option);
  }, [request]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector('[role="dialog"][aria-modal]')) onClose();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const ask = useCallback((message: string) => new Promise<boolean>((resolve) => setConfirm({ message, resolve })), []);
  const answer = (ok: boolean) => {
    confirm?.resolve(ok);
    setConfirm(null);
  };

  const s = api.state;
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
      goZone: (z: string, opt?: string) => {
        if (!zones.includes(z as VenueZone)) return;
        if (z === zone) return setOption(opt ?? null);
        pending.current = opt ?? null;
        onZone(z as VenueZone);
      },
    };
  }, [s, api, mode, projectId, appName, kind, settings, ask, notify, onZone, zones, zone]);

  const current = options.find((o) => o.id === option);
  // Photos réelles de l'espace (références visuelles), chargées seulement si la zone en a.
  const photoCat: PhotoCategory | null = kind === "hotel" ? (({ reception: "reception", chambres: "chambres", restaurant: "restaurant" }) as Partial<Record<VenueZone, PhotoCategory>>)[zone] ?? null : null;
  const hasPhotos = photoCat !== null && (settings.photo_counts[photoCat] ?? 0) > 0;
  const [photos, setPhotos] = useState<Doc<Photo>[] | null>(null);
  useEffect(() => {
    if (!hasPhotos || photos) return;
    api.photos().then((p) => setPhotos(p as Doc<Photo>[]), () => setPhotos([]));
  }, [hasPhotos, photos, api]);
  const zonePhotos = (photos ?? []).filter((p) => p.data.category === photoCat);
  const isRooms = kind === "hotel" && zone === "chambres";

  return (
    <aside
      ref={panel}
      tabIndex={-1}
      aria-label={`Panneau ${meta.label}`}
      className="no-print fixed inset-0 z-50 flex w-full flex-col bg-slate-50 shadow-2xl outline-none sm:inset-y-0 sm:right-auto sm:w-[min(520px,92vw)] sm:border-r sm:border-slate-200"
      style={{ animation: "slide-in .28s cubic-bezier(.2,.7,.2,1) both" }}
    >
      <header className="flex items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: "var(--app-primary)" }}><meta.icon className="h-5 w-5" aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{meta.label}{current && <span className="font-normal text-slate-500"> · {current.title}</span>}</h2>
          <p className="truncate text-xs text-slate-500">{current ? current.description : meta.description}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer le panneau" className="tab-press rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" aria-hidden /></button>
      </header>
      <nav aria-label="Zones du plan" className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
        {zones.map((z) => {
          const Z = ZONE_META[kind][z]!;
          const on = z === zone;
          return (
            <button key={z} type="button" onClick={() => onZone(z)} aria-current={on ? "true" : undefined} className={`tab-press inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs ${on ? "font-semibold text-slate-900 ring-2 ring-[var(--app-primary)]" : "text-slate-500 hover:bg-slate-100"}`}>
              <Z.icon className="h-3.5 w-3.5" aria-hidden />{Z.label}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-4">
        {mode !== "live" && <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{mode === "local" ? "Démo : les fiches que vous créez restent dans ce navigateur. Aucune donnée d'exemple n'est inventée." : "Aperçu : les fiches sont enregistrées comme données de démonstration, séparées des données réelles."}</p>}
        {api.loading && !s ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14" />)}</div>
        ) : api.error && !s ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{api.error} <button type="button" className="font-medium underline" onClick={() => api.reload()}>Réessayer</button></div>
        ) : ctx ? (
          <VenueCtx.Provider value={ctx}>
            {api.error && <p role="alert" className="mb-2 text-xs text-red-600">Actualisation impossible : {api.error}</p>}
            {!current && !roomId && zonePhotos.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-xs font-medium text-slate-600">Vos photos · {PHOTO_CATEGORY_LABELS[photoCat!]} (photos réelles, référence visuelle)</p>
                <ul className="flex gap-1.5 overflow-x-auto pb-1">
                  {zonePhotos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <li key={p.id} className="shrink-0"><img src={p.data.data_url} alt={p.data.caption || "Photo"} className="h-16 w-24 rounded-lg border border-slate-200 object-cover" /></li>
                  ))}
                </ul>
              </div>
            )}
            <div key={`${zone}:${option ?? ""}:${roomId ?? ""}`} style={{ animation: "fade-up .3s ease both" }}>
              {isRooms ? (
                roomId ? <RoomDetail roomId={roomId} onBack={() => onRoom(null)} /> : <RoomsList onRoom={(id) => onRoom(id)} />
              ) : current ? (
                <>
                  <Back onClick={() => setOption(null)} />
                  {current.render()}
                </>
              ) : (
                <ul className="space-y-2">
                  {options.map((o) => {
                    const h = o.hint?.(s!.data) ?? null;
                    return (
                      <li key={o.id}>
                        <OptionCard icon={o.icon} title={o.title} description={o.description} hint={h?.text} tone={h?.tone} onClick={() => setOption(o.id)} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </VenueCtx.Provider>
        ) : null}
      </div>
      {confirm && (
        <Modal title="Confirmation" onClose={() => answer(false)}>
          <p className="text-sm text-slate-700">{confirm.message}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Btn kind="ghost" onClick={() => answer(false)}>Annuler</Btn>
            <Btn onClick={() => answer(true)}>Confirmer</Btn>
          </div>
        </Modal>
      )}
    </aside>
  );
}
