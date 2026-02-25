"use client";

import type { RefObject } from "react";

import { useMazeStore } from "@/ui/store/mazeStore";

interface CanvasViewportProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function CanvasViewport({ canvasRef }: CanvasViewportProps) {
  const { gridWidth, gridHeight, cellSize, battleMode } = useMazeStore(
    (state) => state.settings,
  );
  const runtime = useMazeStore((state) => state.runtime);

  const viewportWidth = gridWidth * cellSize;
  const viewportHeight = gridHeight * cellSize;

  return (
    <section className="canvasViewport">
      <header className="canvasHeader">
        <div>
          <h2>Maze Arena</h2>
          <p>
            {gridWidth} x {gridHeight} cells at {cellSize}px ({viewportWidth} x {viewportHeight}
            px)
          </p>
        </div>
        <div className="canvasBadges">
          <span className="canvasBadge">{runtime.phase}</span>
          <span className="canvasBadge">{runtime.paused ? "Paused" : "Running"}</span>
          {battleMode ? <span className="canvasBadge canvasBattleBadge">Battle</span> : null}
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
        >
          <canvas ref={canvasRef} />
        </div>
      </div>
    </section>
  );
}
