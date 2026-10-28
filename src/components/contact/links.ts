import { navLinks, socials } from "../../content/site";

/** Which service a contact link points to, worked out from its href. Picks the icon and order. */
export type ContactKind = "email" | "linkedin" | "github" | "other";

export function contactKind(href: string): ContactKind {
  if (href.startsWith("mailto:")) return "email";
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    if (host === "linkedin.com") return "linkedin";
    if (host === "github.com") return "github";
  } catch {
    // Not an absolute URL; fall through to the generic icon.
  }
  return "other";
}

const order: ContactKind[] = ["email", "linkedin", "github", "other"];

/** The socials from site.ts, ordered Email, LinkedIn, GitHub, then anything else. */
export const contactLinks = socials
  .map((s) => ({ ...s, kind: contactKind(s.href) }))
  .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

function navLink(href: string) {
  const link = navLinks.find((l) => l.href === href);
  if (!link) throw new Error(`navLinks in site.ts has no entry for ${href}`);
  return link;
}

export const contactNav = navLink("/contact");
export const resumeNav = navLink("/resume");
