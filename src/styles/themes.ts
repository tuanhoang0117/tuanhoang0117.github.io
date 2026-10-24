/**
 * Per-page Cal Poly themes (docs/design-system.md → Page themes). Each page has a primary and a
 * secondary accent. Class names are written out in full so Tailwind generates them.
 *
 * - `shadows`: accent block-shadow colors, cycled across a page's cards.
 * - `wash`: a light background for bands and feature cards (ink text on it).
 * - `accentText`: text in an accent color. Poly Green on every page: it's the only palette color
 *   that passes AA on paper, cards, and every wash (Morro Cove fails on washes, 4.1–4.5:1).
 */
export interface PageTheme {
  primary: string;
  secondary: string;
  shadows: readonly string[];
  wash: string;
  accentText: string;
}

export const pageThemes = {
  home: {
    primary: "poly",
    secondary: "gold",
    shadows: ["shadow-poly", "shadow-gold", "shadow-poly-bright"],
    wash: "bg-stadium",
    accentText: "text-poly",
  },
  hackathons: {
    primary: "surf",
    secondary: "stadium",
    shadows: ["shadow-surf", "shadow-canyon", "shadow-cove", "shadow-heritage"],
    wash: "bg-sky",
    accentText: "text-poly",
  },
  portfolio: {
    primary: "dexter",
    secondary: "morro",
    shadows: ["shadow-dexter", "shadow-morro", "shadow-surf", "shadow-canyon"],
    wash: "bg-serenity",
    accentText: "text-poly",
  },
  resume: {
    primary: "cove",
    secondary: "canyon",
    shadows: ["shadow-cove", "shadow-canyon", "shadow-morro"],
    wash: "bg-serenity",
    accentText: "text-poly",
  },
  contact: {
    primary: "heritage",
    secondary: "mission",
    shadows: ["shadow-heritage", "shadow-canyon", "shadow-cove"],
    wash: "bg-mission",
    accentText: "text-poly",
  },
} as const satisfies Record<string, PageTheme>;

/** The accent shadow for the card at `index` on a page, cycling through its theme. */
export function cardShadow(theme: PageTheme, index: number): string {
  return theme.shadows[index % theme.shadows.length]!;
}
