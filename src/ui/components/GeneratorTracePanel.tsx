"use client";

import { useMazeStore } from "@/ui/store/mazeStore";
import { GENERATOR_PSEUDOCODE } from "@/ui/docs/generatorPseudocode";
import { SOLVER_PSEUDOCODE, type SolverPseudocodeDoc } from "@/ui/docs/solverPseudocode";
import type { GeneratorPseudocodeDoc } from "@/ui/docs/generatorPseudocode";

export function GeneratorTracePanel() {
  const settings = useMazeStore((state) => state.settings);
  const runtime = useMazeStore((state) => state.runtime);

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

  return (
    <aside className="tracePanel">
      <header className="traceHead">
        <div>
          <p className="traceEyebrow">
            {showSolverTrace ? "Solver Trace" : "Generator Trace"}
          </p>
          <h3>
            {showSolverTrace
              ? isBattleSolverTrace
                ? "Battle Solver Pseudocode"
                : solverDocA.title
              : generatorDoc.title}
          </h3>
          <p>
            {showSolverTrace
              ? isBattleSolverTrace
                ? "Both solver traces are highlighted as each algorithm advances."
                : solverDocA.summary
              : generatorDoc.summary}
          </p>
        </div>
        <div className="traceMeta">
          {!showSolverTrace ? <span>{settings.generatorId}</span> : null}
          {showSolverTrace && !isBattleSolverTrace ? <span>{settings.solverId}</span> : null}
          {showSolverTrace && isBattleSolverTrace ? <span>{settings.solverId} vs {settings.solverBId}</span> : null}
          {!showSolverTrace ? (
            <span>
              {typeof runtime.generatorActiveLine === "number"
                ? `Line ${runtime.generatorActiveLine}`
                : "Idle"}
            </span>
          ) : null}
          {showSolverTrace && !isBattleSolverTrace ? (
            <span>
              {typeof activeSolverLineA === "number" ? `Line ${activeSolverLineA}` : "Idle"}
            </span>
          ) : null}
        </div>
      </header>

      {!showSolverTrace ? (
        <TraceCodeList
          keyId={settings.generatorId}
          doc={generatorDoc}
          activeLine={runtime.generatorActiveLine}
        />
      ) : null}

      {showSolverTrace && !isBattleSolverTrace ? (
        <TraceCodeList
          keyId={settings.solverId}
          doc={solverDocA}
          activeLine={activeSolverLineA}
        />
      ) : null}

      {showSolverTrace && isBattleSolverTrace ? (
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
      ) : null}

      <p className="traceHint">
        Line highlighting follows live step metadata while algorithms run.
      </p>
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
      {label ? <h4 className="traceCodeTitle">{label}: {doc.title}</h4> : null}
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
