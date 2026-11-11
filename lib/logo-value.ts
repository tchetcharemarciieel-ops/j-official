import { z } from "zod";

/** Logo : vide, image importée (data:image/…;base64, réduite côté navigateur) ou ancienne adresse https. */
export const logoValue = z.union([
  z.literal(""),
  z.string().max(300_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Format d'image non accepté (PNG, JPEG ou WebP)."),
  z.string().url("Adresse du logo invalide.").startsWith("https://", "Le logo doit être une image importée.").max(500),
]);
