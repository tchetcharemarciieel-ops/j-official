import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/Toaster";
import { PwaRegister } from "@/components/PwaRegister";
import { WhatsAppButton } from "@/components/WhatsAppButton";
import { SITE_URL } from "@/lib/config";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  keywords: ["logiciel de gestion", "Cameroun", "Afrique centrale", "FCFA", "gestion de stock", "gestion de restaurant", "logiciel sur mesure", "PME"],
  openGraph: { type: "website", locale: "fr_FR", siteName: "MiniSoft RCA" },
  title: { default: "MiniSoft RCA — Votre problème mérite son propre logiciel", template: "%s · MiniSoft RCA" },
  description: "Décrivez votre problème. Notre IA conçoit un mini-logiciel adapté à votre entreprise, sans que vous ayez besoin de programmer.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "MiniSoft RCA", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#050816",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-dvh">
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
