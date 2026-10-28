"use client";

import {
  Armchair,
  ArrowLeftRight,
  BarChart3,
  Bath,
  BedDouble,
  Bell,
  Boxes,
  Briefcase,
  Brush,
  Calculator,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  ChefHat,
  ClipboardList,
  ConciergeBell,
  CookingPot,
  CreditCard,
  FileText,
  LayoutDashboard,
  LogIn,
  Package,
  Receipt,
  Refrigerator,
  ShieldCheck,
  ShoppingBag,
  Snowflake,
  SprayCan,
  Sun,
  Thermometer,
  TriangleAlert,
  Umbrella,
  UserRound,
  Users,
  Utensils,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { BOOKING_ACTIVE, capacity, expiryState, orderDue, roomState, stockAlerts, stockValue, taskLate, taskOpen, today, type Booking, type Doc, type Equip, type Item, type Lot, type Order, type Payment, type Room, type Stay, type Table, type Task, type Temp, type VenueData, type VenueKind, type VenueZone } from "@/lib/venue/model";
import { BudgetView, BookingsView, CapacityView, EquipList, InstallationsSummary, TablesView, TasksView } from "./m-space";
import { AlertsView, ColdAlerts, LotsView, MovesView, ProductsView, TempView, ValueView } from "./m-stock";
import { CashReport, KitchenQueue, MenuView, OrderComposer, OrdersList, PaymentForm, PaymentsView, ReceiptsView, RecipesView } from "./m-sales";
import { Dashboard, FinanceView, ReportsView, StaffView, TasksAlerts } from "./m-office";
import { ArrivalsView, AvailabilityView, GuestsView, RoomsList, StayPaymentsView, StaysView } from "./m-hotel";
import { useState } from "react";
import { Card } from "./ui";

export type ZoneMeta = { label: string; icon: LucideIcon; description: string };

export const ZONE_META: Record<VenueKind, Partial<Record<VenueZone, ZoneMeta>>> = {
  restaurant: {
    cuisine: { label: "Cuisine", icon: CookingPot, description: "Équipements de la cuisine et budget" },
    salle: { label: "Salle de restaurant", icon: Utensils, description: "Tables, capacité, réservations et budget" },
    stock: { label: "Stock", icon: Boxes, description: "Produits, entrées et sorties, alertes, valeur" },
    froid: { label: "Chambre froide", icon: Snowflake, description: "Températures, produits, dates, alertes" },
    toilettes: { label: "Toilettes", icon: Bath, description: "Aménagement, nettoyage, fournitures, budget" },
    caisse: { label: "Accueil / Caisse", icon: ConciergeBell, description: "Commandes, paiements, reçus, rapport de caisse" },
    bureau: { label: "Bureau", icon: Briefcase, description: "Tableau de bord, personnel, finances, rapports" },
    terrasse: { label: "Terrasse", icon: Umbrella, description: "Mobilier extérieur, capacité, réservations, aménagement" },
  },
  hotel: {
    reception: { label: "Réception", icon: ConciergeBell, description: "Réservations, arrivées, disponibilité, factures, clients" },
    chambres: { label: "Chambres", icon: BedDouble, description: "Informations, état, nettoyage, réservations, équipements" },
    restaurant: { label: "Restaurant", icon: Utensils, description: "Salle, commandes, carte, cuisine, caisse" },
    cuisine: { label: "Cuisine", icon: ChefHat, description: "Commandes, stock, recettes, hygiène, équipe" },
    bureau: { label: "Bureau", icon: Briefcase, description: "Tableau de bord, finances, personnel, rapports, alertes" },
  },
};

export type Option = { id: string; icon: LucideIcon; title: string; description: string; render: () => React.ReactNode; hint?: (d: VenueData) => { text: string; tone?: "alert" | "active" } | null };

const n = (x: number, s: string, p = `${s}s`) => `${x} ${x > 1 ? p : s}`;
const items = (d: VenueData, zone: Item["zone"]) => (d.item as Doc<Item>[]).filter((i) => i.data.zone === zone);
const tasksOf = (d: VenueData, zone: string) => (d.task as Doc<Task>[]).filter((t) => t.data.zone === zone && taskOpen(t.data));
const equipOf = (d: VenueData, zone: string) => (d.equip as Doc<Equip>[]).filter((e) => e.data.zone === zone);
const tablesOf = (d: VenueData, zone: Table["zone"]) => (d.table as Doc<Table>[]).filter((t) => t.data.zone === zone && t.data.active);
const bookingsToday = (d: VenueData, zone: Table["zone"]) => {
  const ids = new Set(tablesOf(d, zone).map((t) => t.id));
  return (d.booking as Doc<Booking>[]).filter((b) => ids.has(b.data.table_id) && b.data.date === today() && BOOKING_ACTIVE.includes(b.data.status)).length;
};
const alertHint = (d: VenueData, zone: Item["zone"]) => {
  const a = stockAlerts(items(d, zone));
  const k = a.out.length + a.low.length;
  return k ? { text: `${n(k, "produit")} sous le seuil`, tone: "alert" as const } : null;
};

function tablesOptions(zone: "salle" | "terrasse" | "restaurant"): Option[] {
  return [
    { id: "tables", icon: Armchair, title: "Tables et chaises", description: zone === "terrasse" ? "Ajouter, modifier et organiser le mobilier extérieur" : "Gérer le mobilier et son emplacement", render: () => <TablesView zone={zone} />, hint: (d) => { const c = capacity(d.table as Doc<Table>[], zone); return c.tables ? { text: `${n(c.tables, "table")} · ${n(c.seats, "chaise")}` } : null; } },
    { id: "capacite", icon: Users, title: "Capacité d'accueil", description: "Nombre de places calculé selon les tables et chaises", render: () => <CapacityView zone={zone} />, hint: (d) => { const c = capacity(d.table as Doc<Table>[], zone); return c.tables ? { text: `${n(c.seats, "place")}` } : null; } },
    { id: "reservations", icon: CalendarDays, title: "Réservation des tables", description: "Consulter et organiser les réservations", render: () => <BookingsView zone={zone} />, hint: (d) => { const b = bookingsToday(d, zone); return b ? { text: `${n(b, "réservation")} aujourd'hui`, tone: "active" } : null; } },
  ];
}

/** Fonctions de chaque zone (exactement celles demandées pour chaque zone). */
export function zoneOptions(kind: VenueKind, zone: VenueZone, roomService: boolean): Option[] {
  if (kind === "restaurant") {
    switch (zone) {
      case "cuisine":
        return [
          { id: "equipements", icon: Refrigerator, title: "Équipements et inventaire", description: "Consulter les équipements de la cuisine", render: () => <EquipList zone="cuisine" categories={["equipement", "mobilier", "installation"]} title="Équipements de la cuisine" />, hint: (d) => { const e = equipOf(d, "cuisine"); const ko = e.filter((x) => x.data.owned && ["panne", "endommage", "maintenance"].includes(x.data.condition)).length; return ko ? { text: `${ko} à réparer`, tone: "alert" } : e.length ? { text: n(e.length, "équipement") } : null; } },
          { id: "budget", icon: Calculator, title: "Estimation du budget", description: "Obtenir une estimation du coût des équipements", render: () => <BudgetView zone="cuisine" /> },
        ];
      case "salle":
        return [...tablesOptions("salle"), { id: "budget", icon: Calculator, title: "Estimation du budget", description: "Estimer le coût du mobilier et de l'aménagement", render: () => <SalleBudget zone="salle" /> }];
      case "terrasse":
        return [
          ...tablesOptions("terrasse"),
          { id: "amenagement", icon: Sun, title: "Aménagement extérieur", description: "Parasols, éclairage, plantes et décorations", render: () => <EquipList zone="terrasse" categories={["parasol", "eclairage", "plante", "decoration", "amenagement"]} title="Aménagement extérieur" /> },
          { id: "budget", icon: Calculator, title: "Estimation du budget", description: "Coût du mobilier et des équipements extérieurs (prix saisis)", render: () => <BudgetView zone="terrasse" tableZone="terrasse" /> },
        ];
      case "stock":
        return [
          { id: "produits", icon: Package, title: "Gestion des produits", description: "Ingrédients, boissons et marchandises, quantités et prix", render: () => <ProductsView zone="stock" categories={["ingredient", "boisson", "marchandise", "autre"]} />, hint: (d) => { const k = items(d, "stock").filter((i) => i.data.active).length; return k ? { text: n(k, "produit") } : null; } },
          { id: "mouvements", icon: ArrowLeftRight, title: "Entrées et sorties", description: "Achats, livraisons reçues, produits utilisés ou retirés", render: () => <MovesView zone="stock" /> },
          { id: "alertes", icon: TriangleAlert, title: "Alertes de stock", description: "Seuils minimum et produits en quantité insuffisante", render: () => <AlertsView zone="stock" />, hint: (d) => alertHint(d, "stock") },
          { id: "valeur", icon: Wallet, title: "Valeur du stock", description: "Valeur estimée à partir des quantités et des prix saisis", render: () => <ValueView zones={["stock"]} />, hint: (d) => { const v = stockValue(items(d, "stock")); return v.count ? { text: `${v.value.toLocaleString("fr-FR")} FCFA` } : null; } },
        ];
      case "toilettes":
        return [
          { id: "amenagement", icon: Bath, title: "Capacité et aménagement", description: "Installations et leur organisation", render: () => <ToiletsLayout /> },
          { id: "nettoyage", icon: Brush, title: "Nettoyage et entretien", description: "Tâches, fréquence et suivi de réalisation", render: () => <TasksView zone="toilettes" kinds={["nettoyage", "entretien", "reparation", "signalement"]} title="Nettoyage des toilettes" />, hint: (d) => { const t = tasksOf(d, "toilettes"); const late = t.filter((x) => taskLate(x.data)).length; return late ? { text: `${late} en retard`, tone: "alert" } : t.length ? { text: n(t.length, "tâche"), tone: "active" } : null; } },
          { id: "produits", icon: SprayCan, title: "Produits d'entretien", description: "Savon, papier toilette et autres fournitures, alertes de stock", render: () => <SuppliesView />, hint: (d) => alertHint(d, "toilettes") },
          { id: "budget", icon: Calculator, title: "Budget d'aménagement", description: "Coût des équipements et des fournitures", render: () => <BudgetView zone="toilettes" stockZone="toilettes" /> },
        ];
      case "froid":
        return [
          { id: "temperature", icon: Thermometer, title: "Température", description: "Relevés manuels, historique et seuils", render: () => <TempView zone="froid" />, hint: (d) => { const last = (d.temp as Doc<Temp>[]).filter((t) => t.data.zone === "froid").sort((a, b) => b.data.at.localeCompare(a.data.at))[0]; return last ? { text: `Dernier relevé : ${last.data.value} °C (manuel)`, tone: last.data.out && !last.data.treated ? "alert" : undefined } : { text: "Aucun relevé" }; } },
          { id: "produits", icon: Package, title: "Produits stockés", description: "Produits, quantités et emplacement", render: () => <ProductsView zone="froid" categories={["ingredient", "boisson", "autre"]} cold /> },
          { id: "dates", icon: CalendarClock, title: "Dates et conservation", description: "Réception, date limite et alertes avant échéance", render: () => <LotsView zone="froid" />, hint: (d) => { const ids = new Set(items(d, "froid").map((i) => i.id)); const s = (d.settings[0]?.data as { expiry_warn_days?: number } | undefined)?.expiry_warn_days ?? 2; const k = (d.lot as Doc<Lot>[]).filter((l) => ids.has(l.data.item_id) && !l.data.closed && ["expire", "bientot"].includes(expiryState(l.data, s))).length; return k ? { text: `${n(k, "produit")} à vérifier`, tone: "alert" } : null; } },
          { id: "alertes", icon: Bell, title: "Alertes et entretien", description: "Températures hors seuils et entretien planifié", render: () => <ColdMaintenance />, hint: (d) => { const k = (d.temp as Doc<Temp>[]).filter((t) => t.data.zone === "froid" && t.data.out && !t.data.treated).length; return k ? { text: `${n(k, "alerte")} à traiter`, tone: "alert" } : null; } },
        ];
      case "caisse":
        return [
          { id: "commande", icon: ShoppingBag, title: "Prendre une commande", description: "Plats et boissons, quantités, total automatique", render: () => <TakeOrder /> },
          { id: "paiement", icon: CreditCard, title: "Encaisser un paiement", description: "Montant, mode de paiement, monnaie à rendre, statut", render: () => <PaymentsView />, hint: (d) => { const p = d.payment as Doc<Payment>[]; const k = (d.order as Doc<Order>[]).filter((o) => o.data.status !== "annulee" && orderDue(o.data, p, o.id) > 0).length; return k ? { text: `${n(k, "commande")} à encaisser`, tone: "active" } : null; } },
          { id: "recus", icon: Receipt, title: "Reçus et factures", description: "Numéro de commande, articles, total, date, mode de paiement", render: () => <ReceiptsView /> },
          { id: "rapport", icon: BarChart3, title: "Rapport de caisse", description: "Ventes du jour, commandes, montants encaissés, historique", render: () => <CashReport /> },
        ];
      case "bureau":
        return [
          { id: "tableau", icon: LayoutDashboard, title: "Tableau de bord", description: "Ventes, commandes, dépenses et indicateurs clés", render: () => <Dashboard /> },
          { id: "personnel", icon: Users, title: "Gestion du personnel", description: "Employés, rôles et horaires", render: () => <StaffView /> },
          { id: "finances", icon: Wallet, title: "Dépenses et bénéfices", description: "Dépenses, recettes et bénéfice estimé", render: () => <FinanceView /> },
          { id: "rapports", icon: BarChart3, title: "Rapports et statistiques", description: "Résultats par jour, semaine ou mois", render: () => <ReportsView /> },
          { id: "taches", icon: ClipboardList, title: "Tâches et alertes", description: "Tâches et signalements de toutes les zones", render: () => <TasksAlerts />, hint: (d) => { const t = (d.task as Doc<Task>[]).filter((x) => taskOpen(x.data)); return t.length ? { text: n(t.length, "tâche"), tone: t.some((x) => taskLate(x.data)) ? "alert" : "active" } : null; } },
        ];
    }
  }
  switch (zone) {
    case "reception":
      return [
        { id: "reservations", icon: CalendarDays, title: "Réservations", description: "Créer, modifier, annuler et consulter les réservations", render: () => <StaysView />, hint: (d) => { const k = (d.stay as Doc<Stay>[]).filter((s) => s.data.status === "reservee").length; return k ? { text: `${n(k, "réservation")} à venir`, tone: "active" } : null; } },
        { id: "arrivees", icon: LogIn, title: "Arrivées et départs", description: "Enregistrer les arrivées, les départs et l'état de la chambre", render: () => <ArrivalsView />, hint: (d) => { const t = today(); const k = (d.stay as Doc<Stay>[]).filter((s) => s.data.status === "reservee" && s.data.arrival <= t).length; return k ? { text: `${n(k, "arrivée")} attendue(s)`, tone: "active" } : null; } },
        { id: "disponibilite", icon: CalendarCheck, title: "Disponibilité des chambres", description: "Libres, réservées, occupées et en nettoyage", render: () => <AvailabilityView />, hint: (d) => { const rooms = d.room as Doc<Room>[]; const free = rooms.filter((r) => roomState(r, d.stay as Doc<Stay>[]) === "disponible").length; return rooms.length ? { text: `${free}/${rooms.length} disponibles` } : null; } },
        { id: "paiements", icon: CreditCard, title: "Paiements et factures", description: "Paiements, montants restants dus et factures", render: () => <StayPaymentsView /> },
        { id: "clients", icon: UserRound, title: "Informations des clients", description: "Fiches clients, accès limité à l'équipe autorisée", render: () => <GuestsView /> },
      ];
    case "restaurant":
      return [
        { id: "salle", icon: Armchair, title: "Salle et tables", description: "Tables, capacité, disponibilité et réservations", render: () => <HotelHall /> },
        { id: "commandes", icon: ShoppingBag, title: "Commandes", description: `Enregistrer une commande, l'associer à une table${roomService ? " ou à une chambre" : ""}, suivre son état`, render: () => <HotelOrders roomService={roomService} />, hint: (d) => { const k = (d.order as Doc<Order>[]).filter((o) => o.data.status === "prete").length; return k ? { text: `${n(k, "commande")} prête(s) à servir`, tone: "active" } : null; } },
        { id: "carte", icon: UtensilsCrossed, title: "Menu et prix", description: "Plats et boissons, catégories et prix", render: () => <MenuView /> },
        { id: "cuisine", icon: ChefHat, title: "Cuisine et stock", description: "Commandes à préparer, ingrédients et mouvements", render: () => <KitchenStock /> },
        { id: "caisse", icon: Wallet, title: "Caisse et facturation", description: "Paiements reçus, reçus, ventes et dépenses", render: () => <HotelCash /> },
      ];
    case "cuisine":
      return [
        { id: "commandes", icon: ClipboardList, title: "Commandes à préparer", description: "En attente, en préparation, prêtes", render: () => <KitchenQueue />, hint: (d) => { const k = (d.order as Doc<Order>[]).filter((o) => o.data.status === "en_attente" && o.data.lines.some((l) => l.kitchen)).length; return k ? { text: `${n(k, "nouvelle commande", "nouvelles commandes")}`, tone: "alert" } : null; } },
        { id: "stock", icon: Package, title: "Ingrédients et stock", description: "Ingrédients, entrées et sorties, seuils, péremption", render: () => <KitchenIngredients />, hint: (d) => alertHint(d, "stock") },
        { id: "recettes", icon: CookingPot, title: "Recettes et portions", description: "Ingrédients, coût estimé et quantités par portions", render: () => <RecipesView /> },
        { id: "hygiene", icon: ShieldCheck, title: "Hygiène et conservation", description: "Températures, nettoyage, dates et pannes", render: () => <KitchenHygiene />, hint: (d) => { const k = (d.temp as Doc<Temp>[]).filter((t) => t.data.zone === "cuisine" && t.data.out && !t.data.treated).length; return k ? { text: `${n(k, "alerte")}`, tone: "alert" } : null; } },
        { id: "equipe", icon: Users, title: "Équipe et dépenses", description: "Tâches de l'équipe, dépenses et pertes alimentaires", render: () => <KitchenTeam /> },
      ];
    case "bureau":
      return [
        { id: "tableau", icon: LayoutDashboard, title: "Tableau de bord", description: "Chambres, arrivées, restaurant, alertes", render: () => <Dashboard /> },
        { id: "finances", icon: Wallet, title: "Finances et dépenses", description: "Recettes, dépenses, factures à régler, bénéfice estimé", render: () => <FinanceView /> },
        { id: "personnel", icon: Users, title: "Personnel", description: "Comptes, rôles, employés et horaires", render: () => <StaffView /> },
        { id: "rapports", icon: BarChart3, title: "Rapports et statistiques", description: "Taux d'occupation, recettes et dépenses par période", render: () => <ReportsView /> },
        { id: "taches", icon: ClipboardList, title: "Tâches et alertes", description: "Problèmes signalés dans toutes les zones", render: () => <TasksAlerts />, hint: (d) => { const t = (d.task as Doc<Task>[]).filter((x) => taskOpen(x.data)); return t.length ? { text: n(t.length, "tâche"), tone: t.some((x) => taskLate(x.data) || x.data.urgent) ? "alert" : "active" } : null; } },
      ];
  }
  return [];
}

// ---------- Compositions de modules ----------

function SalleBudget({ zone }: { zone: "salle" }) {
  return (
    <div className="space-y-3">
      <BudgetView zone={zone} tableZone={zone} />
      <EquipList zone={zone} categories={["mobilier", "amenagement", "decoration", "eclairage", "equipement"]} title="Mobilier et aménagement de la salle" hint="Ajoutez ici le mobilier et l'aménagement de la salle (en plus des tables et chaises) avec leur prix, pour compléter l'estimation." />
    </div>
  );
}

function ToiletsLayout() {
  return (
    <div className="space-y-3">
      <InstallationsSummary />
      <EquipList zone="toilettes" categories={["installation", "equipement", "amenagement", "eclairage"]} title="Installations des toilettes" hint="Enregistrez les cabines, lavabos, urinoirs, sèche-mains… avec leur nombre et leur état." />
    </div>
  );
}

function SuppliesView() {
  return (
    <div className="space-y-4">
      <ProductsView zone="toilettes" categories={["entretien", "autre"]} />
      <Card title="Alertes de stock faible"><AlertsView zone="toilettes" /></Card>
      <Card title="Entrées et sorties"><MovesView zone="toilettes" /></Card>
    </div>
  );
}

function ColdMaintenance() {
  return (
    <div className="space-y-4">
      <ColdAlerts />
      <TasksView zone="froid" kinds={["entretien", "nettoyage", "reparation"]} defaultKind="entretien" title="Entretien de la chambre froide" />
    </div>
  );
}

function TakeOrder() {
  const [tab, setTab] = useState<"new" | "list">("new");
  const [pay, setPay] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {(["new", "list"] as const).map((t) => <button key={t} type="button" onClick={() => setTab(t)} className={`tab-press rounded-lg px-3 py-1.5 text-sm ${tab === t ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={tab === t ? { background: "var(--app-primary)" } : undefined}>{t === "new" ? "Nouvelle commande" : "Commandes du jour"}</button>)}
      </div>
      {tab === "new" ? (
        <>
          <OrderComposer source="caisse" onCreated={(id) => setPay(id)} />
          <details className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><summary className="cursor-pointer font-medium">Gérer la carte (plats, boissons, prix)</summary><div className="mt-3"><MenuView /></div></details>
        </>
      ) : (
        <OrdersList onPay={setPay} />
      )}
      {pay && <PaymentForm target="order" targetId={pay} onClose={() => setPay(null)} />}
    </div>
  );
}

function HotelHall() {
  const [tab, setTab] = useState<"tables" | "capacite" | "reservations">("tables");
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto">
        {([["tables", "Tables"], ["capacite", "Capacité et disponibilité"], ["reservations", "Réservations"]] as const).map(([t, l]) => <button key={t} type="button" onClick={() => setTab(t)} className={`tab-press shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === t ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={tab === t ? { background: "var(--app-primary)" } : undefined}>{l}</button>)}
      </div>
      {tab === "tables" && <TablesView zone="restaurant" />}
      {tab === "capacite" && <CapacityView zone="restaurant" />}
      {tab === "reservations" && <BookingsView zone="restaurant" />}
    </div>
  );
}

function HotelOrders({ roomService }: { roomService: boolean }) {
  const [tab, setTab] = useState<"table" | "chambre" | "suivi">("table");
  const [pay, setPay] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto">
        <button type="button" onClick={() => setTab("table")} className={`tab-press shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === "table" ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={tab === "table" ? { background: "var(--app-primary)" } : undefined}>Table ou comptoir</button>
        {roomService && <button type="button" onClick={() => setTab("chambre")} className={`tab-press shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === "chambre" ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={tab === "chambre" ? { background: "var(--app-primary)" } : undefined}>Service en chambre</button>}
        <button type="button" onClick={() => setTab("suivi")} className={`tab-press shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === "suivi" ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={tab === "suivi" ? { background: "var(--app-primary)" } : undefined}>Suivi jusqu&apos;au service</button>
      </div>
      {tab === "table" && <OrderComposer source="restaurant" tableZone="restaurant" onCreated={() => setTab("suivi")} />}
      {tab === "chambre" && <OrderComposer source="room_service" onCreated={() => setTab("suivi")} />}
      {tab === "suivi" && <OrdersList onPay={setPay} kitchenActions title="Commandes" />}
      {pay && <PaymentForm target="order" targetId={pay} onClose={() => setPay(null)} />}
    </div>
  );
}

function KitchenStock() {
  return (
    <div className="space-y-4">
      <KitchenQueue />
      <Card title="Ingrédients"><ProductsView zone="stock" categories={["ingredient", "boisson", "marchandise", "autre"]} /></Card>
      <Card title="Mouvements de stock"><MovesView zone="stock" /></Card>
    </div>
  );
}

function HotelCash() {
  const [tab, setTab] = useState<"paiements" | "recus" | "ventes" | "depenses">("paiements");
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto">
        {([["paiements", "Paiements"], ["recus", "Reçus"], ["ventes", "Ventes"], ["depenses", "Dépenses"]] as const).map(([t, l]) => <button key={t} type="button" onClick={() => setTab(t)} className={`tab-press shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === t ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={tab === t ? { background: "var(--app-primary)" } : undefined}>{l}</button>)}
      </div>
      {tab === "paiements" && <PaymentsView />}
      {tab === "recus" && <ReceiptsView />}
      {tab === "ventes" && <CashReport />}
      {tab === "depenses" && <FinanceView />}
    </div>
  );
}

function KitchenIngredients() {
  const [tab, setTab] = useState<"produits" | "mouvements" | "alertes" | "dates">("produits");
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto">
        {([["produits", "Ingrédients"], ["mouvements", "Entrées et sorties"], ["alertes", "Seuils d'alerte"], ["dates", "Péremption"]] as const).map(([t, l]) => <button key={t} type="button" onClick={() => setTab(t)} className={`tab-press shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === t ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={tab === t ? { background: "var(--app-primary)" } : undefined}>{l}</button>)}
      </div>
      {tab === "produits" && <ProductsView zone="stock" categories={["ingredient", "boisson", "marchandise", "autre"]} />}
      {tab === "mouvements" && <MovesView zone="stock" />}
      {tab === "alertes" && <AlertsView zone="stock" />}
      {tab === "dates" && <LotsView zone="stock" />}
      <p className="text-xs text-slate-500">Les quantités utilisées sont déduites automatiquement, une seule fois, quand une commande passe en préparation et que la recette du plat est définie.</p>
    </div>
  );
}

function KitchenHygiene() {
  const [tab, setTab] = useState<"temperatures" | "nettoyage" | "dates" | "pannes">("temperatures");
  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto">
        {([["temperatures", "Températures"], ["nettoyage", "Nettoyage"], ["dates", "Conservation"], ["pannes", "Équipements"]] as const).map(([t, l]) => <button key={t} type="button" onClick={() => setTab(t)} className={`tab-press shrink-0 rounded-lg px-3 py-1.5 text-sm ${tab === t ? "font-semibold text-white" : "bg-slate-100 text-slate-600"}`} style={tab === t ? { background: "var(--app-primary)" } : undefined}>{l}</button>)}
      </div>
      {tab === "temperatures" && <TempView zone="cuisine" />}
      {tab === "nettoyage" && <TasksView zone="cuisine" kinds={["nettoyage", "entretien"]} title="Nettoyage de la cuisine" />}
      {tab === "dates" && <LotsView zone="stock" />}
      {tab === "pannes" && <EquipList zone="cuisine" categories={["equipement", "mobilier", "installation"]} title="Équipements de la cuisine" />}
    </div>
  );
}

function KitchenTeam() {
  return (
    <div className="space-y-4">
      <TasksView zone="cuisine" kinds={["tache", "nettoyage", "entretien", "reparation", "signalement"]} defaultKind="tache" title="Tâches de l'équipe" />
      <p className="text-xs text-slate-500">Pertes alimentaires : enregistrez une sortie « Perte / périmé » dans le stock (avec l&apos;option dépense) ; les autres dépenses se saisissent ci-dessous.</p>
      <FinanceView />
    </div>
  );
}

export { FileText };
