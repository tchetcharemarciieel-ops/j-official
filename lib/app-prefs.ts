import { z } from "zod";

/** Préférences d'un utilisateur dans un mini-logiciel (enregistrées par compte et par logiciel). */
export const appPrefsSchema = z.object({
  /** Vue d'ouverture : espace de travail ou tableau de bord classique. */
  view: z.enum(["workspace", "classic"]).optional(),
  /** Rendu de l'espace : 3D, ou plan 2D léger pour les téléphones moins puissants. */
  render: z.enum(["3d", "2d"]).optional(),
});
export type AppPrefs = z.infer<typeof appPrefsSchema>;
