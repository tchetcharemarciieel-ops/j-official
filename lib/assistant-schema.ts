import { z } from "zod";

/** Conversation envoyée par le navigateur (gardée sur l'appareil, jamais stockée par le serveur). */
export const chatBody = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(8000) }))
    .min(1)
    .max(40)
    .refine((m) => m.at(-1)?.role === "user", "Le dernier message doit être celui de l'utilisateur."),
});
