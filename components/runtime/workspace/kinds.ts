import { Banknote, BarChart3, BedDouble, Briefcase, ChefHat, ConciergeBell, GraduationCap, Package, Scissors, Store, Truck, Users, UtensilsCrossed, Wrench, type LucideIcon } from "lucide-react";
import type { StationKind } from "@/lib/spec";

/** Icône de chaque type de poste (plan 2D, listes, étiquettes). */
export const KIND_ICONS: Record<StationKind, LucideIcon> = {
  stats_board: BarChart3,
  cashier: Banknote,
  kitchen: ChefHat,
  dining: UtensilsCrossed,
  stock: Package,
  counter: Store,
  repair_bay: Wrench,
  vehicle: Truck,
  desk: Briefcase,
  reception: ConciergeBell,
  meeting: Users,
  bed: BedDouble,
  salon_chair: Scissors,
  classroom: GraduationCap,
};

export const ROLE_COLORS: Record<string, string> = {
  owner: "#0f172a",
  admin: "#1d4ed8",
  manager: "#7c3aed",
  employee: "#0f766e",
  viewer: "#64748b",
};

/** Teintes de peau variées pour les personnages. */
export const SKIN = ["#5c3a21", "#7a4a2a", "#8d5524", "#a0663d", "#c68642"];
