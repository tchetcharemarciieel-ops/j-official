import { has, type Permission } from "../team";
import { LEVEL, type Courier, type Doc, type Order, type TransportData, type TransportRole, type Vehicle } from "./model";

/**
 * Données renvoyées à une personne selon son rôle et son poste (le serveur filtre ici) :
 * un livreur ne voit que ses missions, son profil et son véhicule ; la comptabilité ne voit pas
 * les photos ; seuls les postes autorisés voient les finances.
 */
export function visibleData(data: TransportData, me: string, role: TransportRole, perms: Permission[] | null): TransportData {
  const out: TransportData = { ...data, file: [], counter: [] };
  const may = (p: Permission | Permission[]) => has(perms, p);
  const mgr = LEVEL[role] >= 2;
  const myCourier = (data.courier as Doc<Courier>[]).find((c) => c.data.user_id === me);
  const wide = mgr || may(["livraisons", "finances", "rapports"]);
  out.order = wide ? data.order : (data.order as Doc<Order>[]).filter((o) => myCourier && o.data.courier_id === myCourier.id);
  out.courier = mgr || may(["livreurs", "livraisons", "finances", "rapports"]) ? data.courier : myCourier ? [myCourier] : [];
  out.vehicle = mgr || may(["vehicules", "livraisons"]) ? data.vehicle : (data.vehicle as Doc<Vehicle>[]).filter((v) => myCourier && (v.id === myCourier.data.vehicle_id || v.data.driver_id === myCourier.id));
  out.transaction = may(["finances", "rapports"]) ? data.transaction : [];
  return out;
}

/** Une photo n'est servie qu'à celui qui voit la commande qui la contient (ou pour le logo). */
export function fileAllowed(visibleOrders: Doc<Order>[], perms: Permission[] | null, logoId: string | null, fileId: string) {
  if (fileId === logoId) return true;
  return visibleOrders.some((o) => o.data.parcel.photo_ids.includes(fileId) || o.data.proof?.photo_id === fileId) && has(perms, ["livraisons", "missions"]);
}
