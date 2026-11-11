"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { shrinkImage } from "@/components/runtime/venue/image";

/**
 * Logo importé depuis la galerie du téléphone ou l'ordinateur (plus d'adresse https à coller) :
 * l'image est réduite dans le navigateur (256 px, poids limité) puis enregistrée avec le reste.
 */
export function LogoPicker({ value, onChange, label = "Logo", fallback }: { value: string; onChange: (v: string) => void; label?: string; fallback?: React.ReactNode }) {
  const [err, setErr] = useState("");
  return (
    <div className="block text-sm">
      <span className="label">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Logo" className="h-14 w-14 rounded-xl border border-slate-200 bg-white object-cover" referrerPolicy="no-referrer" />
        ) : (
          fallback ?? <span className="grid h-14 w-14 place-items-center rounded-xl border border-dashed border-slate-300 text-slate-400"><ImagePlus className="h-5 w-5" aria-hidden /></span>
        )}
        <label className="btn btn-ghost cursor-pointer !min-h-0 px-3 py-1.5 text-xs">
          <ImagePlus className="h-3.5 w-3.5" aria-hidden />
          {value ? "Changer le logo" : "Importer un logo"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setErr("");
                onChange(await shrinkImage(f, 256, "image/png", 200_000));
              } catch (x) {
                setErr(x instanceof Error ? x.message : "Image illisible.");
              }
            }}
          />
        </label>
        {value && (
          <button type="button" onClick={() => onChange("")} className="btn btn-ghost !min-h-0 px-3 py-1.5 text-xs">
            <Trash2 className="h-3.5 w-3.5" aria-hidden />Retirer
          </button>
        )}
      </div>
      <span className="mt-1 block text-xs text-slate-500">Choisissez une image dans votre galerie (PNG, JPEG ou photo du téléphone).</span>
      {err && <span role="alert" className="mt-1 block text-xs text-red-700">{err}</span>}
    </div>
  );
}
