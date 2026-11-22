"use client";

import { createContext, useContext } from "react";
import type { Page, Settings } from "@/lib/bureau/model";
import type { Permission } from "@/lib/team";
import type { BureauState, useBureau } from "./useBureau";

export type BureauCtx = ReturnType<typeof useBureau> & {
  s: BureauState;
  projectId: string;
  mode: "demo" | "live";
  settings: Settings;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
  may: (p: Permission | Permission[]) => boolean;
  /** Exécute une opération avec message de réussite ou d'erreur ; renvoie null en cas d'échec. */
  run: (name: string, input: unknown, opts?: { quiet?: boolean }) => Promise<Awaited<ReturnType<ReturnType<typeof useBureau>["op"]>> | null>;
  go: (p: Page, focus?: string) => void;
  focus: string | null;
  fmt: (n: number | null | undefined) => string;
  memberName: (id: string | null | undefined) => string;
  clientName: (id: string | null | undefined) => string;
  empName: (id: string | null | undefined) => string;
  /** Résout une relation d'un module du métier (client, employé ou autre fiche). */
  lookup: (rel: string, id: string) => string;
};

export const Ctx = createContext<BureauCtx | null>(null);
export function useCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error("BureauCtx manquant");
  return c;
}
