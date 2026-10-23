# 0002. No scroll-gated content

- **Status:** Accepted
- **Date:** 2026-10-23
- **Deciders:** Tuan Hoang, Claude Code

## Context

The quackhacks.org homepage pins full-screen sections and reveals content only as you scroll
through them. Much of the scroll distance is empty, waiting for logos or headlines to animate in.
It looks impressive and is slow to read.

Their `/story` page also pins a scene while you scroll, but it feels good because:

- every scroll step changes something,
- the chapter text is ordinary, readable paragraphs,
- a chapter bar lets you jump straight to any chapter.

## Decision

Animation may decorate content, never gate it.

- Text scrolls normally. Nothing is hidden until the user scrolls a certain distance.
- Story chapters use a **sticky scene** beside a normally scrolling text column. The scene swaps
  when a chapter's text enters the viewport.
- Every multi-step sequence has a **clickable, keyboard-accessible** navigator (chapter bar).
- Under `prefers-reduced-motion: reduce`, all content is still present and scenes switch without
  animation.

## Consequences

- No scroll-jacking libraries (no scroll hijacking, no pinned sections longer than their content).
- A Playwright test asserts that each chapter's text is in the DOM and visible without scrolling
  interactions beyond normal page scroll, and that the chapter bar navigates.
