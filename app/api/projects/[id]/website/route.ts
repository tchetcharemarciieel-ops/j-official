import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, readJson, route } from "@/lib/api";
import { getAccess } from "@/lib/access";
import { siteOrigin } from "@/lib/site-origin";
import { sectorProfile, trackerSnippet } from "@/lib/website/model";
import { connectWebsite, disconnectWebsite, getWebsite, type Website } from "@/lib/website/server";

type Ctx = { params: Promise<{ id: string }> };

/** Ce que voit le tableau de bord : jamais la clé seule hors du code de suivi de ce projet. */
function view(site: Website | null, origin: string, sector: string, canManage: boolean) {
  const profile = sectorProfile(sector);
  if (!site) return { site: null, profile, canManage };
  const quietDays = site.last_event_at ? Math.floor((Date.now() - Date.parse(site.last_event_at)) / 86_400_000) : null;
  return {
    site: { url: site.url, host: site.host, status: site.status, lastError: site.last_error, detected: site.detected, verifiedAt: site.verified_at, connectedAt: site.connected_at, lastEventAt: site.last_event_at, quietDays, snippet: canManage ? trackerSnippet(origin, site.site_key) : null },
    profile,
    canManage,
  };
}

export const GET = route(async (req, { params }: Ctx) => {
  const { id } = await params;
  const { project, role } = await getAccess(id);
  const canManage = role === "owner" || role === "admin";
  return NextResponse.json(view(await getWebsite(id), siteOrigin(req), project.sector, canManage), { headers: { "cache-control": "no-store" } });
});

/** Connecter (ou revérifier) le site : adresse vérifiée, site interrogé, code de suivi fourni. */
export const POST = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  const input = z.object({ url: z.string().trim().min(4, "Saisissez l'adresse de votre site.").max(300) }).parse(await readJson(req, 4000));
  const site = await connectWebsite(id, input.url, profile.id);
  return NextResponse.json(view(site, siteOrigin(req), project.sector, true));
});

export const DELETE = route(async (req, { params }: Ctx) => {
  assertSameOrigin(req);
  const { id } = await params;
  const { profile, project } = await getAccess(id, ["owner", "admin"]);
  await disconnectWebsite(id, profile.id);
  return NextResponse.json(view(null, siteOrigin(req), project.sector, true));
});
