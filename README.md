# tuanhoang0117.github.io

Personal site of Tuan Hoang, computer science student at Cal Poly SLO.

Built in React, Vite, TypeScript, and Tailwind, with a pixel/digital rendering aesthetic and
code-drawn pixel art. It's built with an agentic workflow run like a small engineering team.
Planned work becomes issues with testable acceptance criteria, coding agents take issues in
isolated git worktrees, and every change lands through a PR gated by CI, QA and reviewer agents
sized to the change's risk, and human review.

## How it's built

| Where                                            | What                                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [`docs/decisions/`](docs/decisions/)             | Architecture decision records: why each major choice was made           |
| [`docs/design-system.md`](docs/design-system.md) | Tokens and visual rules every page follows                              |
| [`docs/contracts/`](docs/contracts/)             | Shared specs that parallel agents build against                         |
| [`docs/agent-guide.md`](docs/agent-guide.md)     | Agent instructions, file ownership, definition of done, lessons learned |
| [`docs/lead-guide.md`](docs/lead-guide.md)       | How the lead session runs sprints, and hands off between AI tools       |
| Issues and PRs                                   | Every change, its acceptance criteria, its tests, and its review        |

## Development

Claude Code users: after a fresh clone, create the ignored root `CLAUDE.md` with exactly one line:
`@docs/agent-guide.md`.

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # lint, format, typecheck, unit tests
npm run test:e2e   # Playwright + axe, desktop and mobile
```
