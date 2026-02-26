"use client";

import { useMazeStore } from "@/ui/store/mazeStore";
import { GENERATOR_PSEUDOCODE } from "@/ui/docs/generatorPseudocode";
import { SOLVER_PSEUDOCODE, type SolverPseudocodeDoc } from "@/ui/docs/solverPseudocode";
import type { GeneratorPseudocodeDoc } from "@/ui/docs/generatorPseudocode";

export function GeneratorTracePanel() {
  const settings = useMazeStore((state) => state.settings);
  const runtime = useMazeStore((state) => state.runtime);
  const toggleTraceHud = useMazeStore((state) => state.toggleTraceHud);

  const showSolverTrace =
    runtime.phase === "Solving" || runtime.phase === "Solved";
  const isBattleSolverTrace = showSolverTrace && settings.battleMode;

  const generatorDoc = GENERATOR_PSEUDOCODE[settings.generatorId];
  const solverDocA = SOLVER_PSEUDOCODE[settings.solverId];
  const solverDocB = SOLVER_PSEUDOCODE[settings.solverBId];

  const activeSolverLineA =
    runtime.metrics.battle?.solverA.activeLine ?? runtime.solverActiveLine;
  const activeSolverLineB =
    runtime.metrics.battle?.solverB.activeLine ?? runtime.solverBActiveLine;

  const eyebrow = showSolverTrace ? "Solver Trace" : "Generator Trace";
  const title = showSolverTrace
    ? isBattleSolverTrace
      ? "Battle Mode"
      : solverDocA.title
    : generatorDoc.title;

  return (
    <aside className="tracePanel">
      <div className="hudHeader">
        <div>
          <span className="traceEyebrow">{eyebrow}</span>
          <h3>{title}</h3>
        </div>
        <button type="button" className="hudCloseBtn" onClick={toggleTraceHud} title="Close (T)">
          &#x2715;
        </button>
      </div>

      {!showSolverTrace && (
        <TraceCodeList
          keyId={settings.generatorId}
          doc={generatorDoc}
          activeLine={runtime.generatorActiveLine}
        />
      )}

      {showSolverTrace && !isBattleSolverTrace && (
        <TraceCodeList
          keyId={settings.solverId}
          doc={solverDocA}
          activeLine={activeSolverLineA}
        />
      )}

      {showSolverTrace && isBattleSolverTrace && (
        <div className="traceBattleGrid">
          <TraceCodeList
            keyId={`${settings.solverId}-A`}
            doc={solverDocA}
            activeLine={activeSolverLineA}
            label="Solver A"
          />
          <TraceCodeList
            keyId={`${settings.solverBId}-B`}
            doc={solverDocB}
            activeLine={activeSolverLineB}
            label="Solver B"
          />
        </div>
      )}
    </aside>
  );
}

function TraceCodeList({
  keyId,
  doc,
  activeLine,
  label,
}: {
  keyId: string;
  doc: GeneratorPseudocodeDoc | SolverPseudocodeDoc;
  activeLine: number | null;
  label?: string;
}) {
  return (
    <section className={label ? "traceCodeSection" : undefined}>
      {label && <h4 className="traceCodeTitle">{label}: {doc.title}</h4>}
      <ol className="traceCodeList">
        {doc.lines.map((line, index) => {
          const lineNumber = index + 1;
          const isActive = typeof activeLine === "number" && lineNumber === activeLine;
          return (
            <li
              key={`${keyId}-line-${lineNumber}`}
              className={isActive ? "traceLine traceLineActive" : "traceLine"}
            >
              <span className="traceLineNo">{lineNumber.toString().padStart(2, "0")}</span>
              <code>{line}</code>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
