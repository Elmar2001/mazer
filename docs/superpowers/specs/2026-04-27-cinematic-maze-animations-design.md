# Cinematic Maze Animations Design

## Goal

Elevate the main Mazer visualizer into a cinematic simulation deck with visibly richer motion while preserving the existing dark, glassy, technical identity and the renderer's dirty-cell performance model.

## Visual Direction

Mazer should feel like an active algorithm instrument: dark glass panels, quiet cyan/amber/emerald energy, precise state changes, and restrained scanline/signal motion. The animation language should be technical and cinematic, not playful, bouncy, or generic neon SaaS.

## Scope

This pass targets the main visualizer route only:

- app shell, sidebar, HUDs, playback bar, and canvas viewport
- renderer-level transient effects for algorithm patch events
- reduced-motion and high-load fallbacks

Documentation and architecture pages remain visually compatible but are not redesigned in this pass.

## Architecture

Animation is split into two layers:

1. CSS/React chrome motion for panels, controls, HUDs, phase state, and viewport atmosphere.
2. Canvas renderer transient effects for maze cells, because the maze itself is not DOM-rendered.

The engine and algorithm plugins remain unchanged. `useMazeEngine` forwards existing worker patch metadata into `CanvasRenderer`, and the renderer classifies patches into bounded live-canvas effects: frontier flash, visited tint, and path pulse. A lightweight live loop also pulses start/goal markers during active generation/solving. Effects degrade automatically for high speed, small cells, large dirty batches, or reduced-motion users.

## Components

- `src/render/renderEffects.ts`: pure helpers for motion mode detection, patch classification, active live-loop detection, effect aging, and effect limits.
- `src/render/CanvasRenderer.ts`: owns transient effect state, animation RAF, effect redraw, and reduced/high-load fallbacks.
- `src/ui/hooks/useMazeEngine.ts`: passes patch context into `renderDirty`.
- `app/page.tsx`: exposes phase/paused/battle data attributes for CSS state styling.
- `src/ui/components/CanvasViewport.tsx`: exposes phase/paused data on the canvas workbench and adds ambient overlay elements.
- `src/ui/components/ControlPanel.tsx`: keeps current controls but adds motion-friendly state classes.
- `src/ui/components/MetricsPanel.tsx`: marks KPI values and battle cards for value-change and live-state styling.
- `src/ui/components/GeneratorTracePanel.tsx`: marks trace rows for active-line motion.
- `app/globals.css`: motion tokens, shell/HUD/control transitions, ambient canvas overlays, reduced-motion fallback.

## Performance Rules

- Never animate every cell every frame.
- Never add React state updates per patch for visual-only effects.
- Keep canvas effects bounded by a small fixed effect limit.
- Disable transient effects when speed or dirty-cell volume is too high.
- Prefer opacity and transform for DOM animations.
- Respect `prefers-reduced-motion: reduce`.

## Testing

Automated tests focus on pure renderer motion behavior:

- motion mode disables effects for reduced motion, high speed, tiny cells, and large dirty batches
- patch classification maps wall/current/frontier changes to frontier flash, visited changes to tint, and path changes to pulse
- active live-loop detection runs only while generating or solving
- effect aging removes expired effects and caps retained effect count

Manual/browser verification covers visual fidelity, mobile layout, HUD exits, sidebar collapse, battle mode, high-speed degradation, and reduced-motion behavior.

## Open Decisions

This implementation will not add Framer Motion or another animation dependency. Native CSS and renderer RAF are enough for the first pass and avoid dependency churn.
