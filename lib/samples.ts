import type { Field } from "./spec";
import type { RecordData } from "./records";

/** Données d'exemple réalistes (Afrique centrale, FCFA) pour l'aperçu et la démo. */

const PEOPLE = ["Aïcha Mbarga", "Jean-Paul Ndongo", "Mireille Fotso", "Ibrahim Bello", "Christelle Ngo Biyong", "Patrick Essomba", "Fatimé Hamadou", "Serge Tchoupo"];
const QUARTIERS = ["Bastos, Yaoundé", "Akwa, Douala", "Bonapriso, Douala", "Mvog-Mbi, Yaoundé", "Bonamoussadi, Douala", "Biyem-Assi, Yaoundé"];

const BY_ENTITY: Record<string, Record<string, string[]>> = {
  produits: { nom: ["Riz parfumé 25 kg", "Huile de palme 5 L", "Sucre 1 kg", "Lait en poudre 400 g", "Savon de Marseille", "Farine 50 kg"], categorie: ["Épicerie", "Épicerie", "Épicerie", "Produits laitiers", "Hygiène", "Épicerie"] },
  medicaments: { nom: ["Paracétamol 500 mg", "Amoxicilline 1 g", "Ibuprofène 400 mg", "Vitamine C 1000", "Sirop contre la toux", "Métronidazole 250 mg"], lot: ["L2401", "L2398", "L2412", "L2377", "L2420", "L2405"] },
  ventes: { article: ["Riz parfumé 25 kg", "Huile 5 L", "Coupe + brushing", "Pack boissons", "Savon x10", "Sucre 1 kg"] },
  depenses: { libelle: ["Achat de gaz", "Facture ENEO", "Loyer du local", "Transport marchandises", "Salaire aide-cuisinier", "Achat légumes marché"] },
  rendezvous: { prestation: ["Tresses", "Coupe homme", "Manucure", "Défrisage", "Barbe", "Soin du visage"], heure: ["09:00", "10:30", "11:00", "14:00", "15:30", "17:00"] },
  reparations: { vehicule: ["Toyota Corolla", "Hyundai Elantra", "Moto Nanfang", "Toyota Hilux", "Peugeot 406", "Kia Rio"], immatriculation: ["LT 234 AB", "CE 551 CD", "OU 908 EF", "LT 112 GH", "CE 773 JK", "SW 409 LM"], diagnostic: ["Vidange + filtres", "Plaquettes de frein usées", "Embrayage à changer", "Batterie faible", "Bruit suspension avant", "Climatisation"] },
  eleves: { nom: PEOPLE, classe: ["6e A", "6e A", "5e B", "4e A", "3e C", "5e B"], parent: ["M. Mbarga", "Mme Ndongo", "M. Fotso", "M. Bello", "Mme Ngo Biyong", "M. Essomba"] },
  paiements: { payeur: PEOPLE, motif: ["Scolarité 1er trimestre", "Inscription", "Scolarité 2e trimestre", "Loyer octobre", "Cotisation", "Frais d'examen"] },
  chambres: { numero: ["101", "102", "103", "201", "202", "301"] },
  reservations: { client: PEOPLE },
  biens: { designation: ["Studio meublé Bastos", "Appartement 3 pièces Akwa", "Villa Bonapriso", "Bureau 40 m² centre-ville", "Terrain 500 m² Odza", "Studio Mvog-Mbi"] },
  locataires: { nom: PEOPLE },
  livraisons: { destinataire: PEOPLE, chauffeur: ["Ali", "Emmanuel", "Boris", "Ali", "Emmanuel", "Boris"] },
  vehicules: { immatriculation: ["LT 401 AA", "CE 302 BB", "LT 777 CC", "OU 120 DD", "CE 645 EE", "LT 908 FF"], modele: ["Toyota Hiace", "Isuzu NPR", "Toyota Corolla", "Moto Haojue", "Renault Master", "Toyota Hilux"] },
  employes: { nom: PEOPLE, poste: ["Caissière", "Serveur", "Cuisinier", "Gérante", "Livreur", "Comptable"] },
  taches: { titre: ["Inventaire du stock", "Relancer les impayés", "Préparer la paie", "Réparer la vitrine", "Commande fournisseur", "Former le nouveau caissier"], responsable: PEOPLE },
  fournisseurs: { nom: ["Brasseries du Cameroun", "Sodecoton", "Grossiste Mboppi", "Pharmacam", "Nestlé Cameroun", "SCDP Gaz"], contact: PEOPLE },
};

const GENERIC: Record<string, string[]> = {
  nom: PEOPLE,
  nom_client: PEOPLE,
  client: PEOPLE,
  payeur: PEOPLE,
  responsable: PEOPLE,
  contact: PEOPLE,
  adresse: QUARTIERS,
  categorie: ["Général", "Courant", "Important", "Général", "Courant", "Autre"],
};

const MONEY = [12500, 8000, 45000, 3500, 27000, 15000];
const QUANTITIES = [3, 40, 12, 2, 60, 25];

function pick<T>(list: T[], i: number): T {
  return list[i % list.length]!;
}

export function sampleValue(field: Field, i: number, entityKey = "", now = new Date()): RecordData[string] {
  const specific = BY_ENTITY[entityKey]?.[field.key] ?? GENERIC[field.key];
  switch (field.type) {
    case "text": {
      if (specific) return pick(specific, i);
      if (/reference|numero|^ref/.test(field.key)) return `${entityKey.slice(0, 3).toUpperCase() || "REF"}-${String(1001 + i)}`;
      return `${field.label} ${i + 1}`;
    }
    case "longtext":
      return specific ? pick(specific, i) : i % 2 ? "RAS" : "À suivre la semaine prochaine.";
    case "number":
      if (field.key === "seuil") return 5;
      if (/quantite|stock|qte/.test(field.key)) return pick(QUANTITIES, i);
      return (i * 3 + 1) % 10;
    case "money":
      return pick(MONEY, i) * (/loyer|salaire|tarif|prix_achat/.test(field.key) ? 3 : 1);
    case "date": {
      const future = /echeance|depart|peremption|prochain/.test(field.key);
      const offset = future ? (i + 1) * 12 : -i * 9;
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    case "boolean":
      return i % 3 !== 2;
    case "email":
      return `${(specific ? pick(specific, i) : `contact${i + 1}`).toLowerCase().normalize("NFD").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "")}@exemple.cm`;
    case "phone":
      return `+237 6 ${70 + i} ${String(10 + i * 7).padStart(2, "0")} ${String(20 + i * 3).padStart(2, "0")} ${String(30 + i).padStart(2, "0")}`;
    case "select":
      return field.options?.length ? pick(field.options, i) : null;
    case "relation":
      return null;
  }
}
