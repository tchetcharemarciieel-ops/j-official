/**
 * Apparence du menu en ligne : thème, couleur, disposition des plats, police, animations,
 * coins et image de couverture. Partagé par le serveur (validation), l'écran de réglage et le
 * menu public. Aucune police ni bibliothèque externe : uniquement des polices du téléphone.
 */

export const MENU_THEMES = {
  clair: { label: "Clair", bg: "#f8fafc", surface: "#ffffff", text: "#0f172a", muted: "#64748b", border: "#e2e8f0", accent: "#2563eb" },
  terre: { label: "Chaleureux", bg: "#fbf3ea", surface: "#fffaf4", text: "#3b2416", muted: "#8a6a55", border: "#eedccb", accent: "#c2410c" },
  tropical: { label: "Tropical", bg: "#effcf3", surface: "#ffffff", text: "#06301a", muted: "#4b7a5e", border: "#cdeed8", accent: "#15803d" },
  street: { label: "Street food", bg: "#fff7d6", surface: "#ffffff", text: "#1c1917", muted: "#57534e", border: "#f5e3a3", accent: "#e11d48" },
  nuit: { label: "Nuit", bg: "#0b1020", surface: "#151c30", text: "#f1f5f9", muted: "#9aa6bd", border: "#26304a", accent: "#f59e0b" },
  elegance: { label: "Noir et or", bg: "#0f0f0f", surface: "#1b1b1b", text: "#f6f1e7", muted: "#aaa296", border: "#2e2b26", accent: "#d4af37" },
} as const;
export type MenuTheme = keyof typeof MENU_THEMES;

export const MENU_LAYOUTS = { liste: "Liste", grille: "Grille de photos", cartes: "Grandes photos" } as const;
export const MENU_FONTS = { moderne: "Moderne", elegant: "Élégante", arrondi: "Arrondie" } as const;
export const MENU_ANIMATIONS = { aucune: "Aucune", fondu: "Fondu", glisse: "Glissement", zoom: "Zoom doux", rebond: "Rebond" } as const;
export const MENU_CORNERS = { doux: "Arrondis", ronds: "Très ronds", carres: "Carrés" } as const;

export type MenuLayout = keyof typeof MENU_LAYOUTS;
export type MenuFont = keyof typeof MENU_FONTS;
export type MenuAnimation = keyof typeof MENU_ANIMATIONS;
export type MenuCorners = keyof typeof MENU_CORNERS;

export type MenuStyle = {
  theme: MenuTheme;
  /** Couleur principale choisie (null = celle du thème). */
  accent: string | null;
  layout: MenuLayout;
  font: MenuFont;
  animation: MenuAnimation;
  corners: MenuCorners;
  /** Image de couverture en haut du menu (image réduite), null = aucune. */
  cover: string | null;
};

export const DEFAULT_MENU_STYLE: MenuStyle = { theme: "clair", accent: null, layout: "liste", font: "moderne", animation: "fondu", corners: "doux", cover: null };

/** Couleurs proposées en un clic (la pipette permet n'importe quelle couleur). */
export const ACCENT_SWATCHES = ["#2563eb", "#c2410c", "#e11d48", "#15803d", "#7c3aed", "#0891b2", "#d4af37", "#f59e0b", "#0f172a"];

const HEX = /^#[0-9a-f]{6}$/i;
const pick = <T extends string>(v: unknown, keys: Record<T, unknown>, d: T): T => (typeof v === "string" && v in keys ? (v as T) : d);

/** Style valide à partir de n'importe quelle valeur enregistrée (les anciens menus gardent l'apparence par défaut). */
export function menuStyle(raw: unknown): MenuStyle {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    theme: pick(s.theme, MENU_THEMES, DEFAULT_MENU_STYLE.theme),
    accent: typeof s.accent === "string" && HEX.test(s.accent) ? s.accent.toLowerCase() : null,
    layout: pick(s.layout, MENU_LAYOUTS, DEFAULT_MENU_STYLE.layout),
    font: pick(s.font, MENU_FONTS, DEFAULT_MENU_STYLE.font),
    animation: pick(s.animation, MENU_ANIMATIONS, DEFAULT_MENU_STYLE.animation),
    corners: pick(s.corners, MENU_CORNERS, DEFAULT_MENU_STYLE.corners),
    cover: typeof s.cover === "string" && s.cover.startsWith("data:image/") ? s.cover : null,
  };
}

function luminance(hex: string) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
};
/** Texte lisible sur la couleur principale : blanc ou presque noir, selon le meilleur contraste. */
export const onColor = (hex: string) => (contrast(hex, "#ffffff") >= contrast(hex, "#111111") ? "#ffffff" : "#111111");

export const FONT_STACKS: Record<MenuFont, string> = {
  moderne: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  elegant: 'Georgia, "Times New Roman", "Iowan Old Style", serif',
  arrondi: 'ui-rounded, "SF Pro Rounded", "Nunito", "Trebuchet MS", system-ui, sans-serif',
};
export const RADIUS: Record<MenuCorners, string> = { doux: "16px", ronds: "26px", carres: "4px" };

/** Variables CSS du menu public (couleurs, police, coins). */
export function menuTokens(style: MenuStyle, fallbackAccent?: string) {
  const t = MENU_THEMES[style.theme];
  const accent = style.accent ?? (style.theme === "clair" && fallbackAccent && HEX.test(fallbackAccent) ? fallbackAccent : t.accent);
  return {
    accent,
    vars: {
      "--m-bg": t.bg,
      "--m-surface": t.surface,
      "--m-text": t.text,
      "--m-muted": t.muted,
      "--m-border": t.border,
      "--m-accent": accent,
      "--m-on-accent": onColor(accent),
      "--m-radius": RADIUS[style.corners],
      "--m-font": FONT_STACKS[style.font],
      "--app-primary": accent,
    } as Record<string, string>,
    dark: luminance(t.bg) < 0.2,
  };
}
