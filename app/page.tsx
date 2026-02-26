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

  return (
    <main className={`appShell ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}>
      <aside className="sidebar">
        <ControlPanel controls={controls} />
      </aside>
      <section className="canvasArea">
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
