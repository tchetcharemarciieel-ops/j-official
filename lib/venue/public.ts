import "server-only";
import { HttpError, draftSpec, getAccess, publishedSpec, type ProjectRow } from "../access";
import { adminClient } from "../supabase/admin";
import { effectiveWorkspace } from "../workspace";
import { runOp, type OpContext } from "./engine";
import { type Doc, type Settings, type Table, type VenueKind } from "./model";
import { itemAvailable, onlineSettings, publicOrder, type FullOrder, type OnlineItem } from "./online";
import { SupabaseStore } from "./supabase-store";

/**
 * Accès public au restaurant (menu par QR code, commande, suivi). Aucune session client :
 * seules des données publiques sortent d'ici, et les écritures passent par les opérations
 * « publiques » du moteur, au nom du propriétaire (traçabilité de `record_history`).
 */

const hits = new Map<string, number[]>();
/** Limite par adresse IP (par instance) : `max` requêtes par minute et par type d'action. */
export function limited(key: string, max: number) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - (v.at(-1) ?? 0) > 60_000) hits.delete(k);
  return recent.length > max;
}
export const clientIp = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "inconnue";

export type PublicCtx = { project: ProjectRow; kind: VenueKind; demo: boolean; store: SupabaseStore; name: string; primary: string };

/**
 * Restaurant par son adresse publique. `demo` : l'aperçu de test (données de démonstration),
 * réservé au propriétaire et aux administrateurs connectés.
 */
export async function publicRestaurant(slug: string, wantDemo: boolean): Promise<PublicCtx> {
  if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(slug)) throw new HttpError(404, "Restaurant introuvable.");
  const { data } = await adminClient().from("projects").select("*").eq("slug", slug).maybeSingle();
  const project = data as ProjectRow | null;
  if (!project) throw new HttpError(404, "Restaurant introuvable.");
  let demo = false;
  if (wantDemo) {
    const access = await getAccess(project.id).catch(() => null);
    if (!access || (access.role !== "owner" && access.role !== "admin")) throw new HttpError(403, "Le mode test est réservé au propriétaire du restaurant, connecté.");
    demo = true;
  }
  if (!demo && project.status === "suspended") throw new HttpError(423, "Ce restaurant n'accepte pas de commandes en ligne pour le moment.");
  const spec = demo ? (draftSpec(project) ?? publishedSpec(project)) : publishedSpec(project);
  const layout = spec ? effectiveWorkspace(spec).layout : null;
  if (!spec || (layout !== "restaurant" && layout !== "hotel")) throw new HttpError(404, "Ce logiciel n'a pas de menu en ligne.");
  return { project, kind: layout, demo, store: new SupabaseStore(project.id, demo, project.owner_id), name: spec.name || project.name, primary: spec.theme.primary };
}

export function publicCtx(p: PublicCtx): OpContext {
  return { store: p.store, actor: { id: p.project.owner_id, role: "employee" }, members: [], kind: p.kind, public: true, demo: p.demo };
}

/** Menu public : plats disponibles et informations visibles par tous, rien d'autre. */
export async function publicMenu(p: PublicCtx, tableToken: string | null, menuToken: string | null) {
  const [settingsDocs, menuDocs, tableDocs] = await Promise.all([p.store.list("settings"), p.store.list("menu"), tableToken ? p.store.list("table") : Promise.resolve([] as Doc[])]);
  const o = onlineSettings(settingsDocs[0]?.data as Settings | undefined);
  let table: { number: string } | null = null;
  let qr: "ok" | "desactive" | "inconnu" = "ok";
  if (tableToken) {
    const t = (tableDocs as Doc<Table>[]).find((x) => x.data.qr_token === tableToken);
    if (!t) qr = "inconnu";
    else if (!t.data.active || t.data.qr_active === false) qr = "desactive";
    else table = { number: t.data.number };
  } else if (menuToken) {
    if (menuToken !== o.menu_token) qr = "inconnu";
    else if (!o.menu_qr_active) qr = "desactive";
  }
  const items = (menuDocs as Doc<OnlineItem>[])
    .filter((m) => m.data.active)
    .map((m) => ({ id: m.id, name: m.data.name, category: m.data.category, price: m.data.price, description: m.data.description ?? "", photo: m.data.photo ?? null, options: (m.data.options ?? []).map((x) => ({ id: x.id, name: x.name, price: x.price })), available: itemAvailable(m.data) }));
  return {
    restaurant: { name: p.name, slug: p.project.slug, primary: p.primary, logo: o.logo, welcome: o.welcome },
    published: o.published,
    ordering: o.published && o.ordering,
    payments: { counter: o.pay_counter || p.demo, aletchcard: false, demo: p.demo },
    kitchenAfterPayment: o.kitchen_after_payment,
    demo: p.demo,
    table,
    qr,
    items: o.published || p.demo ? items : [],
  };
}

export async function trackOrder(p: PublicCtx, token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const orders = (await p.store.list("order")) as Doc<FullOrder>[];
  const o = orders.find((x) => x.data.tracking_token === token);
  if (!o) return null;
  const table = o.data.table_id ? ((await p.store.get("table", o.data.table_id)) as Doc<Table> | null) : null;
  return publicOrder(o, table?.data.number ?? null);
}

export { runOp };
