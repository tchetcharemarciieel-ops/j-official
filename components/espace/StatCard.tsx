import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { CountUp } from "./CountUp";

export function StatCard({ label, value, icon: Icon, hint, href, tone = "brand" }: { label: string; value: number; icon: LucideIcon; hint?: string; href?: string; tone?: "brand" | "green" | "amber" | "sky"; delay?: number }) {
  const tones = { brand: "text-blue-600", green: "text-green-600", amber: "text-amber-600", sky: "text-sky-600" };
  const body = (
    <div className={`glass h-full rounded-2xl p-5 ${href ? "lift" : ""}`}>
      <p className="flex items-center gap-2 text-sm text-slate-600"><Icon className={`h-4 w-4 ${tones[tone]}`} aria-hidden />{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-slate-900"><CountUp value={value} /></p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
