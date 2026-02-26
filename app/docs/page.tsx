import Link from "next/link";

import { generatorPlugins } from "@/core/plugins/generators";
import { solverPlugins } from "@/core/plugins/solvers";
import {
  GENERATOR_DOCS,
  SOLVER_DOCS,
  type AlgorithmDoc,
} from "@/ui/docs/algorithmDocs";

const GENERATOR_META_BY_ID = new Map(
  generatorPlugins.map((plugin) => [plugin.id, plugin]),
);
const SOLVER_META_BY_ID = new Map(solverPlugins.map((plugin) => [plugin.id, plugin]));

function AlgorithmCard({
  algorithm,
}: {
  algorithm: AlgorithmDoc;
}) {
  const pluginMeta =
    algorithm.kind === "Generator"
      ? GENERATOR_META_BY_ID.get(algorithm.id)
      : SOLVER_META_BY_ID.get(algorithm.id);
  const aliasTargetLabel =
    pluginMeta?.implementationKind === "alias" && pluginMeta.aliasOf
      ? GENERATOR_META_BY_ID.get(pluginMeta.aliasOf)?.label ??
        SOLVER_META_BY_ID.get(pluginMeta.aliasOf)?.label ??
        pluginMeta.aliasOf
      : null;

  return (
    <article className="algoCard" id={algorithm.id}>
      <div className="algoCardHead">
        <span className={`algoBadge ${algorithm.kind === "Generator" ? "algoGen" : "algoSolve"}`}>
          {algorithm.kind}
        </span>
        {pluginMeta?.implementationKind === "alias" && (
          <span className="algoBadge">Alias</span>
        )}
        {pluginMeta?.implementationKind === "hybrid" && (
          <span className="algoBadge">Hybrid</span>
        )}
        <code>{algorithm.id}</code>
      </div>

      <h3>{algorithm.name}</h3>
      <p className="algoSummary">{algorithm.summary}</p>
      {pluginMeta?.implementationKind === "alias" && aliasTargetLabel && (
        <p className="algoSummary">Implements the same runtime as {aliasTargetLabel}.</p>
      )}

      <div className="algoComplexity">
        <span>Time: {algorithm.timeComplexity}</span>
        <span>Space: {algorithm.spaceComplexity}</span>
      </div>

      <section>
        <h4>How It Works</h4>
        <ol>
          {algorithm.howItWorks.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="algoGrid2">
        <div>
          <h4>Pros</h4>
          <ul>
            {algorithm.pros.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Cons</h4>
          <ul>
            {algorithm.cons.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="algoNotes">
        <p>
          <strong>Best use:</strong> {algorithm.bestFor}
        </p>
        <p>
          <strong>Interesting fact:</strong> {algorithm.interestingFact}
        </p>
      </section>
    </article>
  );
}

export default function DocsPage() {
  return (
    <main className="docsPage">
      <header className="docsHero">
        <div>
          <p className="docsEyebrow">Algorithm Field Guide</p>
          <h1>Maze Generation + Solving Documentation</h1>
          <p>
            A practical reference for every algorithm in this visualizer: what it does,
            why it behaves that way, and when to use it.
          </p>
          <div className="docsActions">
            <Link href="/" className="docsBtn docsBtnPrimary">
              Open Visualizer
            </Link>
            <a href="#generators" className="docsBtn docsBtnGhost">
              Jump to Generators
            </a>
            <a href="#solvers" className="docsBtn docsBtnGhost">
              Jump to Solvers
            </a>
          </div>
        </div>

        <div className="docsStats">
          <div>
            <strong>{GENERATOR_DOCS.length}</strong>
            <span>Generators</span>
          </div>
          <div>
            <strong>{SOLVER_DOCS.length}</strong>
            <span>Solvers</span>
          </div>
          <div>
            <strong>{GENERATOR_DOCS.length + SOLVER_DOCS.length}</strong>
            <span>Total Algorithms</span>
          </div>
        </div>
      </header>

      <section className="docsSection" id="generators">
        <div className="docsSectionHead">
          <h2>Generator Algorithms</h2>
          <p>These construct the maze structure by carving passages between cells.</p>
        </div>
        <div className="algoCardGrid">
          {GENERATOR_DOCS.map((algorithm) => (
            <AlgorithmCard key={algorithm.id} algorithm={algorithm} />
          ))}
        </div>
      </section>

      <section className="docsSection" id="solvers">
        <div className="docsSectionHead">
          <h2>Solver Algorithms</h2>
          <p>These navigate an already generated maze from start to goal.</p>
        </div>
        <div className="algoCardGrid">
          {SOLVER_DOCS.map((algorithm) => (
            <AlgorithmCard key={algorithm.id} algorithm={algorithm} />
          ))}
        </div>
      </section>
    </main>
  );
}
