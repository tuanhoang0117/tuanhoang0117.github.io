# tuanhoang0117.github.io

Personal site of Tuan Hoang, computer science student at Cal Poly SLO.

v2 is a rebuild in React, Vite, TypeScript, and Tailwind, with a pixel/digital rendering
aesthetic and code-drawn pixel art. It's built with an agentic workflow run like a small
engineering team. Planned work becomes issues with testable acceptance criteria, coding agents
take issues in isolated git worktrees, and every change lands through a PR gated by CI, an
independent reviewer agent, and human review.

## How it's built

| Where                                            | What                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [`docs/decisions/`](docs/decisions/)             | Architecture decision records: why each major choice was made           |
| [`docs/design-system.md`](docs/design-system.md) | Tokens and visual rules every page follows                              |
| [`docs/contracts/`](docs/contracts/)             | Shared specs that parallel agents build against                         |
| [`CLAUDE.md`](CLAUDE.md)                         | Agent instructions, file ownership, definition of done, lessons learned |
| Issues and PRs                                   | Every change, its acceptance criteria, its tests, and its review        |

## Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # lint, format, typecheck, unit tests
npm run test:e2e   # Playwright + axe, desktop and mobile
```
