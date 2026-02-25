"use client";

import type { RefObject } from "react";

import { useMazeStore } from "@/ui/store/mazeStore";

interface CanvasViewportProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function CanvasViewport({ canvasRef }: CanvasViewportProps) {
  const { gridWidth, gridHeight, cellSize } = useMazeStore((state) => state.settings);

  const viewportWidth = gridWidth * cellSize;
  const viewportHeight = gridHeight * cellSize;

  return (
    <section className="canvasViewport">
      <header className="canvasHeader">
        <h2>Maze Viewport</h2>
        <p>
          {gridWidth} x {gridHeight} cells at {cellSize}px
        </p>
      </header>
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
