"use client";

import { Bot, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/fetcher";
import { useCtx } from "../context";
import { Card } from "../ui";

type Turn = { role: "user" | "assistant"; text: string; basis?: string; engine?: string };
const START = ["Fais-moi un résumé de l'activité", "Quelles tâches et quels projets sont en retard ?", "Aide-moi à organiser ma journée", "Où en sont nos finances ce mois-ci ?", "Prépare un compte rendu de réunion (je te donne mes notes)"];

/** MiniSoft AI : s'appuie sur les données que votre poste peut voir ; n'invente rien et ne modifie rien. */
export function Assistant() {
  const c = useCtx();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [sugg, setSugg] = useState(START);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [turns, busy]);
  const send = async (t: string) => {
    const msg = t.trim();
    if (!msg || busy) return;
    const next: Turn[] = [...turns, { role: "user", text: msg }];
    setTurns(next); setText(""); setBusy(true);
    try {
      const r = await api<{ reply: string; basis: string; engine: string; suggestions: string[] }>(`/api/apps/${c.projectId}/bureau/assistant`, { body: { mode: c.mode, turns: next.map((x) => ({ role: x.role, text: x.text })) } });
      setTurns([...next, { role: "assistant", text: r.reply, basis: r.basis, engine: r.engine }]);
      setSugg(r.suggestions);
    } catch (e) {
      setTurns([...next, { role: "assistant", text: e instanceof Error ? e.message : "Réponse impossible." }]);
    } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto max-w-3xl">
      <Card title={<span className="flex items-center gap-2"><Bot className="h-5 w-5 text-[var(--brand)]" /> MiniSoft AI</span>} subtitle="Résumés, retards, organisation, comptes rendus. Je ne vois que ce que votre poste autorise, je n'invente aucun chiffre ni donnée client, et je ne modifie rien.">
        <div className="min-h-[40vh] space-y-3">
          {turns.length === 0 && <div className="flex flex-wrap gap-2 pt-2">{sugg.map((s) => <button key={s} onClick={() => void send(s)} className="rounded-full border border-slate-300 px-3 py-1.5 text-sm hover:border-[var(--brand)]">{s}</button>)}</div>}
          {turns.map((t, i) => (
            <div key={i} className={`flex ${t.role === "user" ? "justify-end" : ""}`}>
              <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${t.role === "user" ? "bg-[var(--brand)] text-white" : "bg-slate-100 text-slate-900"}`}>
                {t.text}
                {t.basis && <p className="mt-2 border-t border-slate-300/60 pt-1 text-xs text-slate-500">Base : {t.basis}{t.engine === "ai" ? " (rédigé par l'IA)" : ""}</p>}
              </div>
            </div>
          ))}
          {busy && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours…</div>}
          <div ref={end} />
        </div>
        {turns.length > 0 && !busy && <div className="mt-3 flex flex-wrap gap-2">{sugg.slice(0, 4).map((s) => <button key={s} onClick={() => void send(s)} className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:border-[var(--brand)]">{s}</button>)}</div>}
        <form className="mt-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), void send(text))}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Posez votre question ou collez vos notes de réunion…" maxLength={2000} aria-label="Votre question" />
          <button className="btn btn-primary" disabled={busy || !text.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></button>
        </form>
      </Card>
    </div>
  );
}
