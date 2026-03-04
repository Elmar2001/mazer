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
    setHoverCell(`${x},${y} #${index}`);
  };

  return (
    <section className="canvasViewport">
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

      <div className="canvasLegend">
        <span><i className="canvasSwatch swWall" /> Walls</span>
        <span><i className="canvasSwatch swStart" /> Start</span>
        <span><i className="canvasSwatch swGoal" /> Goal</span>
        <span><i className="canvasSwatch swPathA" /> Path A</span>
        {battleMode && <span><i className="canvasSwatch swPathB" /> Path B</span>}
        {hoverCell && <span className="coordBadge">{hoverCell}</span>}
      </div>

      <div className="playbackBar">
        <button type="button" className="pbBtn pbGenerate" onClick={controls.generate} aria-label="Generate maze">
          <span className="pbIcon">&#x25B6;</span> Generate
        </button>
        <button type="button" className="pbBtn pbSolve" onClick={controls.solve} disabled={!canSolve} aria-label="Solve maze">
          <span className="pbIcon">&#x26A1;</span> Solve
        </button>
        <div className="pbDivider" />
        <button type="button" className="pbBtn pbGhost" onClick={controls.pauseResume} disabled={!canPlaybackControl} aria-label={runtime.paused ? "Resume playback" : "Pause playback"}>
          {runtime.paused ? "\u23F5" : "\u23F8"}
        </button>
        <button type="button" className="pbBtn pbGhost" onClick={controls.stepOnce} disabled={!canPlaybackControl} aria-label="Step forward">
          &#x23ED;
        </button>
        <div className="pbDivider" />
        <button type="button" className="pbBtn pbDanger" onClick={controls.reset} aria-label="Reset maze">
          &#x21BB;
        </button>
        <div className="pbSpacer" />
        <span className="pbStat">{runtime.metrics.stepCount} steps</span>
        <span className="pbStat">{runtime.metrics.actualStepsPerSec.toFixed(0)} sps</span>
      </div>
    </section>
  );
}
