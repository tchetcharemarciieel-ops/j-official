import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { HttpError } from "../access";
import { audit } from "../audit";
import { adminClient } from "../supabase/admin";
import { assertPublicUrl } from "../webhooks";
import { BOT_RE, countryOf, detectFromHtml, deviceOf, isEventType, normalizeSiteUrl, originMatches, type Detected, type SiteEvent } from "./model";

export type Website = {
  id: string;
  project_id: string;
  url: string;
  host: string;
  site_key: string;
  status: "pending" | "connected" | "error";
  last_error: string | null;
  detected: Partial<Detected> & { reachable?: boolean; httpStatus?: number; checkedAt?: string };
  verified_at: string | null;
  connected_at: string | null;
  last_event_at: string | null;
};

export async function getWebsite(projectId: string): Promise<Website | null> {
  const { data } = await adminClient().from("websites").select("*").eq("project_id", projectId).maybeSingle();
  return (data as Website | null) ?? null;
}

/**
 * Lit la page d'accueil du site (adresse publique uniquement, 3 redirections au plus, 1 Mo) pour
 * vérifier qu'il répond et repérer ce qui est déjà installé : code MiniSoft, outils d'analyse, plateforme.
 */
export async function inspectSite(url: string, siteKey: string): Promise<{ ok: true; status: number; finalUrl: string; detected: Detected } | { ok: false; error: string }> {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    try {
      await assertPublicUrl(current.replace(/^http:/, "https:"));
    } catch (e) {
      return { ok: false, error: e instanceof HttpError ? e.message : "Adresse refusée." };
    }
    let res: Response;
    try {
      res = await fetch(current, { redirect: "manual", headers: { "user-agent": "MiniSoft-RCA-Site-Check/1.0 (+https://minisoft-rca.onrender.com)", accept: "text/html" }, signal: AbortSignal.timeout(8000), cache: "no-store" });
    } catch {
      return { ok: false, error: "Le site ne répond pas (délai dépassé ou adresse introuvable). Vérifiez l'adresse." };
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, current).toString();
      continue;
    }
    if (!res.ok) return { ok: false, error: `Le site a répondu avec une erreur (code ${res.status}).` };
    const reader = res.body?.getReader();
    let html = "";
    if (reader) {
      const dec = new TextDecoder();
      while (html.length < 1_000_000) {
        const { done, value } = await reader.read();
        if (done) break;
        html += dec.decode(value, { stream: true });
      }
      void reader.cancel().catch(() => undefined);
    }
    return { ok: true, status: res.status, finalUrl: current, detected: detectFromHtml(html, siteKey) };
  }
  return { ok: false, error: "Trop de redirections sur ce site." };
}

/** Enregistre (ou remplace) le site de l'entreprise et le vérifie. Le statut « connecté » ne vient que d'une vraie visite. */
export async function connectWebsite(projectId: string, rawUrl: string, actorId: string): Promise<Website> {
  const norm = normalizeSiteUrl(rawUrl);
  if (!norm) throw new HttpError(400, "Adresse invalide. Exemple : https://www.mon-restaurant.cf");
  const db = adminClient();
  const existing = await getWebsite(projectId);
  const sameSite = existing && existing.host === norm.host;
  const siteKey = sameSite ? existing.site_key : `ms_${randomBytes(12).toString("base64url")}`;
  const check = await inspectSite(norm.url, siteKey);
  const now = new Date().toISOString();
  const row = {
    project_id: projectId,
    url: norm.url,
    host: norm.host,
    site_key: siteKey,
    status: check.ok ? (sameSite && existing.status === "connected" ? "connected" : "pending") : "error",
    last_error: check.ok ? null : check.error,
    detected: check.ok ? { ...check.detected, reachable: true, httpStatus: check.status, checkedAt: now } : { reachable: false, checkedAt: now },
    verified_at: check.ok ? now : null,
    connected_at: sameSite ? existing.connected_at : null,
    last_event_at: sameSite ? existing.last_event_at : null,
    created_by: actorId,
    updated_at: now,
  };
  if (existing && !sameSite) await db.from("websites").delete().eq("id", existing.id); // nouveau site : on repart de zéro
  const { data, error } = sameSite ? await db.from("websites").update(row).eq("id", existing.id).select("*").single() : await db.from("websites").insert(row).select("*").single();
  if (error || !data) throw new HttpError(500, "Enregistrement du site impossible. Réessayez.");
  await audit(sameSite ? "website.verified" : "website.connected", { projectId, actorId, details: { host: norm.host, reachable: check.ok } });
  return data as Website;
}

export async function disconnectWebsite(projectId: string, actorId: string) {
  const site = await getWebsite(projectId);
  if (!site) return;
  // Les événements sont supprimés avec le site (clé étrangère « on delete cascade »).
  await adminClient().from("websites").delete().eq("id", site.id);
  await audit("website.disconnected", { projectId, actorId, level: "warning", details: { host: site.host } });
}

// ---------- Collecte ----------

function hashSecret() {
  return process.env.PAYMENT_SECRETS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_GATEWAY_KEY || "minisoft";
}
/** Empreinte du visiteur, à sel MENSUEL : impossible de remonter à l'adresse IP, et elle change chaque mois. */
export function visitorHash(siteId: string, ip: string, ua: string, now = new Date()) {
  const month = now.toISOString().slice(0, 7);
  return createHash("sha256").update(`${hashSecret()}:visitor:${month}:${siteId}:${ip}:${ua}`).digest("base64url").slice(0, 24);
}

export type CollectInput = { k?: unknown; e?: unknown; p?: unknown; r?: unknown; tz?: unknown; d?: unknown };
export type CollectResult = { ok: true } | { ok: false; status: number; reason: string };

export async function collect(input: CollectInput, h: { origin: string | null; referer: string | null; ua: string; ip: string; country: string | null }): Promise<CollectResult> {
  if (typeof input.k !== "string" || !/^ms_[A-Za-z0-9_-]{10,40}$/.test(input.k)) return { ok: false, status: 400, reason: "clé" };
  if (!isEventType(input.e)) return { ok: false, status: 400, reason: "type" };
  if (!h.ua || BOT_RE.test(h.ua)) return { ok: true }; // robots ignorés sans erreur
  const db = adminClient();
  const { data: site } = await db.from("websites").select("id,project_id,host,status").eq("site_key", input.k).maybeSingle();
  if (!site) return { ok: false, status: 404, reason: "site" };
  // Seul le site connecté peut envoyer des visites (contrôle du domaine d'origine).
  if (!originMatches(h.origin ?? h.referer, site.host as string)) return { ok: false, status: 403, reason: "origine" };
  const now = new Date();
  const visitor = visitorHash(site.id as string, h.ip, h.ua, now);
  const { data: last } = await db.from("web_events").select("session,created_at").eq("site_id", site.id).eq("visitor", visitor).gte("created_at", new Date(now.getTime() - 30 * 60_000).toISOString()).order("created_at", { ascending: false }).limit(1);
  const session = last?.[0]?.session ?? randomBytes(9).toString("base64url");
  const path = (typeof input.p === "string" ? input.p : "/").split("#")[0]!.split("?")[0]!.slice(0, 300) || "/";
  let referrer: string | null = null;
  if (typeof input.r === "string" && input.r) {
    try {
      const rh = new URL(input.r).hostname.toLowerCase().replace(/^www\./, "");
      if (rh && !originMatches(`https://${rh}`, site.host as string)) referrer = rh.slice(0, 200);
    } catch {
      /* provenance illisible : ignorée */
    }
  }
  const duration = input.e === "leave" ? Math.max(0, Math.min(1800, Math.round(Number(input.d) || 0))) : null;
  const { error } = await db.from("web_events").insert({ site_id: site.id, project_id: site.project_id, type: input.e, path, visitor, session, device: deviceOf(h.ua), country: countryOf(input.tz, h.country), referrer, duration });
  if (error) return { ok: false, status: 500, reason: "enregistrement" };
  // Première visite réellement reçue depuis le site : la connexion est établie.
  const patch: Record<string, unknown> = { last_event_at: now.toISOString() };
  if (site.status !== "connected") Object.assign(patch, { status: "connected", connected_at: now.toISOString(), last_error: null });
  await db.from("websites").update(patch).eq("id", site.id);
  return { ok: true };
}

// ---------- Lecture des événements (page par page, limite de sécurité) ----------

const PAGE = 1000;
const MAX_ROWS = 200_000;
export async function loadEvents(siteId: string, projectId: string, from: number, to: number): Promise<{ events: SiteEvent[]; truncated: boolean }> {
  const db = adminClient();
  const out: SiteEvent[] = [];
  for (let offset = 0; offset < MAX_ROWS; offset += PAGE) {
    const { data, error } = await db
      .from("web_events")
      .select("created_at,type,path,visitor,session,device,country,referrer,duration")
      .eq("site_id", siteId)
      .eq("project_id", projectId) // double contrôle : jamais les événements d'une autre entreprise
      .gte("created_at", new Date(from).toISOString())
      .lte("created_at", new Date(to).toISOString())
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new HttpError(500, "Lecture des statistiques impossible.");
    out.push(...((data ?? []) as SiteEvent[]));
    if (!data || data.length < PAGE) return { events: out, truncated: false };
  }
  return { events: out, truncated: true };
}

export async function realtimeVisitors(siteId: string, projectId: string, now = Date.now()) {
  const { data } = await adminClient().from("web_events").select("visitor").eq("site_id", siteId).eq("project_id", projectId).gte("created_at", new Date(now - 5 * 60_000).toISOString()).limit(5000);
  return new Set((data ?? []).map((r) => r.visitor as string)).size;
}

/** Conservation : 13 mois, puis suppression (nettoyage occasionnel lors de la consultation). */
export async function purgeOld(siteId: string) {
  if (Math.random() > 0.05) return;
  await adminClient().from("web_events").delete().eq("site_id", siteId).lt("created_at", new Date(Date.now() - 400 * 86_400_000).toISOString());
}
