"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CircleAlert, Info, RefreshCw, Send, Users, type LucideIcon } from "lucide-react";
import { api } from "@/lib/fetcher";

type Notif = { id: string; type: "update" | "error" | "publish" | "team" | "info"; title: string; body: string; link: string; read_at: string | null; created_at: string };

const ICON: Record<Notif["type"], LucideIcon> = { update: RefreshCw, error: CircleAlert, publish: Send, team: Users, info: Info };

function ago(d: string) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function NotifIcon({ type }: { type: Notif["type"] }) {
  const Icon = ICON[type];
  return <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${type === "error" ? "text-red-600" : "text-slate-500"}`} aria-hidden />;
}

/** Cloche de notifications : mises à jour, erreurs, publications et équipe. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const box = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ notifications: Notif[]; unread: number }>("/api/notifications");
      setItems(r.notifications);
      setUnread(r.unread);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notifications indisponibles.");
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markAll() {
    await api("/api/notifications", { body: {} }).catch(() => {});
    setUnread(0);
    setItems((l) => l?.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })) ?? null);
  }

  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50" aria-label={`Notifications${unread ? ` (${unread} non lue${unread > 1 ? "s" : ""})` : ""}`} aria-expanded={open}>
        <Bell className="h-5 w-5" aria-hidden />
        {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[60] w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg" style={{ animation: "pop-in 0.18s ease-out" }}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="font-semibold text-slate-900">Notifications</p>
            {unread > 0 && <button onClick={markAll} className="text-xs text-blue-700 hover:underline">Tout marquer comme lu</button>}
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {error && <p className="p-4 text-sm text-red-700">{error}</p>}
            {!error && items === null && <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}</div>}
            {items?.length === 0 && <p className="p-6 text-center text-sm text-slate-600">Aucune notification pour l&apos;instant. Vous serez prévenu ici des nouvelles versions, publications et erreurs.</p>}
            <ul>
              {items?.map((n) => (
                <li key={n.id}>
                  <Link href={n.link || "/espace"} onClick={() => setOpen(false)} className={`flex gap-3 border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 ${n.read_at ? "opacity-70" : ""}`}>
                    <NotifIcon type={n.type} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm ${n.type === "error" ? "text-red-700" : "text-slate-900"} ${n.read_at ? "" : "font-semibold"}`}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block truncate text-xs text-slate-600">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-slate-500">{ago(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label="Non lue" />}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
