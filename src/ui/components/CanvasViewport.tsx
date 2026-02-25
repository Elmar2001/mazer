"use client";

import { useState, type MouseEvent, type RefObject } from "react";

import type { MazeControls } from "@/ui/hooks/useMazeEngine";
import { useMazeStore } from "@/ui/store/mazeStore";

interface CanvasViewportProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  controls: MazeControls;
}

export function CanvasViewport({ canvasRef, controls }: CanvasViewportProps) {
  const { gridWidth, gridHeight, cellSize, battleMode } = useMazeStore(
    (state) => state.settings,
  );
  const runtime = useMazeStore((state) => state.runtime);
  const [hoverCell, setHoverCell] = useState<string | null>(null);

  const viewportWidth = gridWidth * cellSize;
  const viewportHeight = gridHeight * cellSize;
  const canSolve = runtime.phase === "Generated" || runtime.phase === "Solved";
  const canPlaybackControl =
    runtime.phase === "Generating" || runtime.phase === "Solving";

  const onFramePointerMove = (event: MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;

    if (
      localX < 0 ||
      localY < 0 ||
      localX >= viewportWidth ||
      localY >= viewportHeight
    ) {
      setHoverCell(null);
      return;
    }

    const x = Math.floor(localX / cellSize);
    const y = Math.floor(localY / cellSize);
    const index = y * gridWidth + x;
    setHoverCell(`x:${x} y:${y} #${index}`);
  };

  return (
    <section className="canvasViewport">
      <header className="canvasHeader">
        <div className="canvasHeaderMain">
          <h2>Maze Arena</h2>
          <p>
            {gridWidth} x {gridHeight} cells at {cellSize}px ({viewportWidth} x {viewportHeight}
            px)
          </p>
        </div>
        <div className="canvasHeaderRight">
          <div className="arenaActions">
            <button type="button" className="arenaBtn arenaBtnGenerate" onClick={controls.generate}>
              Generate
            </button>
            <button
              type="button"
              className="arenaBtn arenaBtnSolve"
              onClick={controls.solve}
              disabled={!canSolve}
            >
              Solve
            </button>
            <button
              type="button"
              className="arenaBtn"
              onClick={controls.pauseResume}
              disabled={!canPlaybackControl}
            >
              {runtime.paused ? "Resume" : "Pause"}
            </button>
            <button
              type="button"
              className="arenaBtn"
              onClick={controls.stepOnce}
              disabled={!canPlaybackControl}
            >
              Step
            </button>
            <button type="button" className="arenaBtn arenaBtnReset" onClick={controls.reset}>
              Reset
            </button>
          </div>
          <div className="canvasBadges">
            <span className="canvasBadge">{runtime.phase}</span>
            <span className="canvasBadge">{runtime.paused ? "Paused" : "Running"}</span>
            {battleMode ? <span className="canvasBadge canvasBattleBadge">Battle</span> : null}
            {hoverCell ? <span className="canvasBadge canvasCoordBadge">{hoverCell}</span> : null}
          </div>
        </div>
      </header>
      <div className="canvasLegend">
        <span>
          <i className="canvasSwatch swWall" /> Walls
        </span>
        <span>
          <i className="canvasSwatch swStart" /> Start
        </span>
        <span>
          <i className="canvasSwatch swGoal" /> Goal
        </span>
        <span>
          <i className="canvasSwatch swPathA" /> Solver A Path
        </span>
        {battleMode ? (
          <span>
            <i className="canvasSwatch swPathB" /> Solver B Path
          </span>
        ) : null}
      </div>
      <div className="canvasScroller">
        <div
          className="canvasFrame"
          style={{ width: `${viewportWidth}px`, height: `${viewportHeight}px` }}
          onMouseMove={onFramePointerMove}
          onMouseLeave={() => setHoverCell(null)}
        >
          <canvas ref={canvasRef} />
        </div>
      </div>
    </section>
  );
}
