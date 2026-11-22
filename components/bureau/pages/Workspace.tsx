"use client";

import { Box, ExternalLink, LayoutList, Map as MapIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import { BOARD_SLOT, SLOTS } from "@/lib/workspace";
import { PAGE_LABELS, projectLate, today, type Doc, type Page, type Project, type Space, type Task, type Appointment, type Message, taskLate } from "@/lib/bureau/model";
import { Plan2D } from "@/components/runtime/workspace/Plan2D";
import type { SceneProps, SceneStation } from "@/components/runtime/workspace/types";
import { useCtx } from "../context";
import { Card } from "../ui";

const Scene3D = dynamic(() => import("@/components/runtime/workspace/Scene3D"), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-500">Chargement du bureau 3D…</div>,
});

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}
const webgl = () => { try { const c = document.createElement("canvas"); return Boolean(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };

const KIND_MAP: Record<Space["kind"], SceneStation["kind"]> = { reception: "reception", desk: "desk", meeting: "meeting", stock: "stock", counter: "counter", cashier: "cashier" };
type View = "3d" | "2d" | "classic";

/** Bureau virtuel : 3D, plan 2D ou vue classique. Chaque espace ouvre les pages que votre poste autorise. */
export function Workspace() {
  const c = useCtx();
  const [view, setView] = useState<View>("2d");
  const [crashed, setCrashed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem("bureau-view") as View | null;
      if (saved === "classic" || saved === "2d" || (saved === "3d" && webgl())) setView(saved);
      else if (webgl() && !((navigator.hardwareConcurrency ?? 4) <= 2)) setView("3d");
    } catch { /* stockage indisponible */ }
  }, []);
  const choose = (v: View) => { setView(v); try { localStorage.setItem("bureau-view", v); } catch { /* ignoré */ } };
  const day = today();
  const spaces = c.settings.spaces.filter((s) => s.enabled);
  const allowed = (p: Page) => (p === "dashboard" || p === "workspace" || p === "assistant" || p === "presences" || p === "messagerie" ? true : c.may(p === "metier" ? "metier" : (p as never)));
  const tasks = c.data.task as Doc<Task>[];
  const projects = c.data.project as Doc<Project>[];
  const appts = (c.data.appointment as Doc<Appointment>[]).filter((a) => a.data.status !== "annule" && a.data.start.slice(0, 10) === day);
  const unread = (c.data.message as Doc<Message>[]).filter((m) => m.data.from !== c.s.me && !m.data.read_by.includes(c.s.me)).length;
  const lateT = tasks.filter((t) => taskLate(t.data, day)).length;
  const lateP = projects.filter((p) => projectLate(p.data, day)).length;

  const badgeFor = (s: Space) => {
    const n = (k: Page) => (s.links.includes(k) ? 1 : 0);
    if (n("agenda") && appts.length) return `${appts.length} rendez-vous aujourd'hui`;
    if (n("projets") && lateT + lateP) return `${lateT + lateP} en retard`;
    if (n("messagerie") && unread) return `${unread} non lu(s)`;
    return null;
  };
  const stations: SceneStation[] = useMemo(() => {
    const out: SceneStation[] = [{ id: "board", kind: "stats_board", label: c.settings.name, target: "__dashboard", ...BOARD_SLOT, stats: null, crew: [] }];
    spaces.slice(0, SLOTS.length).forEach((s, i) => {
      const bd = badgeFor(s);
      out.push({ id: s.id, kind: KIND_MAP[s.kind], label: s.name, target: s.id, ...SLOTS[i]!, stats: bd ? { total: 0, today: 0, open: 1, openLabel: bd, alert: 0, amountToday: null } : null, crew: [] });
    });
    return out;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.settings.spaces, c.settings.name, appts.length, lateT, lateP, unread]);
  const props: SceneProps = {
    stations, layout: "bureau", title: c.settings.name, demo: c.mode === "demo", freeSlots: SLOTS.slice(spaces.length),
    kpis: [{ label: "RDV aujourd'hui", value: appts.length, unit: undefined }, { label: "Tâches en retard", value: lateT, unit: undefined }, { label: "Messages non lus", value: unread, unit: undefined }],
    onOpen: (t) => (t === "__dashboard" ? c.go("dashboard") : setOpen(t)),
  };
  const sel = spaces.find((s) => s.id === open);
  const show3d = view === "3d" && !crashed;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {([["3d", "3D", Box], ["2d", "Plan 2D", MapIcon], ["classic", "Classique", LayoutList]] as const).map(([k, l, Icon]) => (
            <button key={k} onClick={() => choose(k)} aria-pressed={view === k} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${view === k ? "bg-white font-semibold shadow-sm" : "text-slate-600"}`}><Icon className="h-4 w-4" />{l}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500">Touchez un espace pour voir ce qu&apos;il contient. Personnalisable dans Réglages.</p>
      </div>
      {crashed && view === "3d" && <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">La 3D ne s&apos;est pas affichée sur cet appareil : utilisez le plan 2D ou la vue classique.</p>}
      {view === "classic" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((s) => (
            <button key={s.id} onClick={() => setOpen(s.id)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-[var(--brand)]">
              <p className="font-semibold">{s.name}</p>
              <p className="mt-1 text-xs text-slate-500">{s.links.filter(allowed).map((l) => PAGE_LABELS[l]).join(" · ") || "Aucune page autorisée"}</p>
              {badgeFor(s) && <p className="mt-2 text-xs font-medium text-[var(--brand)]">{badgeFor(s)}</p>}
            </button>
          ))}
        </div>
      ) : (
        <div className={`overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${show3d ? "h-[56vh] min-h-[340px]" : ""}`}>
          {show3d ? <Boundary onError={() => setCrashed(true)}><Scene3D {...props} /></Boundary> : <Plan2D {...props} />}
        </div>
      )}
      {sel && (
        <Card title={sel.name} action={<button className="text-sm text-slate-500 hover:underline" onClick={() => setOpen(null)}>Fermer</button>}>
          <div className="flex flex-wrap gap-2">
            {sel.links.map((l) => allowed(l) ? <button key={l} className="btn btn-ghost" onClick={() => c.go(l)}><ExternalLink className="h-4 w-4" /> {PAGE_LABELS[l]}</button> : <span key={l} className="rounded-xl border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-400" title="Accès non autorisé pour votre poste">{PAGE_LABELS[l]} (non autorisé)</span>)}
            {!sel.links.length && <p className="text-sm text-slate-500">Aucune page reliée à cet espace. Reliez-en dans Réglages.</p>}
          </div>
        </Card>
      )}
    </div>
  );
}
