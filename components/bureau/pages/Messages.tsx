"use client";

import { Hash, MessageSquare, Send, User } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { dmChannel, type Doc, type Message, type Project } from "@/lib/bureau/model";
import { useCtx } from "../context";
import { Empty, timeFmt } from "../ui";

/** Messagerie interne : discussion générale, messages privés et discussions de projet. */
export function Messages() {
  const c = useCtx();
  const me = c.s.me;
  const msgs = c.data.message as Doc<Message>[];
  const projects = c.data.project as Doc<Project>[];
  const others = c.s.members.filter((m) => m.active && m.id !== me);
  const channels = useMemo(() => [
    { id: "general", label: "Général", icon: Hash },
    ...projects.map((p) => ({ id: `project:${p.id}`, label: p.data.name, icon: Hash })),
    ...others.map((m) => ({ id: dmChannel(me, m.id), label: m.name, icon: User })),
  ], [projects, others, me]);
  const [ch, setCh] = useState(c.focus && channels.some((x) => x.id === c.focus) ? c.focus : "general");
  const [text, setText] = useState("");
  const list = useMemo(() => msgs.filter((m) => m.data.channel === ch).sort((a, b) => a.data.at.localeCompare(b.data.at)), [msgs, ch]);
  const unread = (id: string) => msgs.filter((m) => m.data.channel === id && m.data.from !== me && !m.data.read_by.includes(me)).length;
  const end = useRef<HTMLDivElement>(null);
  const unreadHere = unread(ch);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [list.length, ch]);
  useEffect(() => { if (unreadHere) void c.run("message.read", { channel: ch }, { quiet: true }); }, [unreadHere, ch]); // eslint-disable-line react-hooks/exhaustive-deps
  const cur = channels.find((x) => x.id === ch);
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    if (await c.run("message.send", { channel: ch, text: t }, { quiet: true })) setText("");
  };
  return (
    <div className="grid min-h-[60vh] gap-3 md:grid-cols-[14rem_1fr]">
      <div className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {channels.map((x) => {
          const n = unread(x.id);
          return (
            <button key={x.id} onClick={() => setCh(x.id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${ch === x.id ? "bg-[var(--brand)] text-white" : "bg-white text-slate-700 hover:bg-slate-100"}`}>
              <x.icon className="h-4 w-4 shrink-0" /><span className="max-w-[10rem] truncate md:max-w-none md:flex-1">{x.label}</span>{n > 0 && <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{n}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex min-h-[26rem] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold">{cur?.label ?? "Discussion"}</div>
        <div className="flex-1 space-y-2 overflow-y-auto p-4" style={{ maxHeight: "55vh" }}>
          {list.length === 0 ? <Empty icon={MessageSquare} title="Aucun message" text="Écrivez le premier message de cette discussion." /> : list.map((m) => {
            const mine = m.data.from === me;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : ""}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${mine ? "bg-[var(--brand)] text-white" : "bg-slate-100"}`}>
                  {!mine && <p className="text-xs font-semibold opacity-70">{c.memberName(m.data.from)}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.data.text}</p>
                  <p className="mt-0.5 text-[10px] opacity-60">{timeFmt(m.data.at)}</p>
                </div>
              </div>
            );
          })}
          <div ref={end} />
        </div>
        <form className="flex gap-2 border-t border-slate-100 p-3" onSubmit={(e) => (e.preventDefault(), void send())}>
          <input className="input flex-1" value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} placeholder="Votre message…" aria-label="Message" />
          <button className="btn btn-primary" disabled={!text.trim()} aria-label="Envoyer"><Send className="h-4 w-4" /></button>
        </form>
      </div>
    </div>
  );
}
