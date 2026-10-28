import type { Hackathon } from "./types";

// Every claim here is checked against the owner's private fact sheet. Fields left out are
// unknown, not zero; pages must handle them being absent.
export const hackathons: Hackathon[] = [
  {
    slug: "ace",
    project: "ACE",
    event: "HackHayward 2026",
    date: "2026-03-21",
    summary:
      "An assistant coach for volleyball: a manual stat-tracking app for coaches, plus an attempt to track players and read jersey numbers automatically from game video.",
    role: "I took on the video side: adapting an open-source, pretrained jersey-number model to volleyball footage. I couldn't get the tracking working before the deadline. A teammate built the app screens.",
    stack: ["Python", "Computer vision", "Pretrained jersey-number model"],
    image: {
      src: "https://d112y698adiu2z.cloudfront.net/photos/production/software_photos/004/481/870/datas/gallery.jpg",
      alt: "ACE stat-tracking app showing a court view, play-by-play, and team stats",
    },
    links: [{ label: "Devpost", href: "https://devpost.com/software/ace-ni7lry" }],
    tint: "sky",
  },
  {
    slug: "oculusmd",
    project: "oculusMD",
    event: "QuackHacks 3",
    date: "2026-05-30",
    location: "Eugene, OR",
    summary:
      "A medication safety copilot. Gemini only identifies medications from camera and document images; a rule-based engine makes every safety decision with three checks: drug interactions, contraindications, and too-soon re-doses.",
    role: "I built the FastAPI backend: the safety engine, the Gemini perception agent, the API endpoints, and the tests, 26 of the project's 51 commits. A teammate built the mobile app.",
    stack: ["Python", "FastAPI", "MongoDB", "Gemini 2.5 Flash", "ElevenLabs"],
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
    slug: "zip",
    project: "ZIP",
    event: "SacHacks VII",
    date: "2026-02-20",
    summary:
      "A map-first investment radar that ranks U.S. ZIP codes for single-family housing opportunity, with choropleth and heatmap views and drilldown analytics.",
    role: "I built the map and the UI: the Mapbox choropleth and heatmap modes, ZIP search with a boundary fallback, the drilldown views, and two API routes, 25 of 29 commits. A teammate built the scoring model and data pipeline.",
    stack: ["Next.js", "Mapbox GL"],
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
    date: "2025-12-04",
    location: "San Francisco, CA",
    placement: "Winner, Best Beginner Project",
    summary:
      "One AI agent with three modes that share context: a DJ that matches music to your mood, a counselor that reads emotion from facial expressions, and a study buddy, with 3D visuals that react to both.",
    role: "A team win I contributed to: I helped shape the idea, set up the APIs and DigitalOcean, and tested the prototypes.",
    stack: ["Hume AI", "DigitalOcean Gradient AI", "Three.js"],
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
