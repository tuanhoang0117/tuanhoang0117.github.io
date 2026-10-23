import type { Hackathon } from "./types";

// TODO(tuan): confirm dates, locations, and stats for each event. Fields left out are unknown,
// not zero; pages must handle them being absent.
export const hackathons: Hackathon[] = [
  {
    slug: "ace",
    project: "ACE",
    event: "HackHayward 2026",
    summary:
      "An AI assistant coach that uses computer vision to track volleyball stats. Pairs a fast manual stat-tracking app for coaches with custom models that detect the ball, track players, classify actions, and read jersey numbers from video.",
    stack: ["Computer vision", "Custom-trained models"],
    image: {
      src: "https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/004/481/870/datas/gallery.jpg",
      alt: "ACE live volleyball tracker showing court view, play-by-play, and team stats",
    },
    links: [
      { label: "GitHub", href: "https://github.com/tuanhoang0117/HaywardHacks2026" },
      { label: "Devpost", href: "https://devpost.com/software/ace-ni7lry" },
    ],
    tint: "sky",
  },
  {
    slug: "oculusmd",
    project: "oculusMD",
    event: "QuackHacks 3",
    date: "2026-05-30",
    location: "Eugene, OR",
    summary:
      "A medication safety copilot that scans a pill tray, checks every drug for interactions, contraindications, and dose timing, and speaks the verdict aloud, blocking the dose and explaining why if anything is unsafe.",
    stack: ["OpenCV", "Google Gemini", "FastAPI", "MongoDB"],
    image: {
      src: "https://raw.githubusercontent.com/tuanhoang0117/QuackHacks-3-2026/main/screenshot-verified-present-lisinopril.png",
      alt: "oculusMD scan result showing a verified-safe medication",
    },
    links: [
      { label: "GitHub", href: "https://github.com/tuanhoang0117/QuackHacks-3-2026" },
      { label: "QuackHacks", href: "https://2026.quackhacks.org/projects/oculusmd" },
    ],
    tint: "butter",
  },
  {
    slug: "student-athlete-wellness",
    project: "Student Athlete Wellness AI",
    event: "HornetHacks Fall 2025",
    summary:
      "A web app that helps student athletes track sleep, diet, and exercise progress, with a dashboard of AI-ready recommendations and weekly summaries.",
    stack: ["Web app"],
    links: [{ label: "GitHub", href: "https://github.com/PancakeNinja64/HornetHacks_FALL2025" }],
    tint: "mint",
  },
  {
    slug: "zip",
    project: "ZIP",
    event: "SacHacks VII",
    location: "Sacramento, CA",
    summary:
      "A map-first investment radar that ranks U.S. ZIP codes for single-family housing opportunity from demographic forecasts, with choropleth and heatmap views and drilldown analytics.",
    stack: ["Next.js", "React", "Mapbox GL", "Turf.js"],
    image: {
      src: "https://raw.githubusercontent.com/PancakeNinja64/SacHacks/main/screenshot-choropleth.png",
      alt: "ZIP choropleth map showing ZIP-level investment scores",
    },
    links: [
      { label: "GitHub", href: "https://github.com/PancakeNinja64/SacHacks" },
      { label: "Devpost", href: "https://devpost.com/software/zip-w694qr" },
    ],
    tint: "peach",
  },
  {
    slug: "vibemate",
    project: "VibeMate",
    event: "Hack with MLH and DigitalOcean: SF",
    location: "San Francisco, CA",
    placement: "Winner, Best Beginner Project",
    summary:
      "A multi-personality AI agent: a mood-responsive DJ, an empathetic counselor that reads emotion from facial expressions, and a personalized tutor, sharing context across all three modes.",
    stack: ["Three.js", "Web Audio API"],
    image: {
      src: "https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/004/068/377/datas/gallery.jpg",
      alt: "VibeMate interface showing the 3D audio visualizer and AI study assistant chat",
    },
    links: [
      { label: "GitHub", href: "https://github.com/RocketRaccons/VibeMate3" },
      { label: "Devpost", href: "https://devpost.com/software/vibemate-4xjhrb" },
    ],
    tint: "lilac",
  },
];
