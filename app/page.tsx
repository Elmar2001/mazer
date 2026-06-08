"use client";

import { CanvasViewport } from "@/ui/components/CanvasViewport";
import { ControlPanel } from "@/ui/components/ControlPanel";
import { GeneratorTracePanel } from "@/ui/components/GeneratorTracePanel";
import { MetricsPanel } from "@/ui/components/MetricsPanel";
import { useMazeEngine } from "@/ui/hooks/useMazeEngine";
import { useMazeStore } from "@/ui/store/mazeStore";

export default function HomePage() {
  const { canvasRef, controls } = useMazeEngine();
  const sidebarCollapsed = useMazeStore((s) => s.ui.sidebarCollapsed);
  const showMetricsHud = useMazeStore((s) => s.ui.showMetricsHud);
  const showTraceHud = useMazeStore((s) => s.ui.showTraceHud);
  const runtime = useMazeStore((s) => s.runtime);
  const settings = useMazeStore((s) => s.settings);
  const battleMode = useMazeStore((s) => s.settings.battleMode);
  const clearError = useMazeStore((s) => s.clearError);

  return (
    <main
      className={`appShell ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}
      data-phase={runtime.phase.toLowerCase()}
      data-paused={runtime.paused}
      data-battle={battleMode}
    >
      <aside className="sidebar">
        <ControlPanel controls={controls} />
      </aside>
      <section className="canvasArea">
        <div className="commandDeck" aria-label="Maze status">
          <div className="commandDeckMain">
            <span className="commandEyebrow">Interactive maze lab</span>
            <strong>{runtime.phase}</strong>
          </div>
          <div className="commandDeckStats">
            <span>{settings.gridWidth}x{settings.gridHeight}</span>
            <span>{settings.generatorId}</span>
            <span>{settings.solverId}</span>
          </div>
        </div>
        {runtime.error && (
          <div className="engineErrorBanner" role="alert">
            <span className="engineErrorText">{runtime.error}</span>
            <button
              type="button"
              className="engineErrorDismiss"
              onClick={clearError}
              aria-label="Dismiss error"
            >
              &#x2715;
            </button>
          </div>
        )}
        <CanvasViewport canvasRef={canvasRef} controls={controls} />
        {showMetricsHud && (
          <div className="hudMetrics">
            <MetricsPanel />
          </div>
        )}
        {showTraceHud && (
          <div className="hudTrace">
            <GeneratorTracePanel />
          </div>
        )}
      </section>
    </main>
  );
}
