/** Éléments d'interface de l'administration (sobres, lisibles sur téléphone). */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, subtitle, children, actions, className = "" }: { title?: string; subtitle?: string; children: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-4 sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tile({ label, value, hint, tone = "default" }: { label: string; value: string | number; hint?: string; tone?: "default" | "warn" | "muted" }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "muted" ? "text-slate-400" : tone === "warn" ? "text-amber-700" : "text-slate-900"}`}>{typeof value === "number" ? value.toLocaleString("fr-FR") : value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

const TONES = {
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  blue: "bg-blue-50 text-blue-700",
  slate: "bg-slate-100 text-slate-700",
} as const;

export function Badge({ tone = "slate", children }: { tone?: keyof typeof TONES; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>;
}

/** Histogramme simple (valeurs réelles uniquement). */
export function BarChart({ points, unit, emptyText = "Pas encore de données." }: { points: { label: string; value: number }[]; unit?: string; emptyText?: string }) {
  const max = Math.max(1, ...points.map((p) => p.value));
  if (points.every((p) => p.value === 0)) return <p className="py-8 text-center text-sm text-slate-500">{emptyText}</p>;
  return (
    <div>
      <div className="flex h-36 items-end gap-1" role="img" aria-label={points.map((p) => `${p.label} : ${p.value}${unit ? ` ${unit}` : ""}`).join(", ")}>
        {points.map((p) => (
          <div key={p.label} className="group relative flex h-full flex-1 items-end" title={`${p.label} : ${p.value.toLocaleString("fr-FR")}${unit ? ` ${unit}` : ""}`}>
            <div className="w-full rounded-t bg-blue-600 transition-colors group-hover:bg-blue-700" style={{ height: `${p.value ? Math.max(4, (p.value / max) * 100) : 0}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-slate-500">
        {points.map((p, i) => <span key={p.label} className="flex-1 truncate text-center">{i % 2 === 0 || points.length <= 8 ? p.label : ""}</span>)}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">{children}</p>;
}

/** Tableau défilant horizontalement sur téléphone. */
export function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
          <tr>{head.map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export const fmtXaf = (n: number) => `${n.toLocaleString("fr-FR")} FCFA`;
