"use client";

import { computeWidget, type Row } from "@/lib/stats";
import type { AppSpec, Widget } from "@/lib/spec";

const fmt = (n: number, unit?: string) => `${n.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`;

function monthLabel(k: string) {
  const [y, m] = k.split("-");
  if (!y || !m) return k;
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}

export function WidgetCard({ spec, widget, rows, onOpen }: { spec: AppSpec; widget: Widget; rows: Row[]; onOpen?: (entity: string) => void }) {
  const r = computeWidget(spec, widget, rows);
  const wide = r.kind !== "number";
  return (
    <section className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${wide ? "sm:col-span-2" : ""}`} aria-label={widget.label}>
      <h3 className="text-sm font-medium text-slate-500">{widget.label}</h3>
      {r.kind === "number" && <p className="mt-2 text-2xl font-bold text-slate-900">{fmt(r.value, r.unit)}</p>}
      {r.kind === "series" &&
        (r.points.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Pas encore de données.</p>
        ) : widget.type === "monthly" ? (
          <div className="mt-3">
            <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`${widget.label} : ${r.points.map((p) => `${monthLabel(p.label)} ${fmt(p.value, r.unit)}`).join(", ")}`}>
              {r.points.map((p) => {
                const max = Math.max(...r.points.map((x) => x.value), 1);
                return (
                  <div key={p.label} className="group relative flex h-full flex-1 flex-col items-center justify-end" title={`${monthLabel(p.label)} : ${fmt(p.value, r.unit)}`}>
                    <div className="w-full rounded-t-md" style={{ height: `${Math.max(4, (p.value / max) * 100)}%`, background: "var(--app-primary)" }} />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex gap-1.5 text-[10px] text-slate-400">
              {r.points.map((p) => (
                <span key={p.label} className="flex-1 truncate text-center">{monthLabel(p.label)}</span>
              ))}
            </div>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {r.points.slice(0, 6).map((p) => {
              const total = r.points.reduce((a, x) => a + x.value, 0) || 1;
              return (
                <li key={p.label} className="text-sm">
                  <div className="flex justify-between text-slate-700">
                    <span className="truncate">{p.label}</span>
                    <span className="font-medium">{p.value}</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full" style={{ width: `${(p.value / total) * 100}%`, background: "var(--app-primary)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        ))}
      {r.kind === "list" &&
        (r.items.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">{widget.type === "low_stock" ? "Aucun élément sous le seuil. 👍" : "Aucune fiche pour l'instant."}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {r.items.map((it) => (
              <li key={it.id} className="flex justify-between py-2 text-sm">
                <button className="truncate text-left text-slate-800 hover:underline" onClick={() => onOpen?.(widget.entity)}>{it.label}</button>
                <span className={widget.type === "low_stock" ? "font-medium text-red-600" : "text-slate-400"}>{it.detail}</span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
