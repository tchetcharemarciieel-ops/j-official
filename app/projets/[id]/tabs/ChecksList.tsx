import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
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
                <li key={c.id} className={`rounded-xl border px-4 py-3 text-sm ${c.status === "pass" ? "border-green-200 bg-green-50" : c.status === "warn" ? "border-amber-200 bg-amber-50" : "border-red-200 bg-red-50"}`}>
                  <p className="flex items-center gap-2 font-medium text-slate-900">
                    {c.status === "pass" ? <CircleCheck className="h-4 w-4 shrink-0 text-green-600" aria-hidden /> : c.status === "warn" ? <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600" aria-hidden /> : <CircleX className="h-4 w-4 shrink-0 text-red-600" aria-hidden />}
                    <span className="sr-only">{c.status === "pass" ? "Réussi :" : c.status === "warn" ? "Avertissement :" : "Échec :"}</span>
                    {c.name}
                  </p>
                  <p className="mt-1 text-slate-700">{c.message}</p>
                  {c.fix && c.status !== "pass" && <p className="mt-1 text-xs text-slate-600">Correction proposée : {c.fix}{c.autoFixable ? " (automatique)" : ""}</p>}
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
