import type { Project } from "./types";

const gh = (repo: string) => ({
  label: "GitHub",
  href: `https://github.com/tuanhoang0117/${repo}`,
});

// Newest first. Every claim here is checked against the owner's private fact sheet.
export const projects: Project[] = [
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
