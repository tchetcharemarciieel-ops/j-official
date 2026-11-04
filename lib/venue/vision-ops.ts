import { z } from "zod";
import { BOOKING_ACTIVE, type Booking, type Col, type Doc, type Order, type Settings, type Staff, type Table } from "./model";
import { ALERT_KIND_LABELS, CASHIER_ROLE, alertKey, canVision, currentBooking, lateness, minutesBetween, seatActive, thresholdOf, visionSettings, type Camera, type Seat, type SeatSource, type VisionAlert } from "./vision";
import type { OpContext, OpResult } from "./engine";

/**
 * Opérations de « MiniSoft Vision IA — Restaurant ». Mêmes garanties que le reste du moteur :
 * rôle vérifié, données validées, écritures conditionnelles (deux appareils ne déclenchent
 * jamais deux alertes pour le même passage) et clés d'opération (pas de doublon).
 */

/** Outils du moteur, transmis par `engine.ts` (évite une dépendance circulaire). */
export type Kit = {
  need: (ctx: OpContext, level: number, what?: string) => void;
  nowIso: (ctx: OpContext) => string;
  newId: (ctx: OpContext) => string;
  ok: (message: string, extra?: Partial<OpResult>) => OpResult;
  must: <T>(ctx: OpContext, col: Col, id: string, label: string) => Promise<Doc<T>>;
  mutate: <T>(ctx: OpContext, col: Col, id: string, label: string, fn: (data: T, doc: Doc<T>) => T | null) => Promise<{ doc: Doc<T>; written: boolean }>;
  findBy: <T>(ctx: OpContext, col: Col, pred: (d: T, doc: Doc<T>) => boolean) => Promise<Doc<T> | undefined>;
  settings: (ctx: OpContext) => Promise<Doc<Settings>>;
  saveSettings: (ctx: OpContext, patch: (s: Settings) => Settings) => Promise<Doc>;
  fail: (status: number, message: string) => never;
};

const id = z.string().min(1).max(64);
const idem = z.string().min(8).max(80);

/** Identifiant stable (format UUID) d'une alerte : deux appareils ne peuvent pas créer la même. */
async function stableId(key: string) {
  const h = await hashToken(`valert:${key}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Empreinte SHA-256 (hexadécimal) d'une clé de passerelle : la clé elle-même n'est jamais enregistrée. */
export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `msv_${[...b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function visionOps(k: Kit) {
  const now = (ctx: OpContext) => ctx.now?.() ?? new Date();

  /** Vision IA est géré par les gérants et le personnel « caisse / accueil » (la passerelle caméra est authentifiée à part). */
  async function needVision(ctx: OpContext, what: string) {
    k.need(ctx, 1, what);
    if (ctx.gateway) return;
    if (!canVision(ctx.actor.role, ctx.actor.id, (await ctx.store.list("staff")) as Doc<Staff>[], ctx.perms)) k.fail(403, `Vision IA est géré par l'accueil / la caisse : demandez au gérant de vous attribuer le poste « ${CASHIER_ROLE} » dans la fiche du personnel.`);
  }

  /** Termine un passage (la table passe « À nettoyer ») et clôt ses alertes. */
  async function endSeat(ctx: OpContext, seatId: string, reason: "libere" | "parti") {
    const { doc, written } = await k.mutate<Seat>(ctx, "vseat", seatId, "Passage", (s) => (s.ended_at ? null : { ...s, ended_at: k.nowIso(ctx), end_reason: reason, cleaned_at: null }));
    if (!written) return false;
    for (const a of (await ctx.store.list("valert")) as Doc<VisionAlert>[]) if (a.data.seat_id === seatId && !a.data.resolved_at) await resolveAlert(ctx, a.id, "libere");
    if (doc.data.booking_id) await k.mutate<Booking>(ctx, "booking", doc.data.booking_id, "Réservation", (b) => (b.status === "arrivee" ? { ...b, status: "terminee" } : null)).catch(() => undefined);
    return true;
  }

  async function resolveAlert(ctx: OpContext, alertId: string, how: "servi" | "libere") {
    await k.mutate<VisionAlert>(ctx, "valert", alertId, "Alerte", (a) => (a.resolved_at ? null : { ...a, resolved_at: k.nowIso(ctx), resolution: how })).catch(() => undefined);
  }

  /** Installe des clients à une table (manuellement, par caméra ou en démonstration). */
  async function openSeat(ctx: OpContext, table: Doc<Table>, guests: number, source: SeatSource, bookingId: string | null, key: string) {
    const same = await k.findBy<Seat>(ctx, "vseat", (s) => s.idem === key);
    if (same) return { seat: same, duplicate: true };
    const busy = await k.findBy<Seat>(ctx, "vseat", (s) => s.table_id === table.id && seatActive(s));
    if (busy) k.fail(409, `La table ${table.data.number} est déjà occupée.`);
    let booking: Doc<Booking> | undefined;
    if (bookingId) {
      booking = await k.must<Booking>(ctx, "booking", bookingId, "Réservation");
      if (booking.data.table_id !== table.id) k.fail(422, "Cette réservation concerne une autre table.");
      if (!BOOKING_ACTIVE.includes(booking.data.status)) k.fail(409, "Cette réservation est terminée ou annulée.");
    } else booking = currentBooking(table.id, (await ctx.store.list("booking")) as Doc<Booking>[], now(ctx));
    const data: Seat = { table_id: table.id, zone: table.data.zone, guests: Math.min(guests, 60), booking_id: booking?.id ?? null, source, arrived_at: k.nowIso(ctx), served_at: null, served_by: null, ended_at: null, end_reason: null, cleaned_at: null, alert_id: null, idem: key, by: ctx.actor.id };
    const seat = (await ctx.store.insert("vseat", data)) as Doc<Seat>;
    if (booking) await k.mutate<Booking>(ctx, "booking", booking.id, "Réservation", (b) => (b.status === "confirmee" ? { ...b, status: "arrivee" } : null));
    return { seat, duplicate: false };
  }

  return {
    async "vision.settings"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "le réglage du délai d'alerte");
      const m = (label: string) => z.coerce.number().int().min(0, `${label} : 0 (désactivé) ou plus`).max(180, `${label} : 180 minutes au maximum`);
      const i = z.object({ alert_minutes: m("Premier service"), order_minutes: m("Commande"), prep_minutes: m("Préparation"), ready_minutes: m("Plat prêt"), sound: z.boolean() }).parse(raw);
      await k.saveSettings(ctx, (s) => ({ ...s, vision: i }));
      return k.ok(`Délais d'alerte enregistrés${i.sound ? " (avec son)" : " (sans son)"}.`);
    },

    async "vision.place"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la disposition du plan");
      const pct = z.coerce.number().finite().min(0).max(100).transform((n) => Math.round(n * 10) / 10);
      const i = z.object({ table_id: id, x: pct, y: pct }).parse(raw);
      await k.mutate<Table>(ctx, "table", i.table_id, "Table", (t) => ({ ...t, pos: { x: i.x, y: i.y } }));
      return k.ok("Position de la table enregistrée.");
    },

    async "vision.seat"(ctx: OpContext, raw: unknown) {
      await needVision(ctx, "l'installation des clients");
      const i = z.object({ table_id: id, guests: z.coerce.number().int().min(1, "Au moins 1 personne").max(60), booking_id: z.string().max(64).nullish().transform((v) => v || null), idem }).parse(raw);
      const table = await k.must<Table>(ctx, "table", i.table_id, "Table");
      if (!table.data.active) k.fail(409, "Cette table n'est plus en service.");
      if (i.guests > table.data.seats) k.fail(422, `La table ${table.data.number} n'a que ${table.data.seats} place(s).`);
      const r = await openSeat(ctx, table, i.guests, "manuel", i.booking_id, `seat:${i.idem}`);
      return r.duplicate ? k.ok("Installation déjà enregistrée.", { id: r.seat.id, duplicate: true }) : k.ok(`Table ${table.data.number} : clients installés, chronomètre démarré.`, { id: r.seat.id });
    },

    async "vision.served"(ctx: OpContext, raw: unknown) {
      await needVision(ctx, "le suivi du service");
      const i = z.object({ seat_id: id }).parse(raw);
      const { doc, written } = await k.mutate<Seat>(ctx, "vseat", i.seat_id, "Passage", (s) => {
        if (s.ended_at) k.fail(409, "Ces clients sont déjà partis.");
        return s.served_at ? null : { ...s, served_at: k.nowIso(ctx), served_by: ctx.actor.id };
      });
      if (!written) return k.ok("Service déjà enregistré.", { duplicate: true });
      for (const a of (await ctx.store.list("valert")) as Doc<VisionAlert>[]) if (a.data.seat_id === doc.id && !a.data.resolved_at && (a.data.kind ?? "service") !== "preparation" && (a.data.kind ?? "service") !== "plat") await resolveAlert(ctx, a.id, "servi");
      return k.ok(`Client servi après ${Math.round(minutesBetween(doc.data.arrived_at, doc.data.served_at!))} min.`);
    },

    async "vision.release"(ctx: OpContext, raw: unknown) {
      await needVision(ctx, "la libération d'une table");
      const i = z.object({ seat_id: id }).parse(raw);
      const s = await k.must<Seat>(ctx, "vseat", i.seat_id, "Passage");
      const ended = await endSeat(ctx, i.seat_id, s.data.served_at ? "libere" : "parti");
      return ended ? k.ok("Clients partis : la table est à nettoyer.") : k.ok("Table déjà libérée.", { duplicate: true });
    },

    /** Table débarrassée : elle redevient « Libre ». */
    async "vision.clean"(ctx: OpContext, raw: unknown) {
      await needVision(ctx, "la remise en état d'une table");
      const i = z.object({ seat_id: id }).parse(raw);
      const { written } = await k.mutate<Seat>(ctx, "vseat", i.seat_id, "Passage", (s) => {
        if (!s.ended_at) k.fail(409, "Les clients sont encore installés : libérez d'abord la table.");
        return s.cleaned_at ? null : { ...s, cleaned_at: k.nowIso(ctx) };
      });
      return written ? k.ok("Table remise en « Libre ».") : k.ok("Table déjà libre.", { duplicate: true });
    },

    /**
     * Vérifie les délais (premier service, commande, préparation, plat prêt). Appelée régulièrement
     * par les écrans ouverts au restaurant. Chaque alerte a un identifiant déduit de son objet :
     * plusieurs appareils qui vérifient en même temps ne créent jamais deux fois la même alerte.
     * Les alertes dont la cause a disparu (client servi, plat prêt…) sont clôturées.
     */
    async "vision.tick"(ctx: OpContext) {
      await needVision(ctx, "la vérification des délais");
      const vs = visionSettings((await k.settings(ctx)).data);
      const seats = ((await ctx.store.list("vseat")) as Doc<Seat>[]).filter((s) => seatActive(s.data));
      const orders = (await ctx.store.list("order")) as Doc<Order>[];
      const alerts = (await ctx.store.list("valert")) as Doc<VisionAlert>[];
      const effects: OpResult["effects"] = [];
      const stillLate = new Set<string>();
      for (const s of seats) {
        for (const l of lateness(s, orders, vs, now(ctx))) {
          const key = alertKey(l.kind, s.id, l.order_id);
          stillLate.add(key);
          if (alerts.some((a) => (a.data.key ?? alertKey("service", a.data.seat_id, null)) === key)) continue;
          const alertId = await stableId(key);
          if (await ctx.store.get("valert", alertId)) continue;
          const table = (await ctx.store.get("table", s.data.table_id)) as Doc<Table> | null;
          const number = table?.data.number ?? "?";
          try {
            await ctx.store.insert("valert", { kind: l.kind, order_id: l.order_id, key, table_id: s.data.table_id, table_number: number, seat_id: s.id, raised_at: k.nowIso(ctx), threshold_min: thresholdOf(vs, l.kind), ack_at: null, ack_by: null, resolved_at: null, resolution: null } satisfies VisionAlert, alertId);
          } catch {
            continue; // créée au même instant par un autre appareil
          }
          effects.push({ type: "vision_alert", table: number, minutes: Math.round(l.minutes), kind: ALERT_KIND_LABELS[l.kind] });
        }
      }
      // Cause disparue : l'alerte est clôturée (elle reste dans l'historique).
      for (const a of alerts) {
        if (a.data.resolved_at) continue;
        const key = a.data.key ?? alertKey("service", a.data.seat_id, null);
        const seat = seats.find((s) => s.id === a.data.seat_id);
        if (!seat) await resolveAlert(ctx, a.id, "libere");
        else if (!stillLate.has(key)) await resolveAlert(ctx, a.id, "servi");
      }
      return k.ok(effects.length ? `${effects.length} alerte(s) de délai.` : "Aucun nouveau retard.", { effects });
    },

    async "vision.ack"(ctx: OpContext, raw: unknown) {
      await needVision(ctx, "la prise en charge d'une alerte");
      const i = z.object({ alert_id: id }).parse(raw);
      const { written } = await k.mutate<VisionAlert>(ctx, "valert", i.alert_id, "Alerte", (a) => (a.ack_at ? null : { ...a, ack_at: k.nowIso(ctx), ack_by: ctx.actor.id }));
      return written ? k.ok("Alerte prise en charge.") : k.ok("Alerte déjà prise en charge.", { duplicate: true });
    },

    /**
     * Détections d'occupation. Source « demo » : uniquement dans la démonstration ou l'aperçu
     * (jamais dans les données réelles). Source « camera » : uniquement par la passerelle
     * authentifiée de cette caméra. Aucune image n'est acceptée, seulement des états de table.
     */
    async "vision.detect"(ctx: OpContext, raw: unknown) {
      await needVision(ctx, "l'enregistrement des détections");
      const i = z
        .object({
          source: z.enum(["demo", "camera"]),
          camera_id: z.string().max(64).optional(),
          observations: z.array(z.object({ table_id: id, occupied: z.boolean(), people: z.coerce.number().int().min(0).max(60).optional() }).strict()).min(1).max(200),
          idem,
        })
        .parse(raw);
      if (i.source === "demo" && !ctx.demo) k.fail(403, "Le mode démonstration n'écrit jamais dans les données réelles du restaurant.");
      if (i.source === "camera" && (!i.camera_id || ctx.gateway !== i.camera_id)) k.fail(403, "Les détections caméra ne sont acceptées que par la passerelle authentifiée de cette caméra.");
      let cam: Doc<Camera> | null = null;
      if (i.source === "camera") {
        cam = await k.must<Camera>(ctx, "vcam", i.camera_id!, "Caméra");
        if (!cam.data.active) k.fail(409, "Cette caméra est désactivée.");
      }
      const tables = (await ctx.store.list("table")) as Doc<Table>[];
      let opened = 0;
      let closed = 0;
      for (const [n, o] of i.observations.entries()) {
        const table = tables.find((t) => t.id === o.table_id && t.data.active);
        if (!table) continue;
        if (cam && !cam.data.table_ids.includes(table.id)) continue;
        const active = await k.findBy<Seat>(ctx, "vseat", (s) => s.table_id === table.id && seatActive(s));
        if (o.occupied && !active) {
          const r = await openSeat(ctx, table, Math.max(1, Math.min(o.people ?? 1, table.data.seats)), i.source, null, `det:${i.idem}:${n}`);
          if (!r.duplicate) opened++;
        } else if (!o.occupied && active && active.data.source === i.source) {
          // Seules les installations détectées par la même source sont libérées automatiquement.
          if (await endSeat(ctx, active.id, active.data.served_at ? "libere" : "parti")) closed++;
        }
      }
      // Présence de la caméra : mise à jour au plus toutes les 30 s (évite un historique inutile).
      if (cam) await k.mutate<Camera>(ctx, "vcam", cam.id, "Caméra", (c) => (c.last_seen && now(ctx).getTime() - Date.parse(c.last_seen) < 30_000 && c.last_tables === i.observations.length ? null : { ...c, last_seen: k.nowIso(ctx), last_tables: i.observations.length }));
      return k.ok(`Détections reçues : ${opened} installation(s), ${closed} départ(s).`);
    },

    async "vision.camera.save"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la déclaration des caméras");
      const pct = z.coerce.number().finite().min(0).max(100);
      const i = z
        .object({
          id: z.string().max(64).nullish().transform((v) => v || null),
          name: z.string().trim().min(1, "Nom obligatoire").max(80),
          zone: z.enum(["salle", "terrasse", "restaurant"]),
          table_ids: z.array(id).max(200),
          pos: z.object({ x: pct, y: pct }).nullish().transform((v) => v ?? null),
          angle: z.coerce.number().finite().min(-360).max(360).default(0),
          fov: z.coerce.number().finite().min(20).max(180).default(90),
          range: z.coerce.number().finite().min(10).max(150).default(60),
        })
        .parse(raw);
      const tables = (await ctx.store.list("table")) as Doc<Table>[];
      const unknown = i.table_ids.filter((t) => !tables.some((x) => x.id === t));
      if (unknown.length) k.fail(422, "Certaines tables sélectionnées n'existent plus.");
      if (i.id) {
        await k.mutate<Camera>(ctx, "vcam", i.id, "Caméra", (c) => ({ ...c, name: i.name, zone: i.zone, table_ids: i.table_ids, pos: i.pos ?? c.pos ?? null, angle: i.angle, fov: i.fov, range: i.range }));
        return k.ok("Caméra mise à jour.", { id: i.id });
      }
      const d = await ctx.store.insert("vcam", { name: i.name, zone: i.zone, table_ids: i.table_ids, token_hash: null, token_hint: null, last_seen: null, last_tables: null, pos: i.pos ?? { x: 8, y: 10 }, angle: i.angle, fov: i.fov, range: i.range, active: true, by: ctx.actor.id } satisfies Camera);
      return k.ok("Caméra déclarée. Générez sa clé d'accès pour la passerelle de détection.", { id: d.id });
    },

    /** Place la caméra sur le plan 2D (glisser-déposer) et règle son orientation. */
    async "vision.camera.place"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la disposition du plan");
      const pct = z.coerce.number().finite().min(0).max(100).transform((n) => Math.round(n * 10) / 10);
      const i = z.object({ id, x: pct, y: pct, angle: z.coerce.number().finite().min(-360).max(360).optional() }).parse(raw);
      await k.mutate<Camera>(ctx, "vcam", i.id, "Caméra", (c) => ({ ...c, pos: { x: i.x, y: i.y }, ...(i.angle !== undefined ? { angle: i.angle } : {}) }));
      return k.ok("Position de la caméra enregistrée.");
    },

    /** Génère (ou remplace) la clé de la passerelle. Elle n'est affichée qu'une fois. */
    async "vision.camera.token"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la gestion des clés des caméras");
      const i = z.object({ id }).parse(raw);
      const token = randomToken();
      const hash = await hashToken(token);
      await k.mutate<Camera>(ctx, "vcam", i.id, "Caméra", (c) => ({ ...c, token_hash: hash, token_hint: token.slice(-4), active: true }));
      return k.ok("Nouvelle clé générée : copiez-la maintenant, elle ne sera plus affichée.", { secret: token });
    },

    async "vision.camera.toggle"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la gestion des caméras");
      const i = z.object({ id, active: z.boolean() }).parse(raw);
      await k.mutate<Camera>(ctx, "vcam", i.id, "Caméra", (c) => (c.active === i.active ? null : { ...c, active: i.active, ...(i.active ? {} : { token_hash: null, token_hint: null }) }));
      return k.ok(i.active ? "Caméra réactivée : générez une nouvelle clé." : "Caméra désactivée et clé révoquée.");
    },
  };
}
