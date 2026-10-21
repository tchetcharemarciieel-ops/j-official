"use client";

import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = [
  { label: "Restaurant", text: "Je veux gérer les commandes, les stocks et les dépenses de mon restaurant." },
  { label: "Pharmacie", text: "Je veux suivre le stock de médicaments, les dates de péremption et les ventes de ma pharmacie." },
  { label: "Garage", text: "Je veux suivre les réparations, les factures et les pièces de mon garage." },
  { label: "Commerce", text: "Je veux gérer les stocks, les ventes et les clients de ma boutique." },
];

export function HeroPrompt() {
  const router = useRouter();
  const [text, setText] = useState("");
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    router.push(q ? `${siteHref("/creer")}?probleme=${encodeURIComponent(q.slice(0, 2000))}` : "/creer");
  };
  return (
    <form onSubmit={go} className="glass mx-auto max-w-3xl rounded-xl p-3 text-left shadow-sm sm:p-4">
      <label htmlFor="probleme" className="sr-only">
        Décrivez le problème que vous souhaitez résoudre
      </label>
      <textarea
        id="probleme"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Exemple : je veux suivre mes ventes, mon stock et les dettes de mes clients."
        className="w-full resize-none bg-transparent px-2 py-2 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none sm:text-lg"
      />
      <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex.label} onClick={() => setText(ex.text)} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-blue-300 hover:text-blue-700">
              {ex.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {!STATIC_SITE && (
            <button type="button" className="btn btn-ghost" onClick={() => router.push(`/demo${text.trim() ? `?probleme=${encodeURIComponent(text.trim().slice(0, 2000))}` : ""}`)}>
              Essayer la démo
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            Créer mon logiciel
          </button>
        </div>
      </div>
    </form>
  );
}
