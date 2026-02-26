"use client";

import { useMazeStore } from "@/ui/store/mazeStore";
import type { SolverBattleMetrics, SolverRunMetrics } from "@/engine/types";

function formatElapsed(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatFloat(value: number, digits = 2): string {
  return value.toFixed(digits);
}

function battleWinnerLabel(battle: SolverBattleMetrics): string {
  const { solverA, solverB } = battle;

  if (solverA.solved && !solverB.solved) {
    return `${solverA.label} wins`;
  }

  if (solverB.solved && !solverA.solved) {
    return `${solverB.label} wins`;
  }

  if (solverA.solved && solverB.solved) {
    if (solverA.elapsedMs < solverB.elapsedMs) {
      return `${solverA.label} wins`;
    }

    if (solverB.elapsedMs < solverA.elapsedMs) {
      return `${solverB.label} wins`;
    }

    if (solverA.visitedCount < solverB.visitedCount) {
      return `${solverA.label} wins`;
    }

    if (solverB.visitedCount < solverA.visitedCount) {
      return `${solverB.label} wins`;
    }

    return "Tie";
  }

  if (solverA.visitedCount < solverB.visitedCount) {
    return `${solverA.label} leads`;
  }

  if (solverB.visitedCount < solverA.visitedCount) {
    return `${solverB.label} leads`;
  }

  return "Tie";
}

function solverStatus(run: SolverRunMetrics): string {
  if (run.solved) return "Solved";
  if (run.done) return "No path";
  return "Running";
}

function BattleSolverCard({
  run,
  tone,
}: {
  run: SolverRunMetrics;
  tone: "A" | "B";
}) {
  return (
    <div className={`battleCard battle${tone}`}>
      <div className="battleCardHead">
        <strong>{run.label}</strong>
        <span className="battleStatus">{solverStatus(run)}</span>
      </div>
      <div className="battleStats">
        <div><span>Steps</span><strong>{run.stepCount}</strong></div>
        <div><span>Visited</span><strong>{run.visitedCount}</strong></div>
        <div><span>Path</span><strong>{run.pathLength}</strong></div>
        <div><span>Time</span><strong>{formatElapsed(run.elapsedMs)}</strong></div>
      </div>
    </div>
  );
}

export function MetricsPanel() {
  const runtime = useMazeStore((state) => state.runtime);
  const metricsExpanded = useMazeStore((state) => state.ui.metricsExpanded);
  const toggleMetricsExpanded = useMazeStore((state) => state.toggleMetricsExpanded);
  const toggleMetricsHud = useMazeStore((state) => state.toggleMetricsHud);
  const battle = runtime.metrics.battle;

  return (
    <section className="metricsPanel">
      <div className="hudHeader">
        <h3>Metrics</h3>
        <div className="hudActions">
          <button type="button" className="hudToggleBtn" onClick={toggleMetricsExpanded} title={metricsExpanded ? "Collapse" : "Expand"}>
            {metricsExpanded ? "\u25B4" : "\u25BE"}
          </button>
          <button type="button" className="hudCloseBtn" onClick={toggleMetricsHud} title="Close (M)">
            &#x2715;
          </button>
        </div>
      </div>

      <div className="kpiGrid">
        <div className="kpiItem">
          <span className="kpiLabel">Steps</span>
          <span className="kpiValue">{runtime.metrics.stepCount}</span>
        </div>
        <div className="kpiItem">
          <span className="kpiLabel">Visited</span>
          <span className="kpiValue">{runtime.metrics.visitedCount}</span>
        </div>
        <div className="kpiItem">
          <span className="kpiLabel">Frontier</span>
          <span className="kpiValue">{runtime.metrics.frontierSize}</span>
        </div>
        <div className="kpiItem">
          <span className="kpiLabel">Elapsed</span>
          <span className="kpiValue">{formatElapsed(runtime.metrics.elapsedMs)}</span>
        </div>
      </div>

      {metricsExpanded && (
        <>
          <div className="metricsDetail">
            <div className="metricRow"><span>Path Length</span><span>{runtime.metrics.pathLength}</span></div>
            <div className="metricRow"><span>Steps/s</span><span>{formatFloat(runtime.metrics.actualStepsPerSec, 1)}</span></div>
            <div className="metricRow"><span>Patches</span><span>{runtime.metrics.patchCount}</span></div>
            <div className="metricRow"><span>Dirty Cells</span><span>{runtime.metrics.dirtyCellCount}</span></div>
            <div className="metricRow"><span>Avg Patches/Step</span><span>{formatFloat(runtime.metrics.avgPatchesPerStep, 2)}</span></div>
            <div className="metricRow"><span>Compute</span><span>{formatElapsed(runtime.metrics.computeMs)}</span></div>
            <div className="metricRow"><span>Utilization</span><span>{formatFloat(runtime.metrics.engineUtilizationPct, 1)}%</span></div>
          </div>

          {battle && (
            <div className="battleSection">
              <div className="battleHeader">
                <span className="battleTitle">Battle</span>
                <span className="battleWinner">{battleWinnerLabel(battle)}</span>
              </div>
              <BattleSolverCard run={battle.solverA} tone="A" />
              <BattleSolverCard run={battle.solverB} tone="B" />
            </div>
          )}
        </>
      )}
    </section>
  );
}
