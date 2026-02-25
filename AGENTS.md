# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router entrypoints (`layout.tsx`, `page.tsx`, `docs/page.tsx`) and global CSS.
- `src/core/`: pure maze logic (grid, RNG, patch model, generator/solver plugins).
- `src/engine/`: runtime state machine in `MazeEngine.ts`.
- `src/render/`: canvas renderer (`CanvasRenderer.ts`) for dirty-cell redraws.
- `src/ui/`: React UI, Zustand store, hooks, and algorithm docs/constants.
- `tests/core/*.test.ts`: Vitest suites for generators, solvers, and RNG behavior.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: run local dev server (`http://localhost:3000`).
- `npm run build`: create production bundle.
- `npm run start`: serve the production build locally.
- `npm run lint`: run Next.js ESLint checks.
- `npm test`: run all tests once (`vitest run`).
- `npm run test:watch`: run tests in watch mode.
- Example targeted run: `npx vitest run tests/core/solvers.test.ts`.

## Coding Style & Naming Conventions
- Language: TypeScript with `strict` mode; keep types explicit at module boundaries.
- Formatting style in this repo: 2-space indentation, semicolons, double quotes, trailing commas.
- Prefer `@/` imports for modules under `src/`.
- Naming:
  - `PascalCase` for classes/components (`MazeEngine`, `ControlPanel`).
  - `camelCase` for functions/variables.
  - `kebab-case` plugin IDs (for example `"dfs-backtracker"`).

## Testing Guidelines
- Framework: Vitest (`vitest.config.ts`, Node environment).
- Place tests in `tests/**` and name files `*.test.ts`.
- For algorithm changes, validate determinism (same seed => same maze) and correctness (connectivity/path quality).
- No hard coverage threshold is configured; tests are required for behavior changes.

## Commit & Pull Request Guidelines
- Commit messages in history use concise imperative subjects, often scoped Conventional style (for example, `feat(ui): ...`, `feat(core): ...`); prefer that format for new commits.
- Keep commits focused to one logical change.
- PRs should include:
  - short summary of what changed and why,
  - impacted areas (`core`, `engine`, `ui`, `render`),
  - test evidence (commands run),
  - screenshots/GIFs for visual UI updates.
