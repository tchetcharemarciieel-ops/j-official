import { beforeEach, describe, expect, it, vi } from "vitest";

// Base en mémoire avec l'interface chaînée du client Supabase (sous-ensemble utilisé).
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let seq = 0;
function q(table: string) {
  const rows = () => (tables[table] ??= []);
  const filters: ((r: Row) => boolean)[] = [];
  let op: "select" | "update" | "insert" | "delete" = "select";
  let payload: Row = {};
  let asc = true;
  let range: [number, number] | null = null;
  let lim = Infinity;
  const run = () => {
    if (op === "insert") {
      const row = { id: table === "web_events" ? ++seq : crypto.randomUUID(), created_at: new Date().toISOString(), ...payload };
      rows().push(row);
      return [row];
    }
    const hit = rows().filter((r) => filters.every((f) => f(r)));
    if (op === "update") return (hit.forEach((r) => Object.assign(r, payload)), hit);
    if (op === "delete") return (tables[table] = rows().filter((r) => !hit.includes(r)), null);
    const sorted = [...hit].sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : 1) * (asc ? 1 : -1));
    return range ? sorted.slice(range[0], range[1] + 1) : sorted.slice(0, lim);
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), b),
    gte: (k: string, v: string) => (filters.push((r) => String(r[k]) >= v), b),
    lte: (k: string, v: string) => (filters.push((r) => String(r[k]) <= v), b),
    lt: (k: string, v: string) => (filters.push((r) => String(r[k]) < v), b),
    order: (_k: string, o?: { ascending?: boolean }) => ((asc = o?.ascending !== false), b),
    limit: (n: number) => ((lim = n), b),
    range: (a: number, z: number) => ((range = [a, z]), b),
    update: (p: Row) => ((op = "update"), (payload = p), b),
    insert: (p: Row) => ((op = "insert"), (payload = p), b),
    delete: () => ((op = "delete"), b),
    maybeSingle: async () => ({ data: run()?.[0] ?? null }),
    single: async () => ({ data: run()?.[0] ?? null, error: null }),
    then: (res: (v: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: run(), error: null }).then(res),
  };
  return b;
}
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ adminClient: () => ({ from: (t: string) => q(t) }) }));

const M = await import("@/lib/website/model");
const S = await import("@/lib/website/server");

const UA_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36";
const UA_PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36";
const P1 = "00000000-0000-4000-8000-000000000001";
const P2 = "00000000-0000-4000-8000-000000000002";

beforeEach(() => {
  for (const k of Object.keys(tables)) delete tables[k];
  tables.websites = [
    { id: "s1", project_id: P1, host: "chez-awa.cf", site_key: "ms_aaaaaaaaaaaaaaaa", status: "pending", url: "https://chez-awa.cf" },
    { id: "s2", project_id: P2, host: "garage-bangui.com", site_key: "ms_bbbbbbbbbbbbbbbb", status: "connected", url: "https://garage-bangui.com" },
  ];
  tables.web_events = [];
});

describe("Site connecté : règles", () => {
  it("reconnaît les appareils et les robots", () => {
    expect(M.deviceOf(UA_PHONE)).toBe("telephone");
    expect(M.deviceOf(UA_PC)).toBe("ordinateur");
    expect(M.deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)")).toBe("tablette");
    expect(M.BOT_RE.test("Googlebot/2.1")).toBe(true);
  });
  it("estime le pays d'après le fuseau, sinon inconnu", () => {
    expect(M.countryOf("Africa/Bangui")).toBe("CF");
    expect(M.countryOf("Mars/Olympus")).toBeNull();
    expect(M.countryOf("Africa/Bangui", "FR")).toBe("FR");
  });
  it("valide l'adresse et le domaine d'origine", () => {
    expect(M.normalizeSiteUrl("www.chez-awa.cf")).toEqual({ url: "https://www.chez-awa.cf", host: "chez-awa.cf" });
    expect(M.normalizeSiteUrl("http://localhost:3000")).toBeNull();
    expect(M.normalizeSiteUrl("https://10.0.0.1")).toBeNull();
    expect(M.originMatches("https://www.chez-awa.cf", "chez-awa.cf")).toBe(true);
    expect(M.originMatches("https://menu.chez-awa.cf", "chez-awa.cf")).toBe(true);
    expect(M.originMatches("https://chez-awa.cf.pirate.com", "chez-awa.cf")).toBe(false);
    expect(M.originMatches(null, "chez-awa.cf")).toBe(false);
  });
  it("repère le code MiniSoft, Google Analytics et WordPress", () => {
    const html = `<link rel="https://api.w.org/" href="/wp-json/"><script src="/wp-content/x.js"></script><script async src="https://www.googletagmanager.com/gtag/js?id=G-AB12CD34EF"></script><script>gtag('config','G-AB12CD34EF')</script><script defer src="https://minisoft-rca.onrender.com/ms.js" data-site="ms_aaaaaaaaaaaaaaaa"></script>`;
    const d = M.detectFromHtml(html, "ms_aaaaaaaaaaaaaaaa");
    expect(d.snippet).toBe(true);
    expect(d.platform).toBe("WordPress");
    expect(d.api).toMatch(/WordPress/);
    expect(d.tools.map((t) => t.id)).toContain("ga4");
    expect(M.detectFromHtml(html, "ms_autreclezzzzzzzzz").snippet).toBe(false);
  });
  it("adapte les statistiques au type d'entreprise", () => {
    expect(M.sectorProfile("restaurant").conversions.map((c) => c.type)).toEqual(["commande", "reservation", "contact"]);
    expect(M.sectorProfile("hotel").views[0]!.type).toBe("chambres");
    expect(M.sectorProfile("garage").conversions.map((c) => c.type)).toEqual(["devis", "rendez_vous", "contact"]);
  });
});

describe("Site connecté : collecte et isolation", () => {
  const h = (origin: string | null, ua = UA_PHONE, ip = "41.1.1.1") => ({ origin, referer: null, ua, ip, country: null });
  it("passe en « Connecté » seulement à la première vraie visite du bon domaine", async () => {
    expect((await S.collect({ k: "ms_aaaaaaaaaaaaaaaa", e: "pageview", p: "/" }, h("https://pirate.com"))).ok).toBe(false);
    expect(tables.websites![0]!.status).toBe("pending");
    expect(tables.web_events).toHaveLength(0);
    const r = await S.collect({ k: "ms_aaaaaaaaaaaaaaaa", e: "pageview", p: "/menu?x=1#y", tz: "Africa/Bangui" }, h("https://www.chez-awa.cf"));
    expect(r.ok).toBe(true);
    expect(tables.websites![0]!.status).toBe("connected");
    expect(tables.web_events![0]).toMatchObject({ project_id: P1, path: "/menu", device: "telephone", country: "CF" });
    expect(JSON.stringify(tables.web_events)).not.toContain("41.1.1.1"); // aucune adresse IP stockée
  });
  it("refuse les types inconnus, ignore les robots, garde la même visite pendant 30 min", async () => {
    expect((await S.collect({ k: "ms_aaaaaaaaaaaaaaaa", e: "hack" }, h("https://chez-awa.cf"))).ok).toBe(false);
    await S.collect({ k: "ms_aaaaaaaaaaaaaaaa", e: "pageview", p: "/" }, h("https://chez-awa.cf", "Googlebot/2.1"));
    expect(tables.web_events).toHaveLength(0);
    await S.collect({ k: "ms_aaaaaaaaaaaaaaaa", e: "pageview", p: "/" }, h("https://chez-awa.cf"));
    await S.collect({ k: "ms_aaaaaaaaaaaaaaaa", e: "commande", p: "/menu" }, h("https://chez-awa.cf"));
    const [a, b] = tables.web_events!;
    expect(a!.session).toBe(b!.session);
    expect(a!.visitor).toBe(b!.visitor);
  });
  it("ne lit jamais les événements d'une autre entreprise", async () => {
    await S.collect({ k: "ms_aaaaaaaaaaaaaaaa", e: "pageview", p: "/a" }, h("https://chez-awa.cf"));
    await S.collect({ k: "ms_bbbbbbbbbbbbbbbb", e: "pageview", p: "/b" }, h("https://garage-bangui.com"));
    // La clé du site 2 utilisée depuis le domaine du site 1 est refusée.
    expect((await S.collect({ k: "ms_bbbbbbbbbbbbbbbb", e: "pageview", p: "/x" }, h("https://chez-awa.cf"))).ok).toBe(false);
    const from = Date.now() - 3600_000, to = Date.now() + 1000;
    const p1 = await S.loadEvents("s1", P1, from, to);
    expect(p1.events.map((e) => e.path)).toEqual(["/a"]);
    // Bon site, mauvais projet : rien.
    expect((await S.loadEvents("s2", P1, from, to)).events).toHaveLength(0);
  });
});

describe("Site connecté : calcul des statistiques", () => {
  const ev = (o: Partial<import("@/lib/website/model").SiteEvent>): import("@/lib/website/model").SiteEvent => ({ created_at: new Date().toISOString(), type: "pageview", path: "/", visitor: "v1", session: "s1", device: "telephone", country: "CF", referrer: null, duration: null, ...o });
  it("compte visiteurs, visites, pages, durée et conversion sans rien inventer", () => {
    const evs = [
      ev({}), ev({ path: "/menu" }), ev({ type: "leave", duration: 90 }), ev({ type: "menu", path: "/menu" }), ev({ type: "commande", path: "/menu" }),
      ev({ visitor: "v2", session: "s2", device: "ordinateur", country: null }), ev({ visitor: "v2", session: "s2", type: "leave", duration: 30 }),
    ];
    const t = M.totals(evs);
    expect(t).toMatchObject({ visitors: 2, uniqueVisitors: 2, visits: 2, pageviews: 3, avgVisitSeconds: 60, convertedVisitors: 1, conversionRate: 50 });
    expect(t.events).toEqual({ menu: 1, commande: 1 });
    const now = Date.now();
    const st = M.buildStats(evs, [], { period: "today", granularity: "hour", from: M.periodRange("today", now).from, to: now, realtime: 1, truncated: false });
    expect(st.topPages[0]).toEqual({ path: "/", views: 2 });
    expect(st.devices.find((d) => d.device === "telephone")!.visitors).toBe(1);
    expect(st.countries).toEqual([{ code: "CF", name: "Centrafrique", visitors: 1 }]);
    expect(st.countryUnknown).toBe(1);
    expect(st.series.reduce((a, b) => a + b.pageviews, 0)).toBe(3);
  });
  it("aucune visite : zéro partout, aucune durée ni taux inventés", () => {
    const t = M.totals([]);
    expect(t).toMatchObject({ visitors: 0, pageviews: 0, avgVisitSeconds: null, conversionRate: null });
    expect(M.change(5, 0)).toBeNull();
    expect(M.change(15, 10)).toBe(50);
  });
  it("périodes : 7 jours = 7 tranches, 12 mois = 12 tranches", () => {
    const now = Date.parse("2026-11-13T12:00:00Z");
    const s7 = M.buildStats([], null, { period: "7d", granularity: "day", ...M.periodRange("7d", now), to: now, realtime: 0, truncated: false });
    expect(s7.series).toHaveLength(7);
    const s12 = M.buildStats([], null, { period: "12m", granularity: "month", ...M.periodRange("12m", now), to: now, realtime: 0, truncated: false });
    expect(s12.series).toHaveLength(12);
  });
});
