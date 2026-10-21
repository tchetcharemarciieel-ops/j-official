"use client";

import { useEffect, useState } from "react";

const SCENARIOS = [
  { prompt: "Je veux gérer les commandes et les stocks de mon restaurant", name: "Chez Mama", color: "#f97316", modules: ["🧾 Commandes", "📦 Stocks", "💸 Dépenses", "👥 Clients"], kpi: ["1 245 000 FCFA", "3 produits à commander"] },
  { prompt: "Je veux suivre les réparations de mon garage", name: "Garage Ndi", color: "#0ea5e9", modules: ["🔧 Réparations", "👥 Clients", "📄 Factures", "📦 Pièces"], kpi: ["8 véhicules en atelier", "2 factures à payer"] },
  { prompt: "Je veux gérer les élèves et les paiements de mon école", name: "École Les Palmiers", color: "#f59e0b", modules: ["🎓 Élèves", "🧮 Paiements", "🧑‍💼 Personnel"], kpi: ["312 élèves", "4 850 000 FCFA encaissés"] },
];

/** Illustration animée : saisie du besoin → construction → logiciel prêt. */
export function BuildDemo() {
  const [i, setI] = useState(0);
  const [typed, setTyped] = useState(0);
  const [phase, setPhase] = useState<"type" | "build" | "done">("type");
  const s = SCENARIOS[i]!;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setTyped(s.prompt.length);
      setPhase("done");
      return;
    }
    let t: ReturnType<typeof setTimeout>;
    if (phase === "type") {
      t = typed < s.prompt.length ? setTimeout(() => setTyped((n) => n + 1), 35) : setTimeout(() => setPhase("build"), 500);
    } else if (phase === "build") {
      t = setTimeout(() => setPhase("done"), 1800);
    } else {
      t = setTimeout(() => {
        setI((n) => (n + 1) % SCENARIOS.length);
        setTyped(0);
        setPhase("type");
      }, 3500);
    }
    return () => clearTimeout(t);
  }, [phase, typed, s.prompt.length]);

  return (
    <div className="glass relative mx-auto w-full max-w-xl rounded-2xl p-4 shadow-2xl animate-float" aria-hidden="true">
      <div className="mb-3 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
        <span className="ml-3 truncate text-xs text-slate-600">minisoft-rca.app/apps/{s.name.toLowerCase().replace(/\s+/g, "-")}</span>
      </div>
      <div className="rounded-xl bg-white/70 p-3 text-sm text-slate-800">
        <span className="text-blue-700">› </span>
        {s.prompt.slice(0, typed)}
        {phase === "type" && <span className="caret">▍</span>}
      </div>
      <div className="mt-3 min-h-44 rounded-xl border border-slate-100 bg-slate-50 p-3">
        {phase === "type" && <p className="text-xs text-slate-500">En attente de votre description…</p>}
        {phase === "build" && (
          <div className="space-y-2">
            <p className="text-xs text-blue-700">L&apos;IA construit votre solution…</p>
            {["Analyse du besoin", "Tables et champs", "Tableau de bord", "Tests automatiques"].map((step, k) => (
              <div key={step} className="flex items-center gap-2 text-xs text-slate-600">
                <div className="h-1.5 flex-1 overflow-hidden rounded bg-slate-50">
                  <div className="h-full bg-blue-600 animate-build" style={{ animationDelay: `${k * 150}ms` }} />
                </div>
                <span className="w-32">{step}</span>
              </div>
            ))}
          </div>
        )}
        {phase === "done" && (
          <div className="flex gap-3">
            <div className="w-28 shrink-0 space-y-1 border-r border-slate-100 pr-2">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                <span className="grid h-5 w-5 place-items-center rounded text-[9px]" style={{ background: s.color }}>
                  {s.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="truncate">{s.name}</span>
              </div>
              <div className="rounded px-1.5 py-1 text-[11px] text-slate-900" style={{ background: `${s.color}33` }}>📊 Tableau de bord</div>
              {s.modules.map((m) => (
                <div key={m} className="px-1.5 py-1 text-[11px] text-slate-600">{m}</div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-2 content-start gap-2">
              {s.kpi.map((k) => (
                <div key={k} className="rounded-lg bg-slate-50 p-2 text-[11px] font-semibold text-slate-900">{k}</div>
              ))}
              <div className="col-span-2 flex h-16 items-end gap-1 rounded-lg bg-slate-50 p-2">
                {[40, 65, 50, 80, 60, 95].map((h, k) => (
                  <div key={k} className="flex-1 rounded-t" style={{ height: `${h}%`, background: s.color, opacity: 0.4 + k * 0.1 }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
