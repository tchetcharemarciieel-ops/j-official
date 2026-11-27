"use client";

import { createContext, useContext } from "react";
import type { Settings } from "@/lib/ecole/model";
import type { Permission } from "@/lib/team";
import type { EcoleState, useEcole } from "./useEcole";

export type Page = "dashboard" | "eleves" | "structure" | "enseignants" | "notes" | "bulletins" | "presences" | "finances" | "annonces" | "analyses" | "parametres" | "parent";
export type EcoleCtx = ReturnType<typeof useEcole> & {
  s: EcoleState; projectId: string; mode: "demo" | "live"; settings: Settings;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
  may: (p: Permission | Permission[]) => boolean;
  /** Exécute une opération avec message de réussite ou d'erreur ; renvoie null en cas d'échec. */
  run: (name: string, input: unknown, opts?: { quiet?: boolean }) => Promise<Awaited<ReturnType<ReturnType<typeof useEcole>["op"]>> | null>;
  go: (p: Page, focus?: string) => void;
  focus: string | null;
  fmt: (n: number | null | undefined) => string;
  /** Nombre sans devise (pour les cartes étroites) et libellé de la devise. */
  num: (n: number | null | undefined) => string;
  cur: string;
};
export const Ctx = createContext<EcoleCtx | null>(null);
export function useCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error("EcoleCtx manquant");
  return c;
}
