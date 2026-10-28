"use client";

import { Camera, Check, ImagePlus, RefreshCw, Trash2, Umbrella, Utensils, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { HOTEL_EXTRA_LABELS, HOTEL_EXTRA_SPACES, LEVEL, PHOTO_CATEGORY_LABELS, type Doc, type HotelExtraSpace, type Photo, type PhotoCategory, type Settings, type VenueKind } from "@/lib/venue/model";
import { Btn, Field, inp } from "../garage/ui";
import { averageColor, compressImage } from "./m-office";
import type { VenueApi } from "./useVenue";

type Notify = (kind: "success" | "error" | "info", message: string) => void;

function Choice({ selected, onClick, icon: Icon, title, text }: { selected: boolean; onClick: () => void; icon: typeof Check; title: string; text?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`tab-press flex w-full items-center gap-3 rounded-2xl border-2 bg-white p-4 text-left transition ${selected ? "shadow-md" : "border-slate-200 hover:border-slate-300"}`}
      style={selected ? { borderColor: "var(--app-primary)" } : undefined}
    >
      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${selected ? "text-white" : "bg-slate-100 text-slate-600"}`} style={selected ? { background: "var(--app-primary)" } : undefined}><Icon className="h-5 w-5" aria-hidden /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-slate-900">{title}</span>
        {text && <span className="block text-xs text-slate-500">{text}</span>}
      </span>
      {selected && <Check className="h-5 w-5" style={{ color: "var(--app-primary)" }} aria-hidden />}
    </button>
  );
}

/**
 * Questionnaire posé avant de générer le plan 3D (et modifiable ensuite) :
 * restaurant → terrasse ; hôtel → restaurant, service en chambre, autres espaces, puis photos.
 */
export function VenueSetup({ kind, api, settings, notify, onDone, onCancel }: { kind: VenueKind; api: VenueApi; settings: Settings; notify: Notify; onDone: () => void; onCancel?: () => void }) {
  const level = api.state ? LEVEL[api.state.role] : 0;
  const [step, setStep] = useState<"questions" | "photos">(kind === "hotel" && settings.answered && settings.photos_step === null ? "photos" : "questions");
  const [terrace, setTerrace] = useState<boolean | null>(settings.terrace);
  const [resto, setResto] = useState<boolean | null>(settings.has_restaurant);
  const [roomService, setRoomService] = useState<boolean | null>(settings.room_service);
  const [extra, setExtra] = useState<HotelExtraSpace[]>(settings.extra_spaces);
  const [dims, setDims] = useState({ length: settings.dims.length?.toString() ?? "", width: settings.dims.width?.toString() ?? "", note: settings.dims.note });
  const [busy, setBusy] = useState(false);

  if (level < 2)
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <p className="font-semibold">Le plan n&apos;est pas encore configuré</p>
        <p className="mt-1 text-sm text-slate-500">Un gérant doit d&apos;abord répondre aux questions de personnalisation du plan 3D.</p>
      </div>
    );

  const ready = kind === "restaurant" ? terrace !== null : resto !== null && (resto === false || roomService !== null);
  const save = async () => {
    setBusy(true);
    const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
    try {
      const input =
        kind === "restaurant"
          ? { answered: true, terrace, dims: { length: num(dims.length), width: num(dims.width), note: dims.note } }
          : { answered: true, has_restaurant: resto, room_service: resto ? roomService : false, extra_spaces: extra, dims: { length: num(dims.length), width: num(dims.width), note: dims.note } };
      const r = await api.run("settings.save", input);
      notify("success", r.message);
      if (kind === "hotel") setStep("photos");
      else onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  };

  if (step === "photos") return <PhotoStep api={api} settings={{ ...settings, has_restaurant: resto, extra_spaces: extra }} notify={notify} onBack={() => setStep("questions")} onDone={onDone} />;

  return (
    <div className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" style={{ animation: "fade-up .3s ease both" }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Personnalisation du plan 3D</p>
          <h3 className="text-lg font-bold">{kind === "restaurant" ? "Avant de générer le plan de votre restaurant" : "Avant de générer le plan de votre hôtel"}</h3>
          <p className="text-sm text-slate-500">Seules les zones que vous déclarez apparaîtront sur le plan. Vous pourrez modifier ces réponses plus tard.</p>
        </div>
        {onCancel && <button type="button" onClick={onCancel} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Fermer"><X className="h-5 w-5" aria-hidden /></button>}
      </div>

      {kind === "restaurant" ? (
        <fieldset className="space-y-2">
          <legend className="mb-2 font-semibold">Votre restaurant possède-t-il une terrasse ?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice selected={terrace === true} onClick={() => setTerrace(true)} icon={Umbrella} title="Oui, j'ai une terrasse." text="La zone Terrasse est ajoutée au plan." />
            <Choice selected={terrace === false} onClick={() => setTerrace(false)} icon={X} title="Non, je n'ai pas de terrasse." text="Aucun espace n'est réservé à une terrasse." />
          </div>
        </fieldset>
      ) : (
        <>
          <fieldset className="space-y-2">
            <legend className="mb-2 font-semibold">Votre hôtel possède-t-il un restaurant ?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice selected={resto === true} onClick={() => setResto(true)} icon={Utensils} title="Oui, nous avons un restaurant." text="Zones Restaurant et Cuisine sur le plan." />
              <Choice selected={resto === false} onClick={() => (setResto(false), setRoomService(false))} icon={X} title="Non, pas de restaurant." />
            </div>
          </fieldset>
          {resto && (
            <fieldset className="space-y-2" style={{ animation: "fade-up .3s ease both" }}>
              <legend className="mb-2 font-semibold">Proposez-vous le service en chambre ?</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice selected={roomService === true} onClick={() => setRoomService(true)} icon={Check} title="Oui, service en chambre." text="Les commandes pourront être liées aux chambres." />
                <Choice selected={roomService === false} onClick={() => setRoomService(false)} icon={X} title="Non." />
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend className="mb-2 font-semibold">Autres espaces de votre établissement (facultatif)</legend>
            <div className="flex flex-wrap gap-2">
              {HOTEL_EXTRA_SPACES.map((sp) => {
                const on = extra.includes(sp);
                return (
                  <button key={sp} type="button" aria-pressed={on} onClick={() => setExtra(on ? extra.filter((x) => x !== sp) : [...extra, sp])} className={`tab-press rounded-full border px-3 py-1.5 text-sm ${on ? "font-medium text-white" : "border-slate-200 bg-white text-slate-700"}`} style={on ? { background: "var(--app-primary)", borderColor: "var(--app-primary)" } : undefined}>
                    {HOTEL_EXTRA_LABELS[sp]}
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-500">Ces espaces servent à classer vos photos ; ils ne créent pas de zone de gestion supplémentaire.</p>
          </fieldset>
        </>
      )}

      <details className="rounded-xl border border-slate-200 p-3 text-sm">
        <summary className="cursor-pointer font-medium">Dimensions approximatives (facultatif)</summary>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <Field label="Longueur (m)"><input className={inp} inputMode="decimal" value={dims.length} onChange={(e) => setDims({ ...dims, length: e.target.value })} /></Field>
          <Field label="Largeur (m)"><input className={inp} inputMode="decimal" value={dims.width} onChange={(e) => setDims({ ...dims, width: e.target.value })} /></Field>
          <Field label="Remarque"><input className={inp} maxLength={300} value={dims.note} onChange={(e) => setDims({ ...dims, note: e.target.value })} placeholder="Plan coté disponible…" /></Field>
        </div>
        <p className="mt-2 text-xs text-slate-500">Le plan 3D reste schématique : il organise les zones, il ne reproduit pas les mesures exactes. Les dimensions saisies sont affichées comme déclarées par vous.</p>
      </details>

      <div className="flex justify-end gap-2">
        {onCancel && <Btn kind="ghost" onClick={onCancel}>Annuler</Btn>}
        <Btn busy={busy} disabled={!ready} onClick={save}>{kind === "hotel" ? "Continuer" : settings.answered ? "Mettre à jour le plan" : "Générer le plan 3D"}</Btn>
      </div>
    </div>
  );
}

// ---------- Étape photos de l'hôtel ----------

function PhotoStep({ api, settings, notify, onBack, onDone }: { api: VenueApi; settings: Settings; notify: Notify; onBack: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<"choice" | "import">(Object.values(settings.photo_counts).some((n) => (n ?? 0) > 0) ? "import" : "choice");
  const [photos, setPhotos] = useState<Doc<Photo>[] | null>(null);
  const [loadErr, setLoadErr] = useState("");
  const [busy, setBusy] = useState<Partial<Record<PhotoCategory, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<PhotoCategory, string>>>({});
  const [finishing, setFinishing] = useState(false);
  const cats: PhotoCategory[] = ["exterieur", "reception", "chambres", "salles_bain", ...(settings.has_restaurant ? (["restaurant"] as const) : []), ...settings.extra_spaces];

  const load = useCallback(async () => {
    setLoadErr("");
    try {
      setPhotos((await api.photos()) as Doc<Photo>[]);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Chargement des photos impossible.");
      setPhotos([]);
    }
  }, [api]);
  useEffect(() => {
    if (mode === "import") void load();
  }, [mode, load]);

  const upload = async (cat: PhotoCategory, files: FileList | null, replaceId?: string) => {
    if (!files?.length) return;
    setBusy((b) => ({ ...b, [cat]: true }));
    setErrors((e) => ({ ...e, [cat]: "" }));
    let okCount = 0;
    for (const file of Array.from(files).slice(0, replaceId ? 1 : 12)) {
      try {
        const data_url = await compressImage(file);
        const tint = await averageColor(data_url);
        await api.run("photo.add", { category: cat, data_url, caption: file.name.slice(0, 120), tint, replace_id: replaceId ?? null });
        okCount++;
      } catch (e) {
        setErrors((x) => ({ ...x, [cat]: `${file.name} : ${e instanceof Error ? e.message : "import impossible"}` }));
      }
    }
    if (okCount) notify("success", replaceId ? "Photo remplacée." : `${okCount} photo(s) ajoutée(s).`);
    setBusy((b) => ({ ...b, [cat]: false }));
    await load();
  };

  const finish = async (step: "fait" | "ignore") => {
    setFinishing(true);
    try {
      await api.run("settings.save", { photos_step: step });
      onDone();
    } catch (e) {
      notify("error", e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" style={{ animation: "fade-up .3s ease both" }}>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Étape facultative</p>
        <h3 className="text-lg font-bold">Ajoutez des photos de votre hôtel</h3>
        <p className="text-sm text-slate-500">Les photos servent de références visuelles pour personnaliser le plan 3D (couleurs des zones, aperçus). Elles ne permettent pas de déterminer des dimensions exactes : pour un plan précis, indiquez les dimensions ou joignez un plan coté.</p>
      </div>
      {mode === "choice" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice selected={false} onClick={() => setMode("import")} icon={ImagePlus} title="Importer mes photos" text="Depuis votre téléphone ou votre ordinateur." />
          <Choice selected={false} onClick={() => finish("ignore")} icon={Check} title="Continuer sans photos" text="Vous pourrez en ajouter plus tard." />
        </div>
      ) : (
        <>
          {loadErr && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loadErr} <button type="button" className="underline" onClick={() => load()}>Réessayer</button></p>}
          <ul className="space-y-3">
            {cats.map((cat) => {
              const list = (photos ?? []).filter((p) => p.data.category === cat);
              return (
                <li key={cat} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{PHOTO_CATEGORY_LABELS[cat]} <span className="text-xs font-normal text-slate-500">· {list.length} photo(s)</span></p>
                    <label className={`tab-press inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium text-white ${busy[cat] ? "pointer-events-none opacity-60" : ""}`} style={{ background: "var(--app-primary)" }}>
                      {busy[cat] ? <span className="spinner" aria-hidden /> : <Camera className="h-4 w-4" aria-hidden />}
                      {busy[cat] ? "Import…" : "Ajouter des photos"}
                      <input type="file" accept="image/*" multiple className="sr-only" disabled={busy[cat]} onChange={(e) => { const f = e.target.files; void upload(cat, f).then(() => (e.target.value = "")); }} />
                    </label>
                  </div>
                  {errors[cat] && <p role="alert" className="mt-1 text-xs text-red-600">{errors[cat]}</p>}
                  {photos === null ? (
                    <p className="mt-2 text-xs text-slate-500">Chargement…</p>
                  ) : list.length > 0 ? (
                    <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                      {list.map((p) => (
                        <li key={p.id} className="group relative overflow-hidden rounded-lg border border-slate-200">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.data.data_url} alt={p.data.caption || PHOTO_CATEGORY_LABELS[cat]} className="aspect-square w-full object-cover" />
                          <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] font-medium text-white">Photo réelle</span>
                          <div className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 p-1">
                            <label className="cursor-pointer rounded bg-white/90 p-1 text-slate-700" title="Remplacer">
                              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Remplacer</span>
                              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void upload(cat, e.target.files, p.id)} />
                            </label>
                            <button type="button" className="rounded bg-white/90 p-1 text-red-600" title="Supprimer" onClick={async () => { try { await api.run("photo.delete", { id: p.id }); await load(); } catch (e) { notify("error", e instanceof Error ? e.message : "Suppression impossible."); } }}>
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Supprimer</span>
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">Aucune photo : vous pouvez continuer sans.</p>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap justify-between gap-2">
            <Btn kind="ghost" onClick={onBack}>Retour aux questions</Btn>
            <div className="flex gap-2">
              <Btn kind="ghost" onClick={() => finish("ignore")} busy={finishing}>Continuer sans photos</Btn>
              <Btn onClick={() => finish("fait")} busy={finishing}>Valider et générer le plan</Btn>
            </div>
          </div>
        </>
      )}
      {mode === "choice" && <div className="flex justify-start"><Btn kind="ghost" onClick={onBack}>Retour aux questions</Btn></div>}
    </div>
  );
}
