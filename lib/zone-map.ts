/**
 * Dans un restaurant, un hôtel ou un garage, toucher un module (stock, commandes, clients…) doit
 * ouvrir la zone détaillée du plan (écran cuisine, ingrédients et stock, chambres…) et non un simple
 * tableau de données. Cette correspondance se fait sur le nom du module : aucune donnée n'est lue.
 */
export type ZoneLayout = "restaurant" | "hotel" | "garage";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function zoneForEntity(layout: ZoneLayout, e: { key: string; label?: string; labelPlural?: string }): string {
  const t = norm(`${e.key} ${e.label ?? ""} ${e.labelPlural ?? ""}`);
  const is = (re: RegExp) => re.test(t);
  if (layout === "garage") {
    if (is(/stock|piece|produit|article|inventaire|fournisseur/)) return "stock";
    if (is(/repar|atelier|vehicule|intervention|diagnostic|entretien/)) return "atelier";
    if (is(/client|rendez|accueil|devis|reception/)) return "accueil";
    return "bureau";
  }
  if (layout === "hotel") {
    if (is(/stock|produit|ingredient|article|inventaire|boisson|marchandise|recette|hygiene/)) return "cuisine";
    if (is(/commande|plat|menu|restaurant|table/)) return "restaurant";
    if (is(/chambre|logement|menage|reservation|sejour|hote|client|arrivee/)) return is(/chambre|logement|menage/) ? "chambres" : "reception";
    return "bureau";
  }
  // restaurant
  if (is(/stock|produit|ingredient|article|inventaire|boisson|marchandise/)) return "stock";
  if (is(/commande|plat|menu|cuisine|recette/)) return "cuisine";
  if (is(/reservation|table|salle|rendez|client/)) return "salle";
  if (is(/vente|caisse|paiement|encaiss|facture/)) return "caisse";
  return "bureau";
}
