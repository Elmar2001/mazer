"use client";

import { useMazeStore } from "@/ui/store/mazeStore";
import { GENERATOR_PSEUDOCODE } from "@/ui/docs/generatorPseudocode";

export function GeneratorTracePanel() {
  const generatorId = useMazeStore((state) => state.settings.generatorId);
  const phase = useMazeStore((state) => state.runtime.phase);
  const activeLine = useMazeStore((state) => state.runtime.generatorActiveLine);

  const doc = GENERATOR_PSEUDOCODE[generatorId];
  const canHighlight = phase === "Generating" && typeof activeLine === "number";

  return (
    <aside className="tracePanel">
      <header className="traceHead">
        <div>
          <p className="traceEyebrow">Generator Trace</p>
          <h3>{doc.title}</h3>
          <p>{doc.summary}</p>
        </div>
        <div className="traceMeta">
          <span>{generatorId}</span>
          <span>{canHighlight ? `Line ${activeLine}` : "Idle"}</span>
        </div>
      </header>

      <ol className="traceCodeList">
        {doc.lines.map((line, index) => {
          const lineNumber = index + 1;
          const isActive = canHighlight && lineNumber === activeLine;
          return (
            <li
              key={`${generatorId}-line-${lineNumber}`}
              className={isActive ? "traceLine traceLineActive" : "traceLine"}
            >
              <span className="traceLineNo">{lineNumber.toString().padStart(2, "0")}</span>
              <code>{line}</code>
            </li>
          );
        })}
      </ol>

      <p className="traceHint">
        Line highlighting follows generation step metadata in real time.
      </p>
    </aside>
  );
}
