// UI mechanics only: screen-reader hints and position labels. Copy comes from src/content/.
export const linkHints = {
  newTab: "(opens in a new tab)",
  download: "(downloads a file)",
};

/** Two-digit position label, like the archive's numbered strips. */
export const pad = (n: number) => String(n).padStart(2, "0");
