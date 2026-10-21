import { ImageResponse } from "next/og";

export const alt = "MiniSoft RCA — Votre problème mérite son propre logiciel";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Image affichée lors du partage d'un lien (WhatsApp, Facebook, LinkedIn…). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, color: "white", background: "radial-gradient(circle at 15% 10%, #3b2f9e 0%, transparent 55%), radial-gradient(circle at 90% 20%, #0e5a7a 0%, transparent 50%), #050816" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 84, height: 84, borderRadius: 20, background: "linear-gradient(135deg, #6d5dfc, #38bdf8)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 700 }}>MS</div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>MiniSoft RCA</div>
        </div>
        <div style={{ marginTop: 50, fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>Votre problème mérite son propre logiciel.</div>
        <div style={{ marginTop: 30, fontSize: 32, color: "#c3c8e0" }}>Commandes, stocks, clients, rendez-vous — en français, en FCFA, sans programmer.</div>
      </div>
    ),
    size,
  );
}
