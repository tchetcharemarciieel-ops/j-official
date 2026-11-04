import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/espace", "/projets/", "/apps/", "/invitation/", "/auth/", "/r/*/t/", "/r/*/suivi/"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
