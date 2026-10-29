"use client";

import Link from "next/link";
import { Bot, Check, Copy, RotateCcw, SendHorizontal, Sparkles, User } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; text: string; suggestions?: string[]; problem?: string };

/** Mise en forme minimale et sûre (aucun HTML interprété) : titres, listes, gras, code. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/```/);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((b, i) =>
        i % 2 === 1 ? (
          <CodeBlock key={i} code={b.replace(/^[a-z]*\n/i, "")} />
        ) : (
          <Fragment key={i}>
            {b
              .split(/\n{2,}/)
              .filter((p) => p.trim())
              .map((p, j) => {
                const lines = p.split("\n");
                const isList = lines.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l) || !l.trim());
                if (isList)
                  return (
                    <ul key={j} className="space-y-1">
                      {lines.filter((l) => l.trim()).map((l, k) => {
                        const num = l.match(/^\s*(\d+)[.)]\s+/);
                        return (
                          <li key={k} className="flex gap-2">
                            <span className="shrink-0 text-slate-400">{num ? `${num[1]}.` : "•"}</span>
                            <span><Inline text={l.replace(/^\s*([-•*]|\d+[.)])\s+/, "")} /></span>
                          </li>
                        );
                      })}
                    </ul>
                  );
                return (
                  <p key={j}>
                    {lines.map((l, k) => (
                      <Fragment key={k}>
                        {k > 0 && <br />}
                        {/^#{1,4}\s/.test(l) ? <strong className="text-slate-900">{l.replace(/^#{1,4}\s/, "")}</strong> : <Inline text={l} />}
                      </Fragment>
                    ))}
                  </p>
                );
              })}
          </Fragment>
        ),
      )}
    </div>
  );
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((s, i) =>
        s.startsWith("**") && s.endsWith("**") ? <strong key={i} className="font-semibold text-slate-900">{s.slice(2, -2)}</strong> : s.startsWith("`") && s.endsWith("`") ? <code key={i} className="rounded bg-slate-100 px-1 text-[12px]">{s.slice(1, -1)}</code> : <Fragment key={i}>{s}</Fragment>,
      )}
    </>
  );
}

function CodeBlock({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-slate-900 p-3 text-[12px] text-slate-100"><code>{code.trim()}</code></pre>
      <button type="button" onClick={() => navigator.clipboard?.writeText(code.trim()).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))} className="absolute right-2 top-2 rounded-md bg-white/10 px-2 py-1 text-[11px] text-white hover:bg-white/20">{done ? "Copié" : "Copier"}</button>
    </div>
  );
}

/**
 * Conversation avec « MiniSoft RCA Assistant ». L'historique reste dans ce navigateur ;
 * l'assistant ne fait que conseiller et rédiger des brouillons.
 */
export function AssistantChat({ endpoint, storageKey, intro, starters, client = false, note }: { endpoint: string; storageKey: string; intro: string; starters: string[]; client?: boolean; note?: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<number | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setMsgs(JSON.parse(raw) as Msg[]);
    } catch {
      /* stockage indisponible : la conversation reste en mémoire */
    }
    loaded.current = true;
  }, [storageKey]);
  useEffect(() => {
    if (!loaded.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(msgs.slice(-40)));
    } catch {
      /* stockage plein */
    }
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, storageKey]);

  async function send(content: string) {
    const q = content.trim();
    if (!q || busy) return;
    setError("");
    const next: Msg[] = [...msgs, { role: "user", text: q }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.slice(-20).map((m) => ({ role: m.role, text: m.text.slice(0, 8000) })) }) });
      const body = (await res.json().catch(() => ({}))) as { reply?: string; suggestions?: string[]; problem?: string; error?: string; details?: string[] };
      if (!res.ok || !body.reply) throw new Error(body.details?.[0] ?? body.error ?? "L'assistant n'a pas pu répondre.");
      setMsgs([...next, { role: "assistant", text: body.reply, suggestions: body.suggestions ?? [], problem: body.problem || undefined }]);
    } catch (e) {
      setError(e instanceof Error && !/fetch|network|load failed/i.test(e.message) ? e.message : "Impossible de joindre le serveur. Vérifiez votre connexion puis réessayez.");
      setMsgs(msgs);
      setText(q);
    } finally {
      setBusy(false);
    }
  }

  const last = msgs[msgs.length - 1];
  return (
    <div className="flex min-h-[60vh] flex-col rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-blue-600 text-white"><Bot className="h-5 w-5" aria-hidden /></span>
          <div>
            <p className="font-semibold text-slate-900">MiniSoft RCA Assistant</p>
            <p className="text-xs text-slate-500">Conseils et brouillons uniquement : il ne publie et ne contacte personne.</p>
          </div>
        </div>
        {msgs.length > 0 && <button type="button" onClick={() => (setMsgs([]), setError(""))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100"><RotateCcw className="h-3.5 w-3.5" aria-hidden />Nouvelle conversation</button>}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {msgs.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">{intro}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {starters.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="tab-press rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 hover:border-blue-300 hover:bg-white">
                  <Sparkles className="mb-1 h-4 w-4 text-blue-600" aria-hidden />{s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`} style={{ animation: "fade-up .25s ease both" }}>
            {m.role === "assistant" && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700"><Bot className="h-4 w-4" aria-hidden /></span>}
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${m.role === "user" ? "bg-blue-600 text-sm text-white" : "border border-slate-200 bg-slate-50 text-slate-700"}`}>
              {m.role === "user" ? <p className="whitespace-pre-wrap text-sm">{m.text}</p> : <Rich text={m.text} />}
              {m.role === "assistant" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => navigator.clipboard?.writeText(m.text).then(() => (setCopied(i), setTimeout(() => setCopied(null), 1500)))} className="inline-flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-800">
                    {copied === i ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}{copied === i ? "Copié" : "Copier"}
                  </button>
                  {client && m.problem && (
                    <Link href={`/creer?probleme=${encodeURIComponent(m.problem.slice(0, 1800))}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700">
                      <Sparkles className="h-3.5 w-3.5" aria-hidden />Créer ce logiciel
                    </Link>
                  )}
                </div>
              )}
            </div>
            {m.role === "user" && <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><User className="h-4 w-4" aria-hidden /></span>}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="spinner !border-slate-300 !border-t-blue-600" aria-hidden />L&apos;assistant réfléchit… (jusqu&apos;à une minute)
          </div>
        )}
        {!busy && last?.role === "assistant" && last.suggestions && last.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {last.suggestions.map((s) => <button key={s} type="button" onClick={() => send(s)} className="tab-press rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-blue-300">{s}</button>)}
          </div>
        )}
        <div ref={end} />
      </div>

      {error && <p role="alert" className="mx-4 mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <form
        className="flex items-end gap-2 border-t border-slate-100 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
      >
        <label htmlFor="assistant-input" className="sr-only">Votre message</label>
        <textarea
          id="assistant-input"
          rows={2}
          maxLength={8000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(text);
            }
          }}
          placeholder="Écrivez votre message…"
          className="input min-h-[44px] flex-1 resize-y"
        />
        <button type="submit" disabled={busy || !text.trim()} className="btn btn-primary !px-3" aria-label="Envoyer"><SendHorizontal className="h-4 w-4" aria-hidden /></button>
      </form>
      {note && <p className="px-4 pb-3 text-[11px] text-slate-500">{note}</p>}
    </div>
  );
}
