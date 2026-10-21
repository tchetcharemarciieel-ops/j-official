"use client";

import { siteHref, STATIC_SITE } from "@/lib/site-mode";
import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = ["Je veux gérer les commandes, les stocks et les dépenses de mon restaurant.", "Je veux suivre les réparations de mon garage.", "Je veux gérer les élèves et les paiements de mon école."];

export function HeroPrompt() {
  const router = useRouter();
  const [text, setText] = useState("");
  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    router.push(q ? `${siteHref("/creer")}?probleme=${encodeURIComponent(q.slice(0, 2000))}` : "/creer");
  };
  return (
    <form onSubmit={go} className="glass glow-ring mx-auto mt-10 max-w-3xl rounded-2xl p-3 text-left sm:p-4">
      <label htmlFor="probleme" className="sr-only">
        Décrivez le problème que vous souhaitez résoudre
      </label>
      <textarea
        id="probleme"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Décrivez le problème que vous souhaitez résoudre…"
        className="w-full resize-none bg-transparent px-2 py-2 text-base text-white placeholder:text-slate-400 focus:outline-none sm:text-lg"
      />
      <div className="flex flex-col gap-3 border-t border-white/10 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} onClick={() => setText(ex)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-brand-400 hover:text-white">
              {ex.replace("Je veux ", "").slice(0, 38)}…
            </button>
          ))}
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {!STATIC_SITE && (
            <button type="button" className="btn btn-ghost" onClick={() => router.push(`/demo${text.trim() ? `?probleme=${encodeURIComponent(text.trim().slice(0, 2000))}` : ""}`)}>
              Essayer sans compte
            </button>
          )}
          <button type="submit" className="btn btn-primary">
            {STATIC_SITE ? "✨ Créer mon mini-logiciel" : <>✨ Créer mon mini-logiciel avec l&apos;IA</>}
          </button>
        </div>
      </div>
    </form>
  );
}
