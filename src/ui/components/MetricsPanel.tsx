"use client";

import { useMazeStore } from "@/ui/store/mazeStore";

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatFloat(value: number, digits = 2): string {
  return value.toFixed(digits);
}

export function MetricsPanel() {
  const runtime = useMazeStore((state) => state.runtime);

  return (
    <section className="metricsPanel">
      <h3>Metrics</h3>
      <dl>
        <div>
          <dt>Phase</dt>
          <dd>{runtime.phase}</dd>
        </div>
        <div>
          <dt>Step Count</dt>
          <dd>{runtime.metrics.stepCount}</dd>
        </div>
        <div>
          <dt>Visited</dt>
          <dd>{runtime.metrics.visitedCount}</dd>
        </div>
        <div>
          <dt>Frontier</dt>
          <dd>{runtime.metrics.frontierSize}</dd>
        </div>
        <div>
          <dt>Path Length</dt>
          <dd>{runtime.metrics.pathLength}</dd>
        </div>
        <div>
          <dt>Elapsed</dt>
          <dd>{formatElapsed(runtime.metrics.elapsedMs)}</dd>
        </div>
        <div>
          <dt>Actual Steps/s</dt>
          <dd>{formatFloat(runtime.metrics.actualStepsPerSec, 1)}</dd>
        </div>
        <div>
          <dt>Patches Applied</dt>
          <dd>{runtime.metrics.patchCount}</dd>
        </div>
        <div>
          <dt>Dirty Cells Drawn</dt>
          <dd>{runtime.metrics.dirtyCellCount}</dd>
        </div>
        <div>
          <dt>Avg Patches/Step</dt>
          <dd>{formatFloat(runtime.metrics.avgPatchesPerStep, 2)}</dd>
        </div>
        <div>
          <dt>Avg Dirty/Step</dt>
          <dd>{formatFloat(runtime.metrics.avgDirtyCellsPerStep, 2)}</dd>
        </div>
        <div>
          <dt>Engine Compute</dt>
          <dd>{formatElapsed(runtime.metrics.computeMs)}</dd>
        </div>
        <div>
          <dt>Engine Utilization</dt>
          <dd>{formatFloat(runtime.metrics.engineUtilizationPct, 1)}%</dd>
        </div>
      </dl>
    </section>
  );
}
