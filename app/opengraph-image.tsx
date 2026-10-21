import { ImageResponse } from "next/og";

export const alt = "MiniSoft RCA — Des logiciels simples pour développer votre entreprise";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Image affichée lors du partage d'un lien (WhatsApp, Facebook, LinkedIn…). */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, color: "#0f172a", background: "#ffffff", borderTop: "16px solid #2563eb" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div style={{ width: 84, height: 84, borderRadius: 20, background: "#0f172a", color: "#ffffff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36, fontWeight: 700 }}>MS</div>
          <div style={{ fontSize: 44, fontWeight: 700 }}>MiniSoft RCA</div>
        </div>
        <div style={{ marginTop: 50, fontSize: 68, fontWeight: 700, lineHeight: 1.1, maxWidth: 1000 }}>Des logiciels simples pour développer votre entreprise</div>
        <div style={{ marginTop: 30, fontSize: 32, color: "#475569" }}>Décrivez vos besoins et obtenez un mini-logiciel adapté à votre activité.</div>
      </div>
    ),
    size,
  );
}
