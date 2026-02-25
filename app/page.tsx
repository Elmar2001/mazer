"use client";

import { CanvasViewport } from "@/ui/components/CanvasViewport";
import { ControlPanel } from "@/ui/components/ControlPanel";
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
        <CanvasViewport canvasRef={canvasRef} />
      </section>
    </main>
  );
}
