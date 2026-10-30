import type { Link } from "./types";

export const site = {
  name: "Tuan Hoang",
  url: "https://tuanhoang0117.github.io",
  location: "San Luis Obispo, CA",
  timeZone: "America/Los_Angeles",
  email: "tuanhoang0117@gmail.com",
  tagline: "Computer science student.",
  description:
    "Tuan Hoang — computer science student at Cal Poly SLO. Portfolio, resume, and projects in software engineering, AI, and full-stack development.",
};

export const school = {
  name: "California Polytechnic State University, San Luis Obispo",
  shortName: "Cal Poly SLO",
};

export const homeIntro = {
  label: "About",
  body: "I'm a computer science student at Cal Poly SLO, originally from Sacramento. I build things at hackathons, play volleyball, and play video games.",
  workLink: "See my work →",
};

/** The ">>>" line under each page's title. */
export const pagePrompts = {
  portfolio: "Things I've built.",
  resume: "Education, experience, and projects.",
  lab: "Sprite test bench.",
  notFound: "That page doesn't exist.",
};

export const contact = {
  prompt: "Feel free to reach out.",
  resumeLead: "Want the background first?",
};

export const socials: Link[] = [
  { label: "GitHub", href: "https://github.com/tuanhoang0117" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/tuanhoang0117/" },
  { label: "Email", href: `mailto:${site.email}` },
];

export const navLinks: Link[] = [
  { label: "Home", href: "/" },
  { label: "Portfolio", href: "/portfolio" },
  { label: "Resume", href: "/resume" },
  { label: "Contact", href: "/contact" },
];
