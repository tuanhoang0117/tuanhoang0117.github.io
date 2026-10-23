import type { Project } from "./types";

const gh = (repo: string) => ({
  label: "GitHub",
  href: `https://github.com/tuanhoang0117/${repo}`,
});

export const projects: Project[] = [
  {
    slug: "force-sensor-leds",
    title: "Force Sensor with LED Output",
    summary:
      "A CircuitPython project on an Adafruit Metro board that measures grip strength with a force sensor. LEDs light up at force thresholds, and a two-test comparison stores the stronger grip, lighting every LED when the second test beats the first.",
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
      "Detects and counts occupied zones in a 6x6 grid from a live webcam feed. Each cell goes through grayscale conversion, Gaussian blur, and adaptive thresholding to estimate occupancy in real time.",
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
  {
    slug: "phonebook",
    title: "Phonebook Application",
    summary:
      "A C++ console phonebook that stores, displays, updates, and removes contacts in a map keyed by name. Loads contacts and bulk updates from text files and formats numbers as XXX-XXX-XXXX.",
    stack: ["C++", "File-based storage"],
    images: [],
    links: [gh("Phonebook-Application")],
  },
  {
    slug: "remind-app",
    title: "Remind App",
    summary:
      "A cross-platform reminder app in Flutter focused on fast task entry and reliable persistence. Tasks sync through Cloud Firestore and are cached locally with SharedPreferences.",
    stack: ["Flutter", "Dart", "Cloud Firestore", "SharedPreferences"],
    images: [],
    links: [gh("remindapp")],
  },
  {
    slug: "weather-api",
    title: "WeatherAPI",
    summary:
      "A proxy and cache in front of the Visual Crossing weather API. Checks Redis first (cache-aside with configurable TTL) and only calls upstream on a miss, with per-IP rate limiting and structured 400/404/429/502 errors.",
    stack: ["Node.js", "Express", "Redis", "express-rate-limit"],
    images: [],
    links: [gh("WeatherAPI")],
  },
  {
    slug: "blogging-platform-api",
    title: "Blogging Platform API",
    summary:
      "A REST API with full CRUD on posts and case-insensitive keyword search across title, content, and category. Validates request bodies and returns consistently shaped errors; data persists in PostgreSQL via Prisma.",
    stack: ["Node.js", "Express 5", "PostgreSQL", "Prisma"],
    images: [],
    links: [gh("BloggingPlatformAPI")],
  },
];
