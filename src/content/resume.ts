import type { Resume } from "./types";

// Mirrors public/resume.pdf, which is the source of truth, except where noted. Update both together.
export const resume: Resume = {
  pdf: "/resume.pdf",
  education: [
    {
      title: "California Polytechnic State University, San Luis Obispo",
      location: "San Luis Obispo, CA",
      detail: "B.S. Computer Science | GPA: 3.76/4.0 — Expected May 2028",
      bullets: [
        "Relevant coursework: Data Structures, Algorithm Design, Discrete Structures, Object-Oriented Programming (C++), Database Management Systems (SQL), Algorithms and Complexity",
      ],
    },
  ],
  skills: [
    {
      label: "Languages",
      glyph: "square",
      skills: ["TypeScript", "JavaScript", "Python", "SQL", "C++"],
    },
    {
      label: "Backend & Data",
      glyph: "circle",
      skills: [
        "Node.js",
        "Express",
        "FastAPI",
        "PostgreSQL",
        "Prisma",
        "Redis",
        "MongoDB",
        "REST API design",
      ],
    },
    {
      label: "Testing & DevOps",
      glyph: "diamond",
      skills: [
        "Node test runner",
        "Supertest",
        "Vitest",
        "Docker",
        "Docker Compose",
        "GitHub Actions",
      ],
    },
    {
      label: "Frontend",
      glyph: "triangle",
      skills: ["Angular", "Next.js", "React", "React Native"],
    },
    { label: "Tools", glyph: "plus", skills: ["Git", "Postman", "Google Gemini API"] },
  ],
  experience: [
    {
      title: "Cal Poly Racing | Software Team Member",
      location: "San Luis Obispo, CA",
      // Role only on the website: the club has cleared details for the PDF resume, not the site.
      detail: "Part-tracking web app — Aug. 2026 – Present",
      bullets: [],
    },
    {
      title: "Hack4Impact Cal Poly | Software Developer",
      location: "San Luis Obispo, CA",
      detail: "Cal Poly Food Pantry inventory site — Aug. 2026 – Present",
      bullets: [
        "Delivered the FoodItem data model, MongoDB-backed GET/POST API routes, and add-item and confirm-delete modals for a 6-person team's Next.js inventory site across 7 merged PRs, with 7 Vitest tests.",
      ],
    },
    {
      title: "Develop for Good | Volunteer Developer",
      location: "Remote",
      detail: "Web Team – TAR Syndrome Association (nonprofit client) — May 2026 – Aug. 2026",
      bullets: [
        "Raised the client site's Google Lighthouse Accessibility score (desktop) from 72 to 87 by remediating WCAG failures: corrected contrast ratios, restored H1–H3 heading hierarchy, and replaced ambiguous links with accessible buttons.",
        "Delivered 2 of 8 pages in a nonprofit site redesign by implementing Figma hi-fi designs in Square Online and revising them through weekly client reviews.",
      ],
    },
  ],
  projects: [
    {
      title: "Weather Proxy API | Node.js, Express, Redis, Docker",
      bullets: [
        "Cut median response time for repeat-city requests from 138 ms to 1.6 ms (86x) by placing a Redis cache-aside layer with configurable TTL in front of the Visual Crossing weather API.",
        "Kept the API serving requests through a Redis outage by designing the cache to fail open to the upstream API, verified with 7 CI tests covering cache hit/miss, 404/502 mapping, outage fallback, and 429 rate limiting.",
      ],
    },
    {
      title: "Blogging Platform API | Express, PostgreSQL, Prisma, Docker",
      bullets: [
        "Verified full CRUD and case-insensitive keyword search against a real PostgreSQL database with 13 integration tests running in GitHub Actions CI.",
        "Cut test-suite runtime from 10.4 s to 0.43 s (24x) by diagnosing an unclosed Prisma connection pool that kept Node alive and closing it in a teardown hook.",
        "Reduced project setup to one command with no local installs by packaging the API and Postgres in Docker Compose with health-checked startup and automatic migrations.",
      ],
    },
    {
      title: "Oculus MD | QuackHacks 3 – FastAPI, MongoDB, Gemini",
      bullets: [
        "Flagged unsafe medication combinations such as Warfarin + Metronidazole by building a FastAPI backend with 3 MongoDB-backed checks: drug interactions, contraindications, and re-dose timing.",
        "Kept safety verdicts deterministic by limiting Gemini 2.5 Flash to identifying medications from camera and document images, with every decision computed by a rule-based engine against the drug database.",
      ],
    },
  ],
};
