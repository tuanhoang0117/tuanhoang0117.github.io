import { cardShadow, pageThemes } from "../../styles/themes";

type PortfolioShadow = (typeof pageThemes.portfolio.shadows)[number];

export interface ProjectAccent {
  /** Accent block-shadow color, from the Portfolio theme. */
  shadow: PortfolioShadow;
  /** The same color as a fill, for the card's numbered strip. Ink text passes AA on each. */
  fill: string;
  /** The same color as a border, for the card's stack tags. */
  border: string;
}

// Keyed by the theme's shadow classes, so a change to the Portfolio theme fails to compile here
// until each new color has a fill and a border. Class names are written out in full so Tailwind
// generates them.
const byShadow: Record<PortfolioShadow, Omit<ProjectAccent, "shadow">> = {
  "shadow-dexter": { fill: "bg-dexter", border: "border-dexter" },
  "shadow-morro": { fill: "bg-morro", border: "border-morro" },
  "shadow-surf": { fill: "bg-surf", border: "border-surf" },
  "shadow-canyon": { fill: "bg-canyon", border: "border-canyon" },
};

/** The accent colors for the card at `index` on the portfolio page, cycling through its theme. */
export function projectAccent(index: number): ProjectAccent {
  const shadow = cardShadow(pageThemes.portfolio, index) as PortfolioShadow;
  return { shadow, ...byShadow[shadow] };
}

/** The numbered label on a card's strip: "01", "02", ... */
export function cardNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
