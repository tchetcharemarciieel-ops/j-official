import { z } from "zod";

/** Paramètres de la plateforme modifiables depuis l'administration (table platform_settings). */
export const SETTINGS = {
  branding: z.object({
    name: z.string().trim().min(1).max(40).default("MiniSoft RCA"),
    slogan: z.string().trim().max(120).default("Des logiciels simples pour développer votre entreprise"),
    logoUrl: z.union([z.literal(""), z.string().url().startsWith("https://").max(500)]).default(""),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#2563eb"),
  }),
  home: z.object({
    heroTitle: z.string().trim().max(120).default(""),
    heroSubtitle: z.string().trim().max(300).default(""),
  }),
  announcement: z.object({
    active: z.boolean().default(false),
    level: z.enum(["info", "maintenance"]).default("info"),
    message: z.string().trim().max(300).default(""),
  }),
  contact: z.object({
    whatsapp: z.string().trim().max(30).regex(/^[+0-9 ().-]*$/).default(""),
    email: z.union([z.literal(""), z.string().email().max(120)]).default(""),
    address: z.string().trim().max(160).default(""),
  }),
  faq: z.object({
    items: z.array(z.object({ q: z.string().trim().min(3).max(160), a: z.string().trim().min(3).max(1200) })).max(30).default([]),
  }),
  templates: z.object({
    disabled: z.array(z.string().max(40)).max(50).default([]),
  }),
  ai: z.object({
    /** false : génération IA désactivée, règles prédéfinies uniquement. */
    enabled: z.boolean().default(true),
    provider: z.enum(["auto", "openai", "anthropic", "gemini"]).default("auto"),
    model: z.string().trim().max(80).default(""),
    fallbackModels: z.string().trim().max(400).default(""),
    userHourly: z.number().int().min(0).max(1000).default(10),
    userDaily: z.number().int().min(0).max(10000).default(30),
    globalDaily: z.number().int().min(0).max(100000).default(300),
    /** Clés chiffrées (AES-256-GCM) et 4 derniers caractères pour l'affichage. */
    keys: z.partialRecord(z.enum(["openai", "anthropic", "gemini"]), z.object({ enc: z.string(), last4: z.string().max(4), savedAt: z.string() })).default({}),
  }),
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type Setting<K extends SettingKey> = z.infer<(typeof SETTINGS)[K]>;

export function parseSetting<K extends SettingKey>(key: K, value: unknown): Setting<K> {
  const r = SETTINGS[key].safeParse(value ?? {});
  return (r.success ? r.data : SETTINGS[key].parse({})) as Setting<K>;
}
