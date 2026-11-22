"use client";

import { createContext, useContext } from "react";
import type { Courier, Doc, Settings } from "@/lib/transport/model";
import type { Permission } from "@/lib/team";
import type { TransportState, useTransport } from "./useTransport";

export type Page = "dashboard" | "commandes" | "missions" | "livreurs" | "vehicules" | "carte" | "finances" | "assistant" | "parametres";
export type TransportCtx = ReturnType<typeof useTransport> & {
  s: TransportState;
  projectId: string;
  mode: "demo" | "live";
  settings: Settings;
  notify: (kind: "success" | "error" | "info", msg: string) => void;
  may: (p: Permission | Permission[]) => boolean;
  /** Exécute une opération avec message de réussite ou d'erreur ; renvoie null en cas d'échec. */
  run: (name: string, input: unknown, opts?: { quiet?: boolean }) => Promise<Awaited<ReturnType<ReturnType<typeof useTransport>["op"]>> | null>;
  go: (p: Page, focus?: string) => void;
  focus: string | null;
  fmt: (n: number | null | undefined) => string;
  courierName: (id: string | null | undefined) => string;
  memberName: (id: string | null | undefined) => string;
  /** Profil de livreur relié au compte connecté (null si la personne n'est pas livreur). */
  me: Doc<Courier> | null;
};
export const Ctx = createContext<TransportCtx | null>(null);
export function useCtx() {
  const c = useContext(Ctx);
  if (!c) throw new Error("TransportCtx manquant");
  return c;
}
