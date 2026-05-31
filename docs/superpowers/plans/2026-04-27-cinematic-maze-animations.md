# Cinematic Maze Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intentional cinematic motion to the Mazer visualizer without compromising the existing canvas dirty-cell performance model.

**Architecture:** Use CSS/data-attribute motion for React chrome and a bounded live-canvas effect system inside `CanvasRenderer` for maze-cell energy. Keep the worker and algorithm plugin contracts intact by classifying existing patch events in the renderer layer.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zustand, HTML Canvas 2D, CSS keyframes/transitions, Vitest.

---

### Task 1: Renderer Motion Primitives

**Files:**
- Create: `src/render/renderEffects.ts`
- Create: `tests/render/renderEffects.test.ts`

- [ ] Write failing tests for motion mode selection, patch classification, active live-loop detection, and effect aging.
- [ ] Run `npx vitest run tests/render/renderEffects.test.ts` and confirm failures come from missing module/behavior.
- [ ] Implement the pure helper module with strict exported types.
- [ ] Run `npx vitest run tests/render/renderEffects.test.ts` and confirm the suite passes.

### Task 2: Canvas Transient Effects

**Files:**
- Modify: `src/render/CanvasRenderer.ts`
- Modify: `src/ui/hooks/useMazeEngine.ts`

- [ ] Change `CanvasRenderer.renderDirty` to accept patches plus a reduced-motion flag.
- [ ] Add a bounded effect buffer and RAF loop that redraws only affected cells while effects are alive.
- [ ] Draw frontier flash, visited tint, pulsing path, and live start/goal endpoint glow with restrained intensity.
- [ ] Pass patch metadata from `useMazeEngine` into `renderDirty`.
- [ ] Run `npx vitest run tests/render/renderEffects.test.ts`.

### Task 3: Phase-Aware Shell Motion

**Files:**
- Modify: `app/page.tsx`
- Modify: `src/ui/components/CanvasViewport.tsx`
- Modify: `app/globals.css`

- [ ] Add phase, paused, and battle data attributes to the shell and canvas viewport.
- [ ] Add ambient canvas overlays for scanlines, grid shimmer, and live phase energy.
- [ ] Add staged app-shell, sidebar, canvas-frame, legend, and playback-bar entrance animations.
- [ ] Add reduced-motion fallbacks that remove nonessential animation.

### Task 4: HUD, Trace, and Control Polish

**Files:**
- Modify: `src/ui/components/ControlPanel.tsx`
- Modify: `src/ui/components/MetricsPanel.tsx`
- Modify: `src/ui/components/GeneratorTracePanel.tsx`
- Modify: `src/ui/components/MazeConfigPanel.tsx`
- Modify: `app/globals.css`

- [ ] Add state classes/data attributes needed for live, expanded, battle, and active-line styles.
- [ ] Add value-change, active-line, battle, accordion, side-panel, and hover/focus transitions.
- [ ] Keep motion restrained, transform/opacity-based, and consistent with the dark technical identity.

### Task 5: Verification

**Files:**
- No new files expected.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Inspect `git diff --stat` and review changed files for scope control.
