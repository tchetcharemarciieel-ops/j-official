"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BureauPitch } from "@/app/creer/BureauPitch";
import { ShopPitch } from "@/app/creer/ShopPitch";
import { TransportPitch } from "@/app/creer/TransportPitch";
import { CATALOG_GRID, CatalogCard, CatalogModal, type CatalogItem } from "./Catalog";

/** Les logiciels prêts à l'emploi de MiniSoft RCA : cartes compactes, présentation détaillée, puis création. */
export const PRODUCTS: CatalogItem[] = [
  {
    id: "shop", icon: "shop", tone: "blue", name: "MiniSoft Shop", short: "Caisse, stock et boutique en ligne pour votre commerce.",
    features: ["Caisse avec reçus", "Stock et alertes", "Boutique en ligne + QR"], cta: "Créer",
    detail: {
      description: "Un logiciel complet pour boutiques de vêtements, supérettes, parfumeries, téléphones, chaussures, quincailleries… Vous vendez en boutique et en ligne, suivez votre stock, vos clients et vos bénéfices, depuis votre téléphone.",
      features: ["Caisse avec reçus et monnaie", "Stock, variantes et alertes de rupture", "Boutique en ligne et commandes", "QR code à imprimer", "Clients, fournisseurs, équipe", "Ventes, marges et bénéfices", "Paiement à la livraison ou ZingoPay", "Assistant MiniSoft AI"],
      benefits: ["Plus de cahiers perdus : chaque vente est enregistrée", "Vous savez ce qui se vend et ce qui manque", "Fonctionne sur téléphone, sans installation"],
    },
  },
  {
    id: "bureau", icon: "bureau", tone: "indigo", name: "MiniSoft Bureau", short: "Clients, projets, équipe et facturation d'une agence.",
    features: ["Clients et projets", "Agenda et équipe", "Devis et factures PDF"], cta: "Créer",
    detail: {
      description: "La gestion d'une agence ou d'un bureau au même endroit : agence immobilière, de communication, cabinet administratif, agence commerciale ou bureau classique. Les modules s'adaptent à votre métier.",
      features: ["Clients, historique et documents", "Projets, tâches et collaborateurs", "Agenda, rendez-vous et réunions", "Devis, factures, reçus et contrats PDF", "Recettes, dépenses et rapports", "Messagerie interne", "Bureau virtuel 2D / 3D", "Postes et permissions", "Assistant MiniSoft AI"],
      benefits: ["Tout votre bureau dans un seul outil", "Chacun voit uniquement ce qui le concerne", "Mode clair et sombre, utilisable sur téléphone"],
    },
  },
  {
    id: "transport", icon: "transport", tone: "emerald", name: "MiniSoft Transport", short: "Commandes, livreurs, véhicules et suivi des colis.",
    features: ["Suivi public des colis", "Application livreur", "Tarifs automatiques"], cta: "Créer",
    detail: {
      description: "Pour les services de livraison, coursiers, transporteurs, restaurants et boutiques qui livrent : vous enregistrez les commandes, affectez les livreurs et vos clients suivent leur colis avec un numéro de suivi.",
      features: ["Commandes, colis et numéro de suivi unique", "Page publique de commande et de suivi", "Application livreur sur téléphone", "Tarifs : distance, zone, poids, urgence", "Véhicules, entretien et carburant", "Carte des points localisés", "Paiements, factures et rapports PDF", "Assistant MiniSoft AI"],
      benefits: ["Vos clients voient où en est leur colis", "Chaque livreur ne voit que ses missions", "Prix calculé avec vos propres tarifs"],
    },
  },
  {
    id: "custom", icon: "custom", tone: "amber", name: "Logiciel sur mesure", short: "Décrivez votre besoin, MiniSoft RCA crée votre logiciel.",
    features: ["Une phrase suffit", "Plan validé par vous", "Testé avant publication"], cta: "Décrire",
    detail: {
      description: "Votre activité est différente ? Décrivez votre problème en une phrase, à l'écrit ou à la voix : MiniSoft RCA propose les écrans, les champs et le tableau de bord, puis crée un logiciel adapté.",
      features: ["Restaurants, pharmacies, garages, écoles…", "Écrans et champs adaptés à votre métier", "Tableau de bord en FCFA", "Équipe et rôles", "Exports Excel et PDF", "Import de vos fichiers"],
      benefits: ["Sans programmer, en français", "Vous gardez ou retirez chaque fonctionnalité", "Modifiable à tout moment"],
    },
  },
];

const FORMS = { shop: ShopPitch, bureau: BureauPitch, transport: TransportPitch } as const;

/**
 * `mode="create"` (page de création) : la fiche contient le formulaire de création ; `mode="link"`
 * (accueil) : le bouton mène à la page de création du logiciel choisi.
 */
export function ProductCatalog({ mode }: { mode: "create" | "link" }) {
  const [open, setOpen] = useState<CatalogItem | null>(null);
  const [creating, setCreating] = useState(false);
  const wanted = useSearchParams().get("logiciel");
  useEffect(() => {
    const p = PRODUCTS.find((x) => x.id === wanted && x.id !== "custom");
    if (mode === "create" && p) { setOpen(p); setCreating(true); }
  }, [wanted, mode]);
  const close = () => { setOpen(null); setCreating(false); };
  const Form = open && open.id in FORMS ? FORMS[open.id as keyof typeof FORMS] : null;
  const custom = open?.id === "custom";
  return (
    <>
      <div className={CATALOG_GRID}>{PRODUCTS.map((p) => <CatalogCard key={p.id} item={p} onOpen={(i) => (setOpen(i), setCreating(false))} />)}</div>
      {open && (
        <CatalogModal
          item={open}
          onClose={close}
          footer={
            creating ? null : mode === "link" ? (
              <Link href={custom ? "/creer#decrire" : `/creer?logiciel=${open.id}`} className="btn btn-primary w-full sm:w-auto">{custom ? "Décrire mon besoin" : "Créer mon logiciel"}</Link>
            ) : custom ? (
              <a href="#decrire" onClick={close} className="btn btn-primary w-full sm:w-auto">Décrire mon besoin</a>
            ) : (
              <button className="btn btn-primary w-full sm:w-auto" onClick={() => setCreating(true)}>Créer mon logiciel</button>
            )
          }
        >
          {creating && Form ? (
            <div>
              <p className="mb-3 text-sm text-slate-600">Quelques informations pour préparer votre espace. Vous pourrez tout modifier ensuite.</p>
              <Form embedded onCancel={() => setCreating(false)} />
            </div>
          ) : undefined}
        </CatalogModal>
      )}
    </>
  );
}
