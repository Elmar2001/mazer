"use client";

import { CanvasViewport } from "@/ui/components/CanvasViewport";
import { ControlPanel } from "@/ui/components/ControlPanel";
import { GeneratorTracePanel } from "@/ui/components/GeneratorTracePanel";
import { MetricsPanel } from "@/ui/components/MetricsPanel";
import { useMazeEngine } from "@/ui/hooks/useMazeEngine";

export default function HomePage() {
  const { canvasRef, controls } = useMazeEngine();

  return (
    <main className="appShell">
      <aside className="leftPane">
        <ControlPanel controls={controls} />
        <MetricsPanel />
      </aside>
      <section className="rightPane">
        <div className="rightPaneLayout">
          <CanvasViewport canvasRef={canvasRef} />
          <GeneratorTracePanel />
        </div>
      </section>
    </main>
  );
}
