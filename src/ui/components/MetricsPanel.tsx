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
    return `${solverA.label} wins (solved)`;
  }

  if (solverB.solved && !solverA.solved) {
    return `${solverB.label} wins (solved)`;
  }

  if (solverA.solved && solverB.solved) {
    if (solverA.elapsedMs < solverB.elapsedMs) {
      return `${solverA.label} wins (faster)`;
    }

    if (solverB.elapsedMs < solverA.elapsedMs) {
      return `${solverB.label} wins (faster)`;
    }

    if (solverA.visitedCount < solverB.visitedCount) {
      return `${solverA.label} wins (fewer visited)`;
    }

    if (solverB.visitedCount < solverA.visitedCount) {
      return `${solverB.label} wins (fewer visited)`;
    }

    return "Tie";
  }

  if (solverA.visitedCount < solverB.visitedCount) {
    return `${solverA.label} leads (fewer visited)`;
  }

  if (solverB.visitedCount < solverA.visitedCount) {
    return `${solverB.label} leads (fewer visited)`;
  }

  return "Tie";
}

function solverStatus(run: SolverRunMetrics): string {
  if (run.solved) {
    return "Solved";
  }

  if (run.done) {
    return "No path";
  }

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
    <article className={`battleCard battle${tone}`}>
      <header>
        <h5>{run.label}</h5>
        <span>{solverStatus(run)}</span>
      </header>
      <dl>
        <div>
          <dt>Steps</dt>
          <dd>{run.stepCount}</dd>
        </div>
        <div>
          <dt>Visited</dt>
          <dd>{run.visitedCount}</dd>
        </div>
        <div>
          <dt>Frontier</dt>
          <dd>{run.frontierSize}</dd>
        </div>
        <div>
          <dt>Path</dt>
          <dd>{run.pathLength}</dd>
        </div>
        <div>
          <dt>Elapsed</dt>
          <dd>{formatElapsed(run.elapsedMs)}</dd>
        </div>
        <div>
          <dt>Steps/s</dt>
          <dd>{formatFloat(run.actualStepsPerSec, 1)}</dd>
        </div>
        <div>
          <dt>Compute</dt>
          <dd>{formatElapsed(run.computeMs)}</dd>
        </div>
        <div>
          <dt>Patches</dt>
          <dd>{run.patchCount}</dd>
        </div>
      </dl>
    </article>
  );
}

export function MetricsPanel() {
  const runtime = useMazeStore((state) => state.runtime);
  const battle = runtime.metrics.battle;

  return (
    <section className="metricsPanel">
      <div className="metricsHead">
        <h3>Metrics</h3>
        <span>{runtime.phase}</span>
      </div>

      <div className="metricsKpiGrid">
        <article>
          <span>Steps</span>
          <strong>{runtime.metrics.stepCount}</strong>
        </article>
        <article>
          <span>Visited</span>
          <strong>{runtime.metrics.visitedCount}</strong>
        </article>
        <article>
          <span>Frontier</span>
          <strong>{runtime.metrics.frontierSize}</strong>
        </article>
        <article>
          <span>Elapsed</span>
          <strong>{formatElapsed(runtime.metrics.elapsedMs)}</strong>
        </article>
      </div>

      <dl className="metricsGrid">
        <div>
          <dt>Path Length</dt>
          <dd>{runtime.metrics.pathLength}</dd>
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

      {battle ? (
        <section className="battleMetrics">
          <div className="battleHead">
            <h4>Battle Comparison</h4>
            <span>{battleWinnerLabel(battle)}</span>
          </div>
          <div className="battleCards">
            <BattleSolverCard run={battle.solverA} tone="A" />
            <BattleSolverCard run={battle.solverB} tone="B" />
          </div>
        </section>
      ) : null}
    </section>
  );
}
