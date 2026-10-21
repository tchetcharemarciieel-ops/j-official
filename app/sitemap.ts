import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";
import { SECTOR_PAGES } from "@/lib/marketing";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/modeles`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    ...SECTOR_PAGES.map((p) => ({ url: `${SITE_URL}/secteurs/${p.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.8 })),
    { url: `${SITE_URL}/inscription`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
  ];
}
