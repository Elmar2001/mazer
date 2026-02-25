"use client";

import type { ChangeEvent } from "react";
import Link from "next/link";

import { SPEED_MAX, SPEED_MIN } from "@/config/limits";
import type { MazeControls } from "@/ui/hooks/useMazeEngine";
import { GENERATOR_OPTIONS, SOLVER_OPTIONS } from "@/ui/constants/algorithms";
import { useMazeStore } from "@/ui/store/mazeStore";

interface ControlPanelProps {
  controls: MazeControls;
}

export function ControlPanel({ controls }: ControlPanelProps) {
  const settings = useMazeStore((state) => state.settings);
  const runtime = useMazeStore((state) => state.runtime);

  const setGeneratorId = useMazeStore((state) => state.setGeneratorId);
  const setSolverId = useMazeStore((state) => state.setSolverId);
  const setSolverBId = useMazeStore((state) => state.setSolverBId);
  const setBattleMode = useMazeStore((state) => state.setBattleMode);
  const setSpeed = useMazeStore((state) => state.setSpeed);
  const setGridWidth = useMazeStore((state) => state.setGridWidth);
  const setGridHeight = useMazeStore((state) => state.setGridHeight);
  const setCellSize = useMazeStore((state) => state.setCellSize);
  const setSeed = useMazeStore((state) => state.setSeed);
  const setShowVisited = useMazeStore((state) => state.setShowVisited);
  const setShowFrontier = useMazeStore((state) => state.setShowFrontier);
  const setShowPath = useMazeStore((state) => state.setShowPath);

  const canSolve = runtime.phase === "Generated" || runtime.phase === "Solved";
  const canPlaybackControl =
    runtime.phase === "Generating" || runtime.phase === "Solving";

  const onCheckboxChange =
    (setter: (value: boolean) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.currentTarget.checked);
    };

  const onBattleModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const enabled = event.currentTarget.checked;
    setBattleMode(enabled);

    if (!enabled || settings.solverBId !== settings.solverId) {
      return;
    }

    const fallback = SOLVER_OPTIONS.find(
      (option) => option.id !== settings.solverId,
    )?.id;

    if (fallback) {
      setSolverBId(fallback);
    }
  };

  return (
    <section className="controlPanel">
      <div className="panelTop">
        <div>
          <h1>Mazer</h1>
          <p className="subtitle">Deterministic canvas maze lab.</p>
        </div>
        <Link href="/docs" className="docsLink">
          Docs
        </Link>
      </div>

      <div className="panelTopMeta">
        <span className={`statusPill status${runtime.phase}`}>{runtime.phase}</span>
        <span className={`statusPill ${runtime.paused ? "statusPaused" : "statusRunning"}`}>
          {runtime.paused ? "Paused" : "Running"}
        </span>
        {settings.battleMode ? <span className="modePill">Battle Mode</span> : null}
      </div>

      <section className="controlGroup">
        <h4>Algorithms</h4>
        <label>
          Generator
          <select
            value={settings.generatorId}
            onChange={(event) => setGeneratorId(event.currentTarget.value as typeof settings.generatorId)}
          >
            {GENERATOR_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Solver A
          <select
            value={settings.solverId}
            onChange={(event) => setSolverId(event.currentTarget.value as typeof settings.solverId)}
          >
            {SOLVER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Seed
          <input
            type="text"
            value={settings.seed}
            onChange={(event) => setSeed(event.currentTarget.value)}
          />
        </label>
      </section>

      <fieldset className="controlGroup">
        <legend>Battle Setup</legend>
        <label className="toggleRow">
          <input
            type="checkbox"
            checked={settings.battleMode}
            onChange={onBattleModeChange}
          />
          Compare two solvers side by side
        </label>
        <label>
          Solver B
          <select
            value={settings.solverBId}
            onChange={(event) =>
              setSolverBId(event.currentTarget.value as typeof settings.solverBId)
            }
            disabled={!settings.battleMode}
          >
            {SOLVER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {settings.battleMode ? (
          <div className="battleLegend">
            <span className="legendItem">
              <i className="legendSwatch legendSwatchA" />
              Solver A overlays
            </span>
            <span className="legendItem">
              <i className="legendSwatch legendSwatchB" />
              Solver B overlays
            </span>
          </div>
        ) : null}
      </fieldset>

      <section className="controlGroup">
        <h4>Grid + Speed</h4>
        <div className="sliderField">
          <div>
            <span>Speed</span>
            <strong>{settings.speed} steps/s</strong>
          </div>
          <input
            type="range"
            min={SPEED_MIN}
            max={SPEED_MAX}
            value={settings.speed}
            onChange={(event) => setSpeed(Number(event.currentTarget.value))}
          />
        </div>
        <div className="sliderField">
          <div>
            <span>Grid Width</span>
            <strong>{settings.gridWidth}</strong>
          </div>
          <input
            type="range"
            min={10}
            max={120}
            value={settings.gridWidth}
            onChange={(event) => setGridWidth(Number(event.currentTarget.value))}
          />
        </div>
        <div className="sliderField">
          <div>
            <span>Grid Height</span>
            <strong>{settings.gridHeight}</strong>
          </div>
          <input
            type="range"
            min={10}
            max={120}
            value={settings.gridHeight}
            onChange={(event) => setGridHeight(Number(event.currentTarget.value))}
          />
        </div>
        <div className="sliderField">
          <div>
            <span>Cell Size</span>
            <strong>{settings.cellSize}px</strong>
          </div>
          <input
            type="range"
            min={8}
            max={32}
            value={settings.cellSize}
            onChange={(event) => setCellSize(Number(event.currentTarget.value))}
          />
        </div>
      </section>

      <fieldset className="controlGroup">
        <legend>Overlays</legend>
        <label className="toggleRow">
          <input
            type="checkbox"
            checked={settings.showVisited}
            onChange={onCheckboxChange(setShowVisited)}
          />
          Show visited
        </label>
        <label className="toggleRow">
          <input
            type="checkbox"
            checked={settings.showFrontier}
            onChange={onCheckboxChange(setShowFrontier)}
          />
          Show frontier
        </label>
        <label className="toggleRow">
          <input
            type="checkbox"
            checked={settings.showPath}
            onChange={onCheckboxChange(setShowPath)}
          />
          Show final path
        </label>
      </fieldset>

      <div className="buttonGrid">
        <button type="button" className="btnPrimary" onClick={controls.generate}>
          Generate
        </button>
        <button
          type="button"
          className="btnAccent"
          onClick={controls.solve}
          disabled={!canSolve}
        >
          Solve
        </button>
        <button
          type="button"
          className="btnGhost"
          onClick={controls.pauseResume}
          disabled={!canPlaybackControl}
        >
          {runtime.paused ? "Resume" : "Pause"}
        </button>
        <button
          type="button"
          className="btnGhost"
          onClick={controls.stepOnce}
          disabled={!canPlaybackControl}
        >
          Step Once
        </button>
        <button type="button" className="btnDanger" onClick={controls.reset}>
          Reset
        </button>
      </div>
    </section>
  );
}
