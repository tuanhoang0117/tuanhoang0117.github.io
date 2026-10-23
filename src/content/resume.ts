import type { Resume } from "./types";

export const resume: Resume = {
  education: [
    {
      title: "California Polytechnic State University, San Luis Obispo",
      location: "San Luis Obispo, CA",
      detail: "B.S. Computer Science — Expected May 2028",
      bullets: [],
    },
    {
      title: "Folsom Lake College",
      location: "Folsom, CA",
      detail:
        "A.S. Computer Science | A.A. Interdisciplinary Studies: Math and Science | GPA: 3.7/4.0 — May 2026",
      bullets: [
        "Coursework: Object Oriented Programming (C++), Discrete Structures, Data Structures, Algorithm Design/Problem Solving, Multivariable Calculus, Linear Algebra, Differential Equations",
      ],
    },
  ],
  skills: [
    { label: "Languages", skills: ["Python", "TypeScript", "JavaScript", "C++"] },
    {
      label: "Backend & Data",
      skills: [
        "Node.js",
        "Express.js",
        "FastAPI",
        "Redis",
        "MongoDB",
        "Firebase (Cloud Firestore)",
        "REST API design",
      ],
    },
    {
      label: "AI / ML",
      skills: ["Retrieval-augmented generation (RAG)", "Google Gemini", "OpenCV", "NumPy"],
    },
    { label: "Frontend", skills: ["React Native", "Next.js", "Tailwind CSS", "Three.js"] },
    { label: "Tools", skills: ["Git", "Postman", "Xcode", "Android Studio"] },
  ],
  experience: [
    {
      title: "Develop for Good | Software Engineer",
      location: "Remote",
      detail: "Web Team – TAR Syndrome Association (nonprofit client) — May 2026 – Aug. 2026",
      bullets: [
        "Raised the client site's Google Lighthouse score from 72 to 87 by remediating WCAG accessibility failures: corrected text/background contrast ratios, restored semantic H1–H3 heading hierarchy, and replaced ambiguous link elements with accessible button controls.",
        "Built and shipped 2 responsive pages for a rare-disease patient advocacy org, structuring navigation and link components so non-technical staff could update content post-handoff without developer support.",
        "Integrated Mailchimp for community lead capture and configured the org's online donation flow; authored the PRD, client handoff guide, and Demo Day technical presentation that transferred ownership to the client.",
      ],
    },
    {
      title: "UCSD Summer Internship Prep Program",
      location: "La Jolla, CA",
      bullets: [
        "Built a real-time computer vision system (Python, OpenCV) that measures how full a space is by splitting the camera view into a 36-cell grid and reading occupancy live at 30+ FPS, giving an at-a-glance capacity check.",
      ],
    },
  ],
  projects: [
    {
      title: "ZIP | SacHacks (Next.js, React, Mapbox GL, Turf.js)",
      location: "Sacramento, CA",
      bullets: [
        "Built an MVP decision-support platform that ranks U.S. ZIP codes for housing investment opportunity, rendering national results in an interactive Mapbox GL map with choropleth, heatmap, and 3D building views.",
        "Designed a weighted composite scoring model over demographic growth and income data, built on a CSV ingestion pipeline that stitches mismatched multi-source inputs by ZIP/ZCTA so rankings stay explainable instead of a black box.",
        "Built a drilldown analytics view with score-context charts (SWR, Recharts) and a U.S. Census TIGERweb boundary fallback, so ZIP polygon geometry still renders correctly when source data is incomplete.",
      ],
    },
    {
      title: "Oculus MD | QuackHacks 3 (OpenCV, Google Gemini, FastAPI, MongoDB)",
      location: "Eugene, OR",
      bullets: [
        "Built the FastAPI backend for a medication-safety app, implementing 4 MongoDB-backed validation checks (drug interactions, contraindications, dose ceilings, re-dose timing) that reject unsafe combinations such as Warfarin + Metronidazole before dispensing.",
        "Enforced a server-side guardrail layer that constrains the model to cross-reference the prescribing instructions and drug database rather than generating independent medical judgments.",
      ],
    },
    {
      title: "Weather Proxy API | Personal Project (Node.js, Express, Redis)",
      bullets: [
        "Built a REST service that proxies a third-party weather API behind a Redis cache-aside layer with configurable TTL, cutting repeat-city requests to a single upstream call and keeping the service responsive when the provider is slow.",
        "Hardened the API with per-IP rate limiting, a dependency-independent health endpoint, and a uniform error contract mapping upstream and client failures to distinct 400/404/429/502 responses instead of generic 500s.",
      ],
    },
    {
      title: "Sprout Food Diet App | Personal Project (React Native, Python/FastAPI)",
      location: "Sacramento, CA",
      bullets: [
        "Designed the retrieval backend for a RAG chatbot: an ingestion pipeline that chunks nutrition sources into a vector store with deduplication, so every response traces to a citable document.",
        "Served retrieval and generation through a Python/FastAPI API consumed by a cross-platform React Native client, returning grounded answers in under 200 ms.",
      ],
    },
    {
      title: "VibeMate | Winner – Hack with MLH and DigitalOcean (Three.js, Web Audio API)",
      location: "San Francisco, CA",
      bullets: [
        "Structured a real-time emotion-driven web app into modular scene, audio, and UI managers with async initialization and graceful fallbacks, keeping the live demo stable under load.",
      ],
    },
  ],
};
