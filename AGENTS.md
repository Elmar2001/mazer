# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router entry points (`layout.tsx`, `page.tsx`, `docs/page.tsx`) and global styles.
- `src/core/`: Pure maze logic (grid model, RNG, patches, generator/solver plugin interfaces and implementations).
- `src/engine/`: Runtime orchestration (`MazeEngine.ts`) and worker runtime/protocol.
- `src/render/`: Canvas renderer (`CanvasRenderer.ts`) with dirty-cell redraw behavior.
- `src/ui/`: React components, Zustand store, hooks, algorithm constants/docs.
- `tests/`: Vitest suites grouped by domain (`tests/core`, `tests/engine`, `tests/config`).

## Build, Test, and Development Commands
- `npm install`: Install dependencies.
- `npm run dev`: Start local dev server at `http://localhost:3000`.
- `npm run build`: Create a production build.
- `npm run start`: Serve the production build.
- `npm run lint`: Run ESLint (`next lint --max-warnings=0`).
- `npm run typecheck`: Run TypeScript checks (`tsc --noEmit`).
- `npm test`: Run all tests once with Vitest.
- `npm run test:watch`: Run tests in watch mode.
- Example targeted test: `npx vitest run tests/core/solvers.test.ts`.

## Coding Style & Naming Conventions
- Language: TypeScript with strict typing; keep module boundaries explicitly typed.
- Formatting: 2 spaces, semicolons, double quotes, trailing commas.
- Imports: Prefer `@/` aliases for modules under `src/`.
- Naming:
  - `PascalCase` for classes/components (`MazeEngine`, `ControlPanel`)
  - `camelCase` for functions/variables
  - `kebab-case` for plugin IDs (`"dfs-backtracker"`).

## Testing Guidelines
- Framework: Vitest (`vitest.config.ts`, Node environment).
- Test files: `tests/**` with `*.test.ts` naming.
- For algorithm changes, verify:
  - determinism (`same seed => same maze`)
  - connectivity/correctness
  - plugin catalog/docs/pseudocode coverage when adding algorithms.
- Run before PR: `npm run lint && npm run typecheck && npm test && npm run build`.

## Commit & Pull Request Guidelines
- Prefer concise imperative commit subjects, often Conventional-style (for example, `feat(core): add ...`, `fix(ui): ...`).
- Keep each commit focused on one logical change.
- PRs should include:
  - what changed and why
  - impacted areas (`core`, `engine`, `ui`, `render`)
  - test evidence (commands run and outcomes)
  - screenshots/GIFs for UI-visible changes.
