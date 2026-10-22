/** Regroupements pour les graphiques de l'administration (calculés sur les vraies lignes). */

const DAY = 86400000;

/** Lundi 00:00 (heure locale du serveur) de la semaine contenant `d`. */
function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function weeklyCounts(dates: string[], weeks = 12, now = new Date()): { label: string; value: number }[] {
  const start = weekStart(new Date(now.getTime() - (weeks - 1) * 7 * DAY));
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start.getTime() + i * 7 * DAY);
    return { start: d.getTime(), label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), value: 0 };
  });
  for (const iso of dates) {
    const t = new Date(iso).getTime();
    const i = Math.floor((t - start.getTime()) / (7 * DAY));
    if (i >= 0 && i < weeks) buckets[i]!.value++;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

export function monthlySums(rows: { at: string; amount: number }[], months = 6, now = new Date()): { label: string; value: number }[] {
  const out = Array.from({ length: months }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), value: 0 };
  });
  for (const r of rows) {
    const d = new Date(r.at);
    const b = out.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.value += r.amount;
  }
  return out.map(({ label, value }) => ({ label, value }));
}

export function sinceDays(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * DAY).toISOString();
}
