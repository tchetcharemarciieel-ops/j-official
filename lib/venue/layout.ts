import type { Settings, VenueZone } from "./model";

/** Rectangle d'une zone sur le plan (centre x/z, largeur w, profondeur d) dans la pièce de 12 × 9. */
export type AreaRect = { id: VenueZone; x: number; z: number; w: number; d: number; label: boolean };
export type RoomSlot = { x: number; z: number; w: number; d: number };

/**
 * Plan du restaurant : la terrasse n'existe que si elle a été déclarée ; sans elle, la salle
 * occupe toute la largeur (aucun espace vide réservé).
 */
export function restaurantAreas(s: Pick<Settings, "terrace">): AreaRect[] {
  const top: AreaRect[] = [
    { id: "cuisine", x: -3.5, z: -3, w: 5, d: 3, label: true },
    { id: "stock", x: 0, z: -3, w: 2, d: 3, label: true },
    { id: "froid", x: 2.25, z: -3, w: 2.5, d: 3, label: true },
    { id: "toilettes", x: 4.75, z: -3, w: 2.5, d: 3, label: true },
  ];
  const right: AreaRect[] = [
    { id: "caisse", x: 4.5, z: 0, w: 3, d: 3, label: true },
    { id: "bureau", x: 4.5, z: 3, w: 3, d: 3, label: true },
  ];
  return s.terrace
    ? [...top, { id: "terrasse", x: -4.75, z: 1.5, w: 2.5, d: 6, label: true }, { id: "salle", x: -0.25, z: 1.5, w: 6.5, d: 6, label: true }, ...right]
    : [...top, { id: "salle", x: -1.5, z: 1.5, w: 9, d: 6, label: true }, ...right];
}

/** Plan de l'hôtel : restaurant et cuisine seulement si l'hôtel en possède ; chambres en grille. */
export function hotelAreas(s: Pick<Settings, "has_restaurant">): { areas: AreaRect[]; slots: RoomSlot[] } {
  const bottom: AreaRect[] = [
    { id: "reception", x: -1.5, z: 3, w: 9, d: 3, label: true },
    { id: "bureau", x: 4.5, z: 3, w: 3, d: 3, label: true },
  ];
  const middle: AreaRect = { id: "chambres", x: 0, z: 0, w: 12, d: 3, label: true };
  const rowB = Array.from({ length: 8 }, (_, i) => ({ x: -5.25 + i * 1.5, z: 0, w: 1.4, d: 2.7 }));
  if (s.has_restaurant) {
    const top: AreaRect[] = [
      { id: "restaurant", x: -4, z: -3, w: 4, d: 3, label: true },
      { id: "cuisine", x: -0.5, z: -3, w: 3, d: 3, label: true },
      { id: "chambres", x: 3.5, z: -3, w: 5, d: 3, label: false },
    ];
    const rowA = Array.from({ length: 3 }, (_, i) => ({ x: 1 + 5 / 6 + (i * 5) / 3, z: -3, w: 1.55, d: 2.7 }));
    return { areas: [...top, middle, ...bottom], slots: [...rowA, ...rowB] };
  }
  const rowA = Array.from({ length: 8 }, (_, i) => ({ x: -5.25 + i * 1.5, z: -3, w: 1.4, d: 2.7 }));
  return { areas: [{ id: "chambres", x: 0, z: -3, w: 12, d: 3, label: false }, middle, ...bottom], slots: [...rowA, ...rowB] };
}
