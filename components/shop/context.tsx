"use client";

import { createContext, useContext } from "react";
import type { Doc, Product, Settings } from "@/lib/shop/model";
import type { Permission } from "@/lib/team";
import type { ShopState, useShop } from "./useShop";

export type Page = "dashboard" | "pos" | "sales" | "products" | "stock" | "orders" | "customers" | "suppliers" | "expenses" | "reports" | "online" | "settings" | "assistant";

export type ShopCtx = ReturnType<typeof useShop> & {
  s: ShopState;
  projectId: string;
  mode: "demo" | "live";
  settings: Settings;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
  /** Permission du poste (null = toutes, selon le rôle). */
  may: (p: Permission | Permission[]) => boolean;
  /** Exécute une opération avec message de réussite ou d'erreur ; renvoie null en cas d'échec. */
  run: (name: string, input: unknown, opts?: { offlineLabel?: string; offlineTotal?: number; quiet?: boolean }) => Promise<Awaited<ReturnType<ReturnType<typeof useShop>["op"]>> | null>;
  go: (p: Page, focus?: string) => void;
  focus: string | null;
  products: Doc<Product>[];
  memberName: (id: string | null | undefined) => string;
};

export const Ctx = createContext<ShopCtx | null>(null);
export function useCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error("ShopCtx manquant");
  return c;
}
