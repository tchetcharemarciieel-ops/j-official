import { z } from "zod";

/** Champs modifiables d'une formule tarifaire. */
export const planFields = z.object({
  name: z.string().trim().min(2).max(40),
  price_xaf: z.number().int().min(0).max(100_000_000),
  monthly_credits: z.number().int().min(0).max(1_000_000),
  max_projects: z.number().int().min(1).max(10_000),
  max_members: z.number().int().min(1).max(10_000),
  can_publish: z.boolean(),
  ai_modifications: z.boolean(),
  description: z.string().trim().max(200),
  sort: z.number().int().min(0).max(1000),
  active: z.boolean(),
});
