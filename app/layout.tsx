import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/Toaster";
import { PwaRegister } from "@/components/PwaRegister";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { SITE_URL } from "@/lib/config";
import { getSite } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  keywords: ["logiciel de gestion", "Centrafrique", "Bangui", "RCA", "Afrique centrale", "FCFA", "gestion de stock", "gestion de restaurant", "logiciel sur mesure", "PME"],
  openGraph: { type: "website", locale: "fr_FR", siteName: "MiniSoft RCA" },
  title: { default: "MiniSoft RCA — Des logiciels simples pour développer votre entreprise", template: "%s · MiniSoft RCA" },
  description: "Décrivez vos besoins et obtenez un mini-logiciel de gestion adapté à votre activité : commandes, stocks, clients, factures. En français et en FCFA.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "MiniSoft RCA", statusBarStyle: "default" },
};

/** Personnalisation (annonce, couleur) relue au plus toutes les 30 secondes. */
export const revalidate = 30;

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { branding, announcement } = await getSite();
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">
        {/* Couleur principale réglée dans l'administration (valeur validée : #rrggbb). */}
        <style>{`:root{--brand:${/^#[0-9a-fA-F]{6}$/.test(branding.primaryColor) ? branding.primaryColor : "#2563eb"}}`}</style>
        {announcement.active && announcement.message && (
          <div role="status" className={`no-print px-4 py-2 text-center text-sm ${announcement.level === "maintenance" ? "bg-amber-100 text-amber-900" : "bg-slate-900 text-white"}`}>
            {announcement.level === "maintenance" && <strong>Maintenance : </strong>}
            {announcement.message}
          </div>
        )}
        <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] btn btn-primary">
          Aller au contenu
        </a>
        <Toaster>{children}</Toaster>
        <WhatsAppButton />
        <PwaRegister />
      </body>
    </html>
  );
}
