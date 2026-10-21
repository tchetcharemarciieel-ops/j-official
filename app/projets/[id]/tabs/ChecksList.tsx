import type { CheckResult } from "@/lib/checks";

export function ChecksList({ checks }: { checks: CheckResult[] }) {
  const groups = Array.from(new Set(checks.map((c) => c.category)));
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g}</h3>
          <ul className="mt-2 space-y-2">
            {checks
              .filter((c) => c.category === g)
              .map((c) => (
                <li key={c.id} className={`rounded-xl border px-4 py-3 text-sm ${c.status === "pass" ? "border-emerald-500/20 bg-emerald-500/5" : c.status === "warn" ? "border-amber-400/30 bg-amber-400/5" : "border-red-500/40 bg-red-500/10"}`}>
                  <p className="font-medium text-white">
                    {c.status === "pass" ? "✅" : c.status === "warn" ? "⚠️" : "❌"} {c.name}
                  </p>
                  <p className="mt-1 text-slate-300">{c.message}</p>
                  {c.fix && c.status !== "pass" && <p className="mt-1 text-xs text-slate-400">Correction proposée : {c.fix}{c.autoFixable ? " (automatique)" : ""}</p>}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
