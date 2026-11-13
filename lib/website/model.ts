/**
 * Site Internet connecté : règles communes au serveur, au tableau de bord et aux tests.
 * Aucune donnée n'est inventée : chaque chiffre vient d'événements réellement reçus du site.
 */

export const PERIODS = ["today", "7d", "30d", "12m"] as const;
export type Period = (typeof PERIODS)[number];
export const GRANULARITIES = ["hour", "day", "week", "month"] as const;
export type Granularity = (typeof GRANULARITIES)[number];
export const PERIOD_LABELS: Record<Period, string> = { today: "Aujourd'hui", "7d": "7 derniers jours", "30d": "30 derniers jours", "12m": "12 derniers mois" };

/** Types d'événements acceptés du code de suivi (liste fermée). */
export const VIEW_EVENTS = ["menu", "chambres", "services", "produits"] as const;
export const CONVERSION_EVENTS = ["commande", "reservation", "demande_reservation", "devis", "rendez_vous", "contact"] as const;
export const EVENT_TYPES = ["pageview", "leave", ...VIEW_EVENTS, ...CONVERSION_EVENTS] as const;
export type EventType = (typeof EVENT_TYPES)[number];
export const isEventType = (t: unknown): t is EventType => typeof t === "string" && (EVENT_TYPES as readonly string[]).includes(t);
export const isConversion = (t: string) => (CONVERSION_EVENTS as readonly string[]).includes(t);

export type Device = "telephone" | "ordinateur" | "tablette";
export type SiteEvent = { created_at: string; type: string; path: string; visitor: string; session: string; device: Device; country: string | null; referrer: string | null; duration: number | null };

// ---------- Adaptation au type d'entreprise ----------

export type SectorProfile = { kind: "restaurant" | "hotel" | "garage" | "pharmacie" | "general"; views: { type: string; label: string; hint: string }[]; conversions: { type: string; label: string; hint: string }[] };

const CONTACT = { type: "contact", label: "Demandes de contact", hint: "Clics sur un numéro, WhatsApp ou e-mail, et formulaires de contact" };
export function sectorProfile(sector: string | null | undefined): SectorProfile {
  const s = (sector ?? "").toLowerCase();
  if (/restau|maquis|snack|bar|traiteur|cafe/.test(s))
    return {
      kind: "restaurant",
      views: [{ type: "menu", label: "Consultations du menu", hint: "Pages « menu » ou « carte » du site, et liens vers votre menu MiniSoft" }],
      conversions: [{ type: "commande", label: "Commandes effectuées", hint: "Événement « commande » envoyé par votre site" }, { type: "reservation", label: "Réservations de tables", hint: "Événement « reservation » envoyé par votre site" }, CONTACT],
    };
  if (/hotel|hôtel|auberge|residence|chambre/.test(s))
    return {
      kind: "hotel",
      views: [{ type: "chambres", label: "Consultations des chambres", hint: "Pages « chambres » ou « rooms » du site" }],
      conversions: [{ type: "demande_reservation", label: "Demandes de réservation", hint: "Formulaire ou bouton de demande de réservation" }, { type: "reservation", label: "Réservations confirmées", hint: "Événement « reservation » envoyé par votre site après confirmation" }, CONTACT],
    };
  if (/garage|mecani|auto|moto|repar/.test(s))
    return {
      kind: "garage",
      views: [{ type: "services", label: "Services consultés", hint: "Pages « services » ou « prestations » du site" }],
      conversions: [{ type: "devis", label: "Demandes de devis", hint: "Formulaire ou bouton de demande de devis" }, { type: "rendez_vous", label: "Rendez-vous demandés", hint: "Formulaire ou bouton de prise de rendez-vous" }, CONTACT],
    };
  if (/pharma|medic|officine/.test(s))
    return { kind: "pharmacie", views: [{ type: "produits", label: "Produits consultés", hint: "Pages « produits » ou « médicaments » du site" }], conversions: [{ type: "commande", label: "Commandes", hint: "Événement « commande » envoyé par votre site" }, CONTACT] };
  return {
    kind: "general",
    views: [{ type: "produits", label: "Produits ou services consultés", hint: "Pages « produits » ou « services » du site" }],
    conversions: [{ type: "commande", label: "Commandes", hint: "Événement « commande » envoyé par votre site" }, { type: "reservation", label: "Réservations", hint: "Événement « reservation » envoyé par votre site" }, CONTACT],
  };
}

// ---------- Visiteur : appareil, pays, provenance ----------

export const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|telegram|curl|wget|python|axios|node-fetch|monitor|uptime/i;

export function deviceOf(ua: string): Device {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return "tablette";
  if (/mobi|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "telephone";
  return "ordinateur";
}

/** Pays estimé d'après le fuseau horaire du navigateur (aucune adresse IP n'est conservée). */
const TZ_COUNTRY: Record<string, string> = {
  "Africa/Bangui": "CF", "Africa/Douala": "CM", "Africa/Kinshasa": "CD", "Africa/Lubumbashi": "CD", "Africa/Brazzaville": "CG", "Africa/Libreville": "GA", "Africa/Ndjamena": "TD", "Africa/Malabo": "GQ",
  "Africa/Lagos": "NG", "Africa/Niamey": "NE", "Africa/Abidjan": "CI", "Africa/Dakar": "SN", "Africa/Bamako": "ML", "Africa/Ouagadougou": "BF", "Africa/Lome": "TG", "Africa/Porto-Novo": "BJ", "Africa/Conakry": "GN",
  "Africa/Accra": "GH", "Africa/Khartoum": "SD", "Africa/Juba": "SS", "Africa/Kampala": "UG", "Africa/Nairobi": "KE", "Africa/Kigali": "RW", "Africa/Bujumbura": "BI", "Africa/Dar_es_Salaam": "TZ", "Africa/Addis_Ababa": "ET",
  "Africa/Casablanca": "MA", "Africa/Algiers": "DZ", "Africa/Tunis": "TN", "Africa/Cairo": "EG", "Africa/Johannesburg": "ZA", "Africa/Luanda": "AO", "Africa/Maputo": "MZ", "Indian/Antananarivo": "MG",
  "Europe/Paris": "FR", "Europe/Brussels": "BE", "Europe/Zurich": "CH", "Europe/Luxembourg": "LU", "Europe/London": "GB", "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Lisbon": "PT", "Europe/Amsterdam": "NL",
  "America/Montreal": "CA", "America/Toronto": "CA", "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "Asia/Shanghai": "CN", "Asia/Dubai": "AE", "Asia/Kolkata": "IN", "Europe/Istanbul": "TR",
};
export const COUNTRY_NAMES: Record<string, string> = {
  CF: "Centrafrique", CM: "Cameroun", CD: "RD Congo", CG: "Congo", GA: "Gabon", TD: "Tchad", GQ: "Guinée équatoriale", NG: "Nigeria", NE: "Niger", CI: "Côte d'Ivoire", SN: "Sénégal", ML: "Mali", BF: "Burkina Faso", TG: "Togo", BJ: "Bénin", GN: "Guinée",
  GH: "Ghana", SD: "Soudan", SS: "Soudan du Sud", UG: "Ouganda", KE: "Kenya", RW: "Rwanda", BI: "Burundi", TZ: "Tanzanie", ET: "Éthiopie", MA: "Maroc", DZ: "Algérie", TN: "Tunisie", EG: "Égypte", ZA: "Afrique du Sud", AO: "Angola", MZ: "Mozambique", MG: "Madagascar",
  FR: "France", BE: "Belgique", CH: "Suisse", LU: "Luxembourg", GB: "Royaume-Uni", DE: "Allemagne", ES: "Espagne", IT: "Italie", PT: "Portugal", NL: "Pays-Bas", CA: "Canada", US: "États-Unis", CN: "Chine", AE: "Émirats arabes unis", IN: "Inde", TR: "Turquie",
};
export function countryOf(tz: unknown, header?: string | null): string | null {
  const h = (header ?? "").toUpperCase();
  if (/^[A-Z]{2}$/.test(h) && h !== "XX" && h !== "T1") return h;
  return typeof tz === "string" ? (TZ_COUNTRY[tz] ?? null) : null;
}

/** Hôte d'une adresse saisie, sans « www. ». */
export function normalizeSiteUrl(input: string): { url: string; host: string } | null {
  const raw = input.trim();
  if (!raw || raw.length > 300) return null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || !u.hostname.includes(".") || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) return null;
  if (/(^|\.)(localhost|local|internal|onrender\.com\.invalid)$/i.test(u.hostname)) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  return { url: `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`, host };
}

/** Une visite n'est acceptée que si elle vient du site connecté (domaine identique, avec ou sans www, ou sous-domaine). */
export function originMatches(origin: string | null | undefined, host: string): boolean {
  if (!origin) return false;
  let h: string;
  try {
    h = new URL(origin).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return false;
  }
  return h === host || h.endsWith(`.${host}`);
}

// ---------- Ce que la page d'accueil du site révèle ----------

export type Detected = { snippet: boolean; tools: { id: string; label: string; detail?: string }[]; platform: string | null; api: string | null };
export function detectFromHtml(html: string, siteKey: string): Detected {
  const h = html.slice(0, 1_000_000);
  const tools: Detected["tools"] = [];
  const ga = /\b(G-[A-Z0-9]{6,12})\b/.exec(h);
  if (ga && /gtag|googletagmanager/i.test(h)) tools.push({ id: "ga4", label: "Google Analytics 4", detail: ga[1] });
  const gtm = /\b(GTM-[A-Z0-9]{4,10})\b/.exec(h);
  if (gtm) tools.push({ id: "gtm", label: "Google Tag Manager", detail: gtm[1] });
  if (/matomo\.js|piwik\.js|_paq\.push/i.test(h)) tools.push({ id: "matomo", label: "Matomo" });
  if (/plausible\.io\/js/i.test(h)) tools.push({ id: "plausible", label: "Plausible" });
  if (/connect\.facebook\.net\/[^"']*fbevents\.js|fbq\(/i.test(h)) tools.push({ id: "meta_pixel", label: "Pixel Meta (Facebook)" });
  let platform: string | null = null;
  if (/wp-content|wp-includes|<meta[^>]+generator[^>]+wordpress/i.test(h)) platform = "WordPress";
  else if (/cdn\.shopify\.com|Shopify\.theme/i.test(h)) platform = "Shopify";
  else if (/static\.wixstatic\.com|wix\.com/i.test(h)) platform = "Wix";
  else if (/squarespace\.com/i.test(h)) platform = "Squarespace";
  else if (/<meta[^>]+generator[^>]+joomla/i.test(h)) platform = "Joomla";
  else if (/webflow\.(com|io)/i.test(h)) platform = "Webflow";
  const api = /rel=["']https:\/\/api\.w\.org\/["']|\/wp-json\//i.test(h) ? "API WordPress (wp-json)" : null;
  const snippet = new RegExp(`/ms\\.js[^>]*data-site=["']${siteKey}["']|data-site=["']${siteKey}["'][^>]*/ms\\.js`).test(h);
  return { snippet, tools, platform, api };
}

// ---------- Calcul des statistiques ----------

const DAY = 86_400_000;
/** Bornes d'une période (fuseau de Bangui, UTC+1, pour « aujourd'hui » et les jours). */
export const TZ_OFFSET_MS = 60 * 60_000;
export function periodRange(period: Period, now = Date.now()): { from: number; to: number; prevFrom: number } {
  const localMidnight = Math.floor((now + TZ_OFFSET_MS) / DAY) * DAY - TZ_OFFSET_MS;
  const from = period === "today" ? localMidnight : period === "7d" ? localMidnight - 6 * DAY : period === "30d" ? localMidnight - 29 * DAY : localMonthStart(now, -11);
  return { from, to: now, prevFrom: from - (now - from) };
}
function localMonthStart(now: number, add: number) {
  const d = new Date(now + TZ_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + add, 1) - TZ_OFFSET_MS;
}
export const defaultGranularity = (p: Period): Granularity => (p === "today" ? "hour" : p === "12m" ? "month" : "day");

function bucketStart(t: number, g: Granularity) {
  const l = t + TZ_OFFSET_MS;
  if (g === "hour") return Math.floor(l / 3_600_000) * 3_600_000 - TZ_OFFSET_MS;
  const day = Math.floor(l / DAY) * DAY;
  if (g === "day") return day - TZ_OFFSET_MS;
  if (g === "week") {
    const dow = (new Date(day).getUTCDay() + 6) % 7; // lundi = 0
    return day - dow * DAY - TZ_OFFSET_MS;
  }
  const d = new Date(l);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - TZ_OFFSET_MS;
}
function nextBucket(t: number, g: Granularity) {
  if (g === "hour") return t + 3_600_000;
  if (g === "day") return t + DAY;
  if (g === "week") return t + 7 * DAY;
  const d = new Date(t + TZ_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - TZ_OFFSET_MS;
}
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
function bucketLabel(t: number, g: Granularity) {
  const d = new Date(t + TZ_OFFSET_MS);
  if (g === "hour") return `${String(d.getUTCHours()).padStart(2, "0")} h`;
  if (g === "month") return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${g === "week" ? " (sem.)" : ""}`;
}

export type Totals = { visitors: number; uniqueVisitors: number; visits: number; pageviews: number; avgVisitSeconds: number | null; convertedVisitors: number; conversionRate: number | null; events: Record<string, number> };
export function totals(evs: SiteEvent[]): Totals {
  const dayVisitor = new Set<string>();
  const uniq = new Set<string>();
  const sessions = new Map<string, number>();
  const converted = new Set<string>();
  const events: Record<string, number> = {};
  let pageviews = 0;
  for (const e of evs) {
    if (e.type === "pageview") {
      pageviews++;
      uniq.add(e.visitor);
      dayVisitor.add(`${e.visitor}|${new Date(Date.parse(e.created_at) + TZ_OFFSET_MS).toISOString().slice(0, 10)}`);
      if (!sessions.has(e.session)) sessions.set(e.session, 0);
    } else if (e.type === "leave") {
      sessions.set(e.session, (sessions.get(e.session) ?? 0) + Math.min(1800, Math.max(0, e.duration ?? 0)));
    } else {
      events[e.type] = (events[e.type] ?? 0) + 1;
      if (isConversion(e.type)) converted.add(e.visitor);
    }
  }
  const withTime = [...sessions.values()];
  const timed = withTime.filter((s) => s > 0);
  const uniqueVisitors = uniq.size;
  return {
    visitors: dayVisitor.size,
    uniqueVisitors,
    visits: withTime.length,
    pageviews,
    avgVisitSeconds: timed.length ? Math.round(timed.reduce((a, b) => a + b, 0) / timed.length) : null,
    convertedVisitors: [...converted].filter((v) => uniq.has(v)).length,
    conversionRate: uniqueVisitors ? Math.round(([...converted].filter((v) => uniq.has(v)).length / uniqueVisitors) * 1000) / 10 : null,
    events,
  };
}

export type Stats = {
  period: Period;
  granularity: Granularity;
  from: string;
  to: string;
  totals: Totals;
  previous: Totals | null;
  realtime: number;
  series: { label: string; start: string; visitors: number; pageviews: number }[];
  topPages: { path: string; views: number }[];
  countries: { code: string; name: string; visitors: number }[];
  countryUnknown: number;
  devices: { device: Device; visitors: number }[];
  referrers: { host: string; visits: number }[];
  truncated: boolean;
};

export function buildStats(evs: SiteEvent[], prev: SiteEvent[] | null, opts: { period: Period; granularity: Granularity; from: number; to: number; realtime: number; truncated: boolean }): Stats {
  const views = evs.filter((e) => e.type === "pageview");
  // Courbe : visiteurs distincts et pages vues par tranche.
  const series: Stats["series"] = [];
  const idx = new Map<number, { v: Set<string>; p: number }>();
  for (let t = bucketStart(opts.from, opts.granularity); t <= opts.to; t = nextBucket(t, opts.granularity)) idx.set(t, { v: new Set(), p: 0 });
  for (const e of views) {
    const b = idx.get(bucketStart(Date.parse(e.created_at), opts.granularity));
    if (b) (b.v.add(e.visitor), b.p++);
  }
  for (const [t, b] of idx) series.push({ label: bucketLabel(t, opts.granularity), start: new Date(t).toISOString(), visitors: b.v.size, pageviews: b.p });

  const pages = new Map<string, number>();
  for (const e of views) pages.set(e.path, (pages.get(e.path) ?? 0) + 1);
  const byCountry = new Map<string, Set<string>>();
  const unknown = new Set<string>();
  const byDevice = new Map<Device, Set<string>>();
  const refs = new Map<string, Set<string>>();
  for (const e of views) {
    if (e.country) (byCountry.get(e.country) ?? byCountry.set(e.country, new Set()).get(e.country)!).add(e.visitor);
    else unknown.add(e.visitor);
    (byDevice.get(e.device) ?? byDevice.set(e.device, new Set()).get(e.device)!).add(e.visitor);
    if (e.referrer) (refs.get(e.referrer) ?? refs.set(e.referrer, new Set()).get(e.referrer)!).add(e.session);
  }
  const sortDesc = <T extends { [k: string]: unknown }>(a: T[], k: keyof T) => a.sort((x, y) => (y[k] as number) - (x[k] as number));
  return {
    period: opts.period,
    granularity: opts.granularity,
    from: new Date(opts.from).toISOString(),
    to: new Date(opts.to).toISOString(),
    totals: totals(evs),
    previous: prev ? totals(prev) : null,
    realtime: opts.realtime,
    series,
    topPages: sortDesc([...pages].map(([path, v]) => ({ path, views: v })), "views").slice(0, 10),
    countries: sortDesc([...byCountry].map(([code, s]) => ({ code, name: COUNTRY_NAMES[code] ?? code, visitors: s.size })), "visitors").slice(0, 10),
    countryUnknown: unknown.size,
    devices: (["telephone", "ordinateur", "tablette"] as Device[]).map((d) => ({ device: d, visitors: byDevice.get(d)?.size ?? 0 })),
    referrers: sortDesc([...refs].map(([host, s]) => ({ host, visits: s.size })), "visits").slice(0, 8),
    truncated: opts.truncated,
  };
}

/** Variation en % entre deux valeurs (null si pas de base de comparaison). */
export const change = (cur: number, prev: number | null | undefined) => (prev ? Math.round(((cur - prev) / prev) * 100) : null);

/** Code de suivi à coller dans le site. */
export const trackerSnippet = (origin: string, siteKey: string) => `<script defer src="${origin}/ms.js" data-site="${siteKey}"></script>`;
