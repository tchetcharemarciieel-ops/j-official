import { hotelAreas, restaurantAreas } from "@/lib/venue/layout";
import { BOOKING_ACTIVE, ROOM_STATE_LABELS, activeZones, coldLimits, orderDue, roomState, stockAlerts, taskLate, taskOpen, today, type Booking, type Doc, type Item, type Order, type Payment, type PhotoCategory, type Room, type Settings, type Stay, type Table, type Task, type Temp, type VenueKind, type VenueZone } from "@/lib/venue/model";
import type { BadgeTone, VenueSceneProps } from "../workspace/types";
import type { VenueState } from "./useVenue";
import { ZONE_META } from "./zones";

const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n > 1 ? p : s}`;
const PHOTO_FOR: Partial<Record<VenueZone, PhotoCategory>> = { reception: "reception", chambres: "chambres", restaurant: "restaurant" };

/**
 * Données du plan : zones déclarées, badges calculés sur les fiches enregistrées, chambres
 * réellement créées (aucune chambre fictive n'est dessinée).
 */
export function venueScene(kind: VenueKind, s: VenueState | null, settings: Settings, selected: VenueZone | null, onZone: (z: VenueZone) => void, selectedRoom: string | null, onRoom: (id: string) => void): VenueSceneProps {
  const d = s?.data;
  const zones = activeZones(settings);
  const t = today();
  const items = (d?.item ?? []) as Doc<Item>[];
  const tasks = ((d?.task ?? []) as Doc<Task>[]).filter((x) => taskOpen(x.data));
  const pays = (d?.payment ?? []) as Doc<Payment>[];
  const orders = (d?.order ?? []) as Doc<Order>[];
  const tables = (d?.table ?? []) as Doc<Table>[];
  const bookings = ((d?.booking ?? []) as Doc<Booking>[]).filter((b) => b.data.date === t && BOOKING_ACTIVE.includes(b.data.status));
  const stays = (d?.stay ?? []) as Doc<Stay>[];
  const rooms = ((d?.room ?? []) as Doc<Room>[]).slice().sort((a, b) => a.data.number.localeCompare(b.data.number, "fr", { numeric: true }));

  const zoneTasks = (z: string) => tasks.filter((x) => x.data.zone === z);
  const lateOrUrgent = (z: string) => zoneTasks(z).filter((x) => taskLate(x.data) || x.data.urgent).length;
  const seats = (z: Table["zone"]) => tables.filter((x) => x.data.active && x.data.zone === z).reduce((a, x) => a + x.data.seats, 0);
  const booked = (z: Table["zone"]) => {
    const ids = new Set(tables.filter((x) => x.data.zone === z).map((x) => x.id));
    return bookings.filter((b) => ids.has(b.data.table_id)).length;
  };

  const badge = (id: VenueZone): { text: string; tone: BadgeTone } | null => {
    if (!d) return null;
    switch (id) {
      case "cuisine": {
        const queue = orders.filter((o) => (o.data.status === "en_attente" || o.data.status === "en_preparation") && o.data.lines.some((l) => l.kitchen)).length;
        if (kind === "hotel" && queue) return { text: `${plural(queue, "commande")} à préparer`, tone: "active" };
        const ko = lateOrUrgent("cuisine");
        return ko ? { text: `${ko} à traiter`, tone: "alert" } : null;
      }
      case "salle":
      case "terrasse":
      case "restaurant": {
        const z = id === "restaurant" ? "restaurant" : id;
        const b = booked(z);
        const ready = id === "restaurant" ? orders.filter((o) => o.data.status === "prete").length : 0;
        if (ready) return { text: `${plural(ready, "commande")} prête(s)`, tone: "active" };
        if (b) return { text: `${plural(b, "réservation")} aujourd'hui`, tone: "active" };
        const k = seats(z);
        return k ? { text: `${plural(k, "place")}`, tone: "idle" } : null;
      }
      case "stock": {
        const a = stockAlerts(items.filter((i) => i.data.zone === "stock"));
        const k = a.out.length + a.low.length;
        return k ? { text: `${k} en alerte`, tone: "alert" } : null;
      }
      case "froid": {
        const out = ((d.temp ?? []) as Doc<Temp>[]).filter((x) => x.data.zone === "froid" && x.data.out && !x.data.treated).length;
        if (out) return { text: `${plural(out, "alerte")} température`, tone: "alert" };
        const last = ((d.temp ?? []) as Doc<Temp>[]).filter((x) => x.data.zone === "froid").sort((a, b) => b.data.at.localeCompare(a.data.at))[0];
        if (last) return { text: `${last.data.value} °C (saisi)`, tone: "idle" };
        return coldLimits(settings, items).configured ? null : { text: "Seuils à définir", tone: "idle" };
      }
      case "toilettes": {
        const late = zoneTasks("toilettes").filter((x) => taskLate(x.data)).length;
        const a = stockAlerts(items.filter((i) => i.data.zone === "toilettes"));
        const k = late + a.out.length + a.low.length;
        return k ? { text: `${k} à traiter`, tone: "alert" } : zoneTasks("toilettes").length ? { text: plural(zoneTasks("toilettes").length, "tâche"), tone: "active" } : null;
      }
      case "caisse": {
        const k = orders.filter((o) => o.data.status !== "annulee" && orderDue(o.data, pays, o.id) > 0).length;
        return k ? { text: `${plural(k, "commande")} à encaisser`, tone: "active" } : null;
      }
      case "bureau": {
        const k = tasks.filter((x) => taskLate(x.data) || x.data.urgent).length;
        return k ? { text: `${k} urgent(s)`, tone: "alert" } : tasks.length ? { text: plural(tasks.length, "tâche"), tone: "active" } : null;
      }
      case "reception": {
        const arr = stays.filter((x) => x.data.status === "reservee" && x.data.arrival <= t).length;
        const dep = stays.filter((x) => x.data.status === "arrivee" && x.data.departure <= t).length;
        return arr + dep ? { text: `${arr} arrivée(s) · ${dep} départ(s)`, tone: "active" } : null;
      }
      case "chambres": {
        if (!rooms.length) return { text: "Ajoutez vos chambres", tone: "idle" };
        const free = rooms.filter((r) => roomState(r, stays) === "disponible").length;
        return { text: `${free}/${rooms.length} disponibles`, tone: "idle" };
      }
    }
    return null;
  };

  const layout = kind === "restaurant" ? { areas: restaurantAreas(settings), slots: [] } : hotelAreas(settings);
  const areas = layout.areas
    .filter((a) => zones.includes(a.id))
    .map((a) => {
      const cat = PHOTO_FOR[a.id];
      return { id: a.id, label: ZONE_META[kind][a.id]!.label, showLabel: a.label, x: a.x, z: a.z, w: a.w, d: a.d, tint: cat ? (settings.tints[cat] ?? null) : null, badge: a.label ? badge(a.id) : null };
    });
  const roomViews = rooms.slice(0, layout.slots.length).map((r, i) => {
    const st = roomState(r, stays);
    const slot = layout.slots[i]!;
    return { id: r.id, number: r.data.number, state: st, stateLabel: ROOM_STATE_LABELS[st], ...slot };
  });
  return { kind, areas, selected, onZone, rooms: roomViews, extraRooms: Math.max(0, rooms.length - layout.slots.length), selectedRoom, onRoom, photoTinted: Object.keys(settings.tints).length > 0 };
}
