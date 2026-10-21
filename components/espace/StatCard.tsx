import Link from "next/link";
import { CountUp } from "./CountUp";

export function StatCard({ label, value, icon, hint, href, tone = "brand", delay = 0 }: { label: string; value: number; icon: string; hint?: string; href?: string; tone?: "brand" | "green" | "amber" | "sky"; delay?: number }) {
  const tones = { brand: "from-brand-500/25", green: "from-emerald-500/20", amber: "from-amber-500/20", sky: "from-sky-500/20" };
  const body = (
    <div className={`glass group relative h-full overflow-hidden rounded-2xl p-5 transition duration-300 hover:-translate-y-0.5 hover:border-white/20 animate-fade-up`} style={{ animationDelay: `${delay}ms` }}>
      <div className={`pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br ${tones[tone]} to-transparent blur-xl transition group-hover:scale-125`} />
      <p className="flex items-center gap-2 text-sm text-slate-400"><span aria-hidden>{icon}</span>{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-white"><CountUp value={value} /></p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}
