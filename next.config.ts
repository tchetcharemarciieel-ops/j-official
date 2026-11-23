import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  // HTTPS obligatoire pendant un an pour ce domaine (le navigateur refuse ensuite toute version http).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  // Politique de contenu : pas de plugins, pas d'intégration du site ailleurs, formulaires vers le site
  // ou la page de paiement SasPay uniquement, ressources forcées en https.
  { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self' https://pay.saspay.me; upgrade-insecure-requests" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Landing page cinématique (fichier statique unique) : page d'accueil du site, et aussi /cinema.
  // L'ancienne page d'accueil reste disponible à /accueil.
  async rewrites() {
    return {
      beforeFiles: [
        { source: "/", destination: "/cinema/index.html" },
        { source: "/cinema", destination: "/cinema/index.html" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    return [
      { source: "/(.*)", headers: securityHeaders },
      // Code de suivi des sites connectés : chargé par les sites des clients.
      { source: "/ms.js", headers: [{ key: "Cache-Control", value: "public, max-age=3600" }, { key: "Cross-Origin-Resource-Policy", value: "cross-origin" }] },
    ];
  },
};

export default nextConfig;
