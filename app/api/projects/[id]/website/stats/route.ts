import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getAccess, HttpError } from "@/lib/access";
import { buildStats, defaultGranularity, GRANULARITIES, PERIODS, periodRange, type Granularity, type Period } from "@/lib/website/model";
import { getWebsite, loadEvents, purgeOld, realtimeVisitors } from "@/lib/website/server";

type Ctx = { params: Promise<{ id: string }> };

/** Statistiques du site de CE projet uniquement (appartenance vérifiée par getAccess). */
export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  await getAccess(id);
  const url = new URL(req.url);
  const period = (PERIODS as readonly string[]).includes(url.searchParams.get("period") ?? "") ? (url.searchParams.get("period") as Period) : "7d";
  const g = url.searchParams.get("g");
  const granularity = (GRANULARITIES as readonly string[]).includes(g ?? "") ? (g as Granularity) : defaultGranularity(period);
  if (period === "today" && granularity !== "hour" && granularity !== "day") throw new HttpError(400, "Découpage invalide pour aujourd'hui.");
  const site = await getWebsite(id);
  if (!site) return NextResponse.json({ stats: null });
  const now = Date.now();
  const { from, prevFrom } = periodRange(period, now);
  const [cur, prev, realtime] = await Promise.all([loadEvents(site.id, id, from, now), loadEvents(site.id, id, prevFrom, from - 1), realtimeVisitors(site.id, id, now)]);
  void purgeOld(site.id);
  const stats = buildStats(cur.events, prev.events, { period, granularity, from, to: now, realtime, truncated: cur.truncated });
  return NextResponse.json({ stats }, { headers: { "cache-control": "no-store" } });
});
