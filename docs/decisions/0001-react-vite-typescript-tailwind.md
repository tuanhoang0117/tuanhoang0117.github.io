# 0001. Rebuild on React + Vite + TypeScript + Tailwind

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Tuan Hoang (product owner), Claude Code (engineering lead)

## Context

v1 is five hand-written HTML pages sharing one 650-line `styles.css`. v2 targets the polish of
[quackhacks.org](https://www.quackhacks.org/story): code-rendered pixel-art scenes, a chapter-based
story page, an event archive with detail pages, and filterable card grids.

v2 is also built with a multi-agent workflow: several coding agents work on separate issues in
parallel, each in its own git worktree, and every change lands through a reviewed PR. That makes
two things matter more than usual:

1. **Merge conflicts.** A single shared stylesheet is a conflict hotspot when four agents style
   four pages at once.
2. **Contracts.** Agents can't talk to each other. The only thing keeping their work compatible is
   the shared types and specs they all build against.

## Decision

- **React 19** for components. Scenes, cards, and chapters are reusable units with state.
- **Vite** for dev server and build. It's fast, has few config files, and matches the QuackHacks build flow
  this project deliberately replicates.
- **TypeScript (strict)** so the sprite format and content schema are enforced by the compiler,
  not by agents remembering a doc.
- **Tailwind CSS v4** with design tokens declared in `@theme`. Styles live next to the markup they
  style, so parallel PRs don't collide in a shared stylesheet.
- **React Router** with a `404.html` copy of `index.html` so deep links work on GitHub Pages.
- **Deploy** via a GitHub Actions workflow to GitHub Pages (replacing branch-root publishing at
  cutover).

## Consequences

- A build step now exists: the site can no longer be edited by opening an HTML file.
- GitHub Pages serves `404.html` for deep links with an HTTP 404 status. Crawlers may
  under-index subpages. That's acceptable for a portfolio, and we can revisit with prerendering if it matters.
- Old `.html` URLs (`portfolio.html`, etc.) change to clean routes (`/portfolio`). Redirects are
  handled in a later issue before cutover.
