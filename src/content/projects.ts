import type { Project } from "./types";

const gh = (repo: string) => ({
  label: "GitHub",
  href: `https://github.com/tuanhoang0117/${repo}`,
});

// Newest first. Every claim here is checked against the owner's private fact sheet.
export const projects: Project[] = [
  {
    slug: "tar-syndrome-website",
    title: "TAR Syndrome Association Website",
    summary:
      "A redesign of the TAR Syndrome Association's website, built with a Develop for Good team for a nonprofit client that supports people and families affected by a rare condition. I built pages in Square Online from the team's designs, worked on SEO, and raised the site's Lighthouse accessibility score from 72 to 87.",
    stack: ["Square Online", "Figma", "Lighthouse", "SEO"],
    images: [],
    links: [{ label: "Live site", href: "https://tar-syndrome-awareness.square.site/" }],
    period: "May – Aug 2026",
    featured: true,
    caseStudy: {
      overview:
        "The TAR Syndrome Association is a nonprofit that raises awareness of Thrombocytopenia-Absent Radius (TAR) syndrome and supports the people and families affected by this rare condition. From May to August 2026, a Develop for Good team redesigned its website.",
      problem:
        "The existing site needed clearer organization, easier navigation, and information that was easier to reach for patients, families, and healthcare professionals. The goal was to reorganize it, keep what was already there, and add educational, support, research, and engagement resources.",
      process: [
        {
          title: "Mapped the site",
          detail:
            "The team defined the new pages and what each one covers: a home page, and pages for families, healthcare professionals, research and advocacy, kids and young adolescents, getting involved, and contact.",
        },
        {
          title: "Researched similar sites",
          detail:
            "We looked at five websites that present medical conditions, to see how they organize information and keep it readable.",
        },
        {
          title: "Designed in three rounds",
          detail:
            "Low-fidelity layouts, then mid-fidelity, then high-fidelity prototypes in Figma, with weekly client meetings shaping each round.",
        },
        {
          title: "Tested with users",
          detail:
            "Three testers walked through the pages. Their feedback on color contrast, font sizes, headings, and how much text each section carried changed the final designs. We also ran Google Lighthouse accessibility checks.",
        },
        {
          title: "Built it in Square Online",
          detail:
            "The approved designs were implemented page by page in the client's Square Online site, a no-code site builder.",
        },
        {
          title: "Handed it off",
          detail:
            "We wrote a client handoff guide so the association can keep adding content after the program, and presented the work at Demo Day.",
        },
      ],
      role: [
        "I built pages in Square Online from the team's high-fidelity Figma designs, delivering 2 of the site's 8 pages and revising them through weekly client reviews.",
        "I raised the site's desktop Lighthouse Accessibility score from 72 to 87 by fixing WCAG failures: corrected contrast ratios, restored the H1–H3 heading order, and replaced ambiguous links with accessible buttons.",
        "I worked on the site's search optimization.",
        "I co-wrote the project requirements document, the client handoff guide, and the Demo Day technical presentation.",
        "I was frustrated at first because the work involved no coding. It's now the work I'm proudest of: a real client, a team, and a site that helps people with TAR syndrome.",
      ],
      results: [
        "The site was reorganized for its two main audiences: people with TAR syndrome and the caregivers of children with it.",
        "In user testing, people praised how easy the navigation was and how intuitive it was to find information.",
        "The desktop Lighthouse Accessibility score rose from 72 to 87.",
        "When the program ended, some sections still needed the association's own text and images, which it adds using the handoff guide.",
      ],
      tools: [
        "Square Online",
        "Figma",
        "UserTesting",
        "Google Lighthouse",
        "Notion",
        "Google Sheets",
      ],
      pdf: {
        label: "Download the team case study (PDF)",
        href: "/develop-for-good-case-study.pdf",
      },
    },
  },
  {
    slug: "cal-poly-food-pantry",
    title: "Cal Poly Food Pantry Inventory",
    summary:
      "An inventory site for the Cal Poly Food Pantry, built by a six-person Hack4Impact team. I delivered the FoodItem data model, the MongoDB-backed GET/POST API routes, and the add-item and confirm-delete modals across 7 merged PRs, with 7 Vitest tests.",
    stack: ["Next.js", "MongoDB", "Vitest"],
    images: [],
    links: [{ label: "Live site", href: "https://foodpantrycalpoly17.vercel.app" }],
  },
  {
    slug: "weather-api",
    title: "WeatherAPI",
    summary:
      "A proxy and cache in front of the Visual Crossing weather API. A Redis cache-aside layer cut median response time for repeat cities from 138 ms to 1.6 ms, and the cache fails open so the API keeps serving through a Redis outage. Covered by 7 CI tests.",
    stack: ["Node.js", "Express", "Redis", "Docker"],
    images: [],
    links: [gh("WeatherAPI")],
  },
  {
    slug: "blogging-platform-api",
    title: "Blogging Platform API",
    summary:
      "A REST API with full CRUD and case-insensitive keyword search, verified by 13 integration tests against a real PostgreSQL database in CI. Cut the test suite from 10.4 s to 0.43 s by finding an unclosed Prisma connection pool.",
    stack: ["Express", "PostgreSQL", "Prisma", "Docker"],
    images: [],
    links: [gh("BloggingPlatformAPI")],
  },
  {
    slug: "remind-app",
    title: "Remind App",
    summary:
      "I had an interview coming up with a company that used Flutter, so I learned Flutter by building this: a cross-platform reminder app that syncs tasks through Cloud Firestore and caches them locally.",
    stack: ["Flutter", "Dart", "Cloud Firestore"],
    images: [],
    links: [gh("remindapp")],
  },
  {
    slug: "force-sensor-leds",
    title: "Force Sensor with LED Output",
    summary:
      "Built for a project competition at the UCSD Summer Internship Prep Program: a grip-strength tester on an Adafruit Metro board. LEDs light up at force thresholds, and a second test that beats the first lights every LED.",
    stack: ["CircuitPython", "Adafruit Metro M4", "Force sensor", "LEDs"],
    images: [
      {
        src: "https://raw.githubusercontent.com/tuanhoang0117/force-sensor-LEDs/main/force-sensor-leds/assets/forcesensor.jpg",
        alt: "Force sensor with LED apparatus",
      },
    ],
    links: [gh("force-sensor-LEDs")],
  },
  {
    slug: "grid-occupancy-opencv",
    title: "Grid Occupancy Detection with OpenCV",
    summary:
      "The second UCSD competition project: a live webcam feed split into a 6x6 grid, with each cell marked occupied by its pixel intensity after grayscale conversion, blur, and adaptive thresholding.",
    stack: ["Python", "OpenCV", "NumPy"],
    images: [
      {
        src: "https://raw.githubusercontent.com/tuanhoang0117/OpenCV-Crowd-Density/main/OpenCV-Crowd-Density/assets/apparatus.jpg",
        alt: "Webcam and hardware setup for grid occupancy detection",
      },
      {
        src: "https://raw.githubusercontent.com/tuanhoang0117/OpenCV-Crowd-Density/main/OpenCV-Crowd-Density/assets/grid.png",
        alt: "6x6 grid visualization showing occupied and empty cells",
      },
    ],
    links: [gh("OpenCV-Crowd-Density")],
  },
];
