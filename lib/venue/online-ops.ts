import { z } from "zod";
import { LEVEL, orderTotal, today, type Doc, type HistoryEntry, type MenuItem, type Order, type Payment, type Staff, type Table, type VenueRole } from "./model";
import { itemAvailable, onlineSettings, type DayStat, type FullOrder, type OnlineItem } from "./online";
import { hashToken, type Kit } from "./vision-ops";
import type { OpContext, OpResult } from "./engine";

/**
 * Opérations du restaurant en ligne. Les opérations « publiques » (commande et statistiques du
 * menu QR) ne sont acceptées que si la requête vient de la route publique (`ctx.public`) ; les
 * autres sont réservées à l'équipe, avec des droits distincts pour la cuisine et la caisse.
 */

type OnlineKit = Kit & {
  number: (ctx: OpContext, prefix: string) => Promise<string>;
  hist: (ctx: OpContext, from: string | null, to: string, note?: string) => HistoryEntry;
  refreshOrderPay: (ctx: OpContext, orderId: string) => Promise<void>;
};

const id = z.string().min(1).max(64);
const idem = z.string().min(8).max(80);

/** Jeton aléatoire, sans signification et impossible à deviner (URL sûre). */
export function randomToken(bytes = 18) {
  const b = new Uint8Array(bytes);
  crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Cuisine : gérants et personnel au poste de cuisine (ou de caisse, qui gère aussi les commandes). */
export const isKitchenRole = (role: string) => /cuisin|chef|commis|caiss|accueil/i.test(role);
export function canKitchen(role: VenueRole, me: string, staff: Doc<Staff>[], perms?: readonly string[] | null) {
  if (perms) return LEVEL[role] >= 1 && (perms.includes("cuisine") || perms.includes("caisse"));
  if (LEVEL[role] >= 2) return true;
  return LEVEL[role] >= 1 && staff.some((s) => s.data.active && s.data.member_id === me && isKitchenRole(s.data.role));
}

const imageData = (max: number) =>
  z
    .string()
    .max(max, "Image trop lourde : choisissez une image plus petite.")
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Format d'image non accepté (PNG, JPEG ou WebP).")
    .nullable();

export function onlineOps(k: OnlineKit) {
  async function needKitchen(ctx: OpContext, what: string) {
    k.need(ctx, 1, what);
    if (!canKitchen(ctx.actor.role, ctx.actor.id, (await ctx.store.list("staff")) as Doc<Staff>[], ctx.perms)) k.fail(403, "Réservé à la cuisine, à la caisse et aux gérants : demandez au gérant de vous attribuer un poste « Cuisinier » ou « Caisse et accueil ».");
  }
  const publicOnly = (ctx: OpContext) => {
    if (!ctx.public) k.fail(403, "Opération réservée au menu en ligne.");
  };

  /** Statistiques du jour : un seul document par jour, mis à jour avec contrôle de version. */
  async function bumpStat(ctx: OpContext, fn: (s: DayStat) => DayStat) {
    const date = today(ctx.now?.() ?? new Date());
    const cur = ((await ctx.store.list("qstat")) as Doc<DayStat>[]).find((d) => d.data.date === date);
    if (!cur) {
      try {
        await ctx.store.insert("qstat", fn({ date, scans: {}, visitors: [], views: {}, orders: 0 }));
        return;
      } catch {
        /* créé au même instant par une autre requête : on met à jour */
      }
    }
    const doc = cur ?? ((await ctx.store.list("qstat")) as Doc<DayStat>[]).find((d) => d.data.date === date);
    if (doc) await k.mutate<DayStat>(ctx, "qstat", doc.id, "Statistiques", (s) => fn(s)).catch(() => undefined);
  }
  const visitorKey = async (v: string | undefined) => (v ? (await hashToken(`visitor:${v}`)).slice(0, 16) : null);

  return {
    // ----- Réglages et carte (gérants) -----
    async "online.settings"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la gestion du menu en ligne");
      const i = z.object({ published: z.boolean(), ordering: z.boolean(), pay_counter: z.boolean(), kitchen_after_payment: z.boolean(), welcome: z.string().trim().max(300).default(""), logo: imageData(250_000).optional() }).parse(raw);
      if (i.ordering && !i.pay_counter && !ctx.demo) k.fail(422, "Activez au moins un moyen de paiement : le paiement ALETCHCARD n'est pas encore intégré.");
      await k.saveSettings(ctx, (s) => ({ ...s, online: { ...onlineSettings(s), ...i, logo: i.logo === undefined ? onlineSettings(s).logo : i.logo } }));
      return k.ok(i.published ? "Menu en ligne publié." : "Menu en ligne enregistré (non publié).");
    },

    async "online.item"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la gestion du menu en ligne");
      const i = z
        .object({
          menu_id: id,
          description: z.string().trim().max(500).default(""),
          photo: imageData(400_000).optional(),
          options: z.array(z.object({ id: z.string().max(64).optional(), name: z.string().trim().min(1, "Nom de l'option obligatoire").max(60), price: z.coerce.number().int().min(0).max(1e9) })).max(15).default([]),
          available: z.boolean().default(true),
        })
        .parse(raw);
      await k.mutate<OnlineItem>(ctx, "menu", i.menu_id, "Plat", (m) => ({ ...m, description: i.description, photo: i.photo === undefined ? (m.photo ?? null) : i.photo, options: i.options.map((o) => ({ id: o.id || k.newId(ctx), name: o.name, price: o.price })), available: i.available }));
      return k.ok("Plat du menu en ligne mis à jour.");
    },

    /** Plat disponible / épuisé : la cuisine et la caisse peuvent le changer pendant le service. */
    async "online.available"(ctx: OpContext, raw: unknown) {
      await needKitchen(ctx, "la disponibilité des plats");
      const i = z.object({ menu_id: id, available: z.boolean() }).parse(raw);
      await k.mutate<OnlineItem>(ctx, "menu", i.menu_id, "Plat", (m) => ((m.available !== false) === i.available ? null : { ...m, available: i.available }));
      return k.ok(i.available ? "Plat de nouveau disponible." : "Plat marqué épuisé sur le menu en ligne.");
    },

    // ----- QR codes (gérants) -----
    async "qr.table"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la gestion des QR codes");
      const i = z.object({ table_id: id, action: z.enum(["generate", "disable", "enable"]) }).parse(raw);
      await k.mutate<Table>(ctx, "table", i.table_id, "Table", (t) => (i.action === "generate" ? { ...t, qr_token: randomToken(), qr_active: true } : { ...t, qr_active: i.action === "enable" }));
      return k.ok(i.action === "generate" ? "Nouveau QR code créé : l'ancien ne fonctionne plus." : i.action === "disable" ? "QR code désactivé : il affiche un message explicatif." : "QR code réactivé.");
    },

    async "qr.menu"(ctx: OpContext, raw: unknown) {
      k.need(ctx, 2, "la gestion des QR codes");
      const i = z.object({ action: z.enum(["generate", "disable", "enable"]) }).parse(raw);
      await k.saveSettings(ctx, (s) => {
        const o = onlineSettings(s);
        return { ...s, online: { ...o, ...(i.action === "generate" ? { menu_token: randomToken(), menu_qr_active: true } : { menu_qr_active: i.action === "enable" }) } };
      });
      return k.ok(i.action === "generate" ? "QR code du menu créé." : i.action === "disable" ? "QR code du menu désactivé." : "QR code du menu réactivé.");
    },

    // ----- Menu public (route publique uniquement) -----
    async "online.stat"(ctx: OpContext, raw: unknown) {
      publicOnly(ctx);
      const i = z.object({ scan: z.string().max(64).optional(), views: z.array(id).max(100).default([]), visitor: z.string().max(80).optional() }).parse(raw);
      const v = await visitorKey(i.visitor);
      await bumpStat(ctx, (s) => {
        const next: DayStat = { ...s, scans: { ...s.scans }, views: { ...s.views }, visitors: s.visitors };
        if (i.scan) next.scans[i.scan] = (next.scans[i.scan] ?? 0) + 1;
        for (const m of new Set(i.views)) next.views[m] = (next.views[m] ?? 0) + 1;
        if (v && !s.visitors.includes(v) && s.visitors.length < 5000) next.visitors = [...s.visitors, v];
        return next;
      });
      return k.ok("ok");
    },

    /**
     * Commande passée par le client. La table vient uniquement du jeton du QR code ; les prix,
     * les options et la disponibilité sont toujours repris du menu côté serveur.
     */
    async "online.order"(ctx: OpContext, raw: unknown): Promise<OpResult> {
      publicOnly(ctx);
      const i = z
        .object({
          table_token: z.string().max(64).nullish(),
          lines: z.array(z.object({ menu_id: id, qty: z.coerce.number().int().min(1).max(50), options: z.array(z.string().max(64)).max(15).default([]), note: z.string().trim().max(200).default("") })).min(1, "Votre panier est vide.").max(40),
          note: z.string().trim().max(300).default(""),
          customer: z.string().trim().max(60).default(""),
          pay: z.enum(["caisse", "aletchcard", "demo"]),
          idem,
        })
        .parse(raw);
      const o = onlineSettings((await k.settings(ctx)).data);
      if (!o.published || !o.ordering) k.fail(409, "La commande en ligne n'est pas ouverte pour le moment : adressez-vous au serveur.");
      if (i.pay === "aletchcard") k.fail(503, "Le paiement ALETCHCARD n'est pas encore disponible : choisissez « Payer à la caisse ».");
      if (i.pay === "demo" && !ctx.demo) k.fail(403, "Le paiement de démonstration n'existe que dans le mode démonstration.");
      if (i.pay === "caisse" && !o.pay_counter && !ctx.demo) k.fail(409, "Le paiement à la caisse n'est pas proposé.");
      const same = ((await ctx.store.list("order")) as Doc<FullOrder>[]).find((x) => x.data.idem === `qr:${i.idem}`);
      if (same) return k.ok(`Commande ${same.data.number} déjà enregistrée.`, { id: same.id, duplicate: true, secret: same.data.tracking_token });
      let table: Doc<Table> | undefined;
      if (i.table_token) {
        table = ((await ctx.store.list("table")) as Doc<Table>[]).find((t) => t.data.qr_token === i.table_token);
        if (!table || !table.data.active || table.data.qr_active === false) k.fail(410, "Ce QR code de table n'est plus actif : demandez au serveur.");
      }
      const menu = (await ctx.store.list("menu")) as Doc<OnlineItem>[];
      const lines = i.lines.map((l) => {
        const m = menu.find((x) => x.id === l.menu_id);
        if (!m || !itemAvailable(m.data)) k.fail(409, `${m ? `« ${m.data.name} »` : "Un plat"} n'est plus disponible : retirez-le du panier.`);
        const opts = (m!.data.options ?? []).filter((x) => l.options.includes(x.id));
        if (opts.length !== new Set(l.options).size) k.fail(409, `Les options de « ${m!.data.name} » ont changé : choisissez-les à nouveau.`);
        return { id: k.newId(ctx), menu_id: m!.id, label: m!.data.name, qty: l.qty, unit_price: m!.data.price + opts.reduce((a, x) => a + x.price, 0), note: l.note, kitchen: m!.data.kitchen, options: opts.map((x) => ({ name: x.name, price: x.price })) };
      });
      const held = o.kitchen_after_payment;
      const now = k.nowIso(ctx);
      const order: FullOrder = {
        number: await k.number(ctx, "CMD"),
        source: table ? (table.data.zone === "terrasse" ? "terrasse" : table.data.zone === "restaurant" ? "restaurant" : "salle") : "caisse",
        table_id: table?.id ?? null,
        stay_id: null,
        customer: i.customer,
        lines,
        total: orderTotal(lines),
        note: i.note,
        status: "en_attente",
        history: [k.hist(ctx, null, "en_attente", `Commande du client par QR code${table ? ` (table ${table.data.number})` : ""}`)],
        paid: 0,
        pay_status: "non_paye",
        stock_deducted: false,
        stock_note: "",
        ready_at: null,
        receipt_no: null,
        idem: `qr:${i.idem}`,
        by: ctx.actor.id,
        channel: "qr",
        tracking_token: randomToken(24),
        pay_mode: i.pay,
        held,
        sent_at: held ? null : now,
        accepted_at: null,
        accepted_by: null,
        problem: null,
      };
      const d = await ctx.store.insert("order", order);
      await bumpStat(ctx, (s) => ({ ...s, orders: s.orders + 1 }));
      return { message: `Commande ${order.number} enregistrée.`, id: d.id, secret: order.tracking_token, effects: !held && lines.some((l) => l.kitchen) ? [{ type: "new_order", orderId: d.id, number: order.number }] : [] };
    },

    /**
     * Paiement de démonstration : simule la confirmation officielle d'un prestataire, uniquement
     * dans le mode démonstration (jamais sur les données réelles, jamais un vrai paiement).
     */
    async "online.demo_pay"(ctx: OpContext, raw: unknown) {
      if (!ctx.demo) k.fail(403, "Le paiement de démonstration n'existe que dans le mode démonstration.");
      const i = z.object({ tracking_token: z.string().min(16).max(64) }).parse(raw);
      const o = ((await ctx.store.list("order")) as Doc<FullOrder>[]).find((x) => x.data.tracking_token === i.tracking_token);
      if (!o) k.fail(404, "Commande introuvable.");
      if (o!.data.pay_status === "paye") return k.ok("Commande déjà payée.", { duplicate: true });
      const p: Payment = { target: "order", target_id: o!.id, amount: o!.data.total - o!.data.paid, method: "mobile_money", tendered: null, change: null, reference: "Paiement de démonstration (aucun argent réel)", status: "confirme", provider: "demo", receipt_no: await k.number(ctx, "REC"), at: k.nowIso(ctx), confirmed_at: k.nowIso(ctx), by: ctx.actor.id, idem: `demo:${o!.id}` };
      if (!(await k.findBy<Payment>(ctx, "payment", (x) => x.idem === p.idem))) await ctx.store.insert("payment", p);
      await k.refreshOrderPay(ctx, o!.id);
      return k.ok("Paiement de démonstration confirmé.");
    },

    // ----- Écran cuisine -----
    async "online.accept"(ctx: OpContext, raw: unknown) {
      await needKitchen(ctx, "l'acceptation des commandes");
      const i = z.object({ id }).parse(raw);
      const { written, doc } = await k.mutate<FullOrder>(ctx, "order", i.id, "Commande", (o) => {
        if (o.status === "annulee") k.fail(409, "Commande annulée.");
        if (o.held) k.fail(409, "Paiement non confirmé : la commande n'est pas encore envoyée en cuisine.");
        return o.accepted_at ? null : { ...o, accepted_at: k.nowIso(ctx), accepted_by: ctx.actor.id, history: [...o.history, k.hist(ctx, o.status, "acceptee", "Acceptée par la cuisine")] };
      });
      return written ? k.ok(`Commande ${doc.data.number} acceptée.`) : k.ok("Commande déjà acceptée.", { duplicate: true });
    },

    async "online.problem"(ctx: OpContext, raw: unknown) {
      await needKitchen(ctx, "le signalement d'un problème");
      const i = z.object({ id, text: z.string().trim().min(3, "Décrivez le problème.").max(300), clear: z.boolean().default(false) }).parse(raw);
      const { doc } = await k.mutate<FullOrder>(ctx, "order", i.id, "Commande", (o) => ({ ...o, problem: i.clear ? null : { at: k.nowIso(ctx), text: i.text, by: ctx.actor.id }, history: [...o.history, k.hist(ctx, o.status, i.clear ? "probleme_resolu" : "probleme", i.text)] }));
      return { message: i.clear ? "Problème marqué comme résolu." : `Problème signalé sur ${doc.data.number} : la caisse et le client sont informés.`, effects: [] };
    },

    /** Caisse : envoie en cuisine une commande en attente de paiement (paiement à la fin du repas). */
    async "online.release"(ctx: OpContext, raw: unknown) {
      await needKitchen(ctx, "l'envoi d'une commande en cuisine");
      const i = z.object({ id }).parse(raw);
      const { written, doc } = await k.mutate<FullOrder>(ctx, "order", i.id, "Commande", (o) => (o.held ? { ...o, held: false, sent_at: k.nowIso(ctx), history: [...o.history, k.hist(ctx, "attente_paiement", "envoyee_cuisine", "Envoyée en cuisine avant paiement")] } : null));
      return written ? { message: `Commande ${doc.data.number} envoyée en cuisine (paiement toujours à encaisser).`, effects: [{ type: "new_order" as const, orderId: doc.id, number: doc.data.number }] } : k.ok("Commande déjà en cuisine.", { duplicate: true });
    },
  };
}

export type { Order, MenuItem };
