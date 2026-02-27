"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";

import {
  CELL_MIN,
  GRID_MIN,
  SPEED_MAX,
  SPEED_MIN,
  getCellSizeMax,
  getGridHeightMax,
  getGridWidthMax,
} from "@/config/limits";
import type { MazeControls } from "@/ui/hooks/useMazeEngine";
import { GENERATOR_OPTIONS, SOLVER_OPTIONS } from "@/ui/constants/algorithms";
import { useMazeStore } from "@/ui/store/mazeStore";
import { MazeConfigPanel } from "@/ui/components/MazeConfigPanel";

interface ControlPanelProps {
  controls: MazeControls;
}

function AccordionSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`accordionSection ${open ? "accordionOpen" : ""}`}>
      <button
        type="button"
        className="accordionTrigger"
        onClick={() => setOpen(!open)}
      >
        <span className="accordionIcon">{icon}</span>
        <span className="accordionLabel">{title}</span>
        <span className={`accordionChevron ${open ? "chevronOpen" : ""}`}>
          &#x25B8;
        </span>
      </button>
      {open && <div className="accordionBody">{children}</div>}
    </section>
  );
}

export function ControlPanel({ controls }: ControlPanelProps) {
  const settings = useMazeStore((state) => state.settings);
  const runtime = useMazeStore((state) => state.runtime);
  const ui = useMazeStore((state) => state.ui);

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
  const toggleSidebar = useMazeStore((state) => state.toggleSidebar);
  const toggleMetricsHud = useMazeStore((state) => state.toggleMetricsHud);
  const toggleTraceHud = useMazeStore((state) => state.toggleTraceHud);

  const [colorPopupOpen, setColorPopupOpen] = useState(false);

  const canSolve = runtime.phase === "Generated" || runtime.phase === "Solved";
  const canPlaybackControl =
    runtime.phase === "Generating" || runtime.phase === "Solving";
  const gridWidthMax = getGridWidthMax(settings.gridHeight, settings.cellSize);
  const gridHeightMax = getGridHeightMax(settings.gridWidth, settings.cellSize);
  const cellSizeMax = getCellSizeMax(settings.gridWidth, settings.gridHeight);

  const onCheckboxChange =
    (setter: (value: boolean) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(event.currentTarget.checked);
    };

  const pickDifferentSolver = (excludedId: string): string | undefined =>
    SOLVER_OPTIONS.find((option) => option.id !== excludedId)?.id;

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

  const onSolverAChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSolverId = event.currentTarget.value as typeof settings.solverId;
    setSolverId(nextSolverId);

    if (!settings.battleMode || settings.solverBId !== nextSolverId) {
      return;
    }

    const fallback = pickDifferentSolver(nextSolverId);
    if (fallback) {
      setSolverBId(fallback as typeof settings.solverBId);
    }
  };

  const onSolverBChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextSolverBId = event.currentTarget.value as typeof settings.solverBId;
    if (!settings.battleMode || nextSolverBId !== settings.solverId) {
      setSolverBId(nextSolverBId);
      return;
    }

    const fallback = pickDifferentSolver(settings.solverId);
    if (fallback) {
      setSolverBId(fallback as typeof settings.solverBId);
    }
  };

  const onNumberChange =
    (setter: (value: number) => void) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      setter(Number(event.currentTarget.value));
    };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }

      const key = event.key.toLowerCase();
      if (key === "g") {
        controls.generate();
        return;
      }

      if (key === "s" && canSolve) {
        controls.solve();
        return;
      }

      if (key === "r") {
        controls.reset();
        return;
      }

      if (key === "n" && canPlaybackControl) {
        controls.stepOnce();
        return;
      }

      if (event.key === " " && canPlaybackControl) {
        event.preventDefault();
        controls.pauseResume();
        return;
      }

      if (key === "m") {
        toggleMetricsHud();
        return;
      }

      if (key === "t") {
        toggleTraceHud();
        return;
      }

      if (key === "[") {
        toggleSidebar();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [canPlaybackControl, canSolve, controls, toggleMetricsHud, toggleTraceHud, toggleSidebar]);

  if (ui.sidebarCollapsed) {
    return (
      <section className="controlPanel controlPanelCollapsed">
        <button type="button" className="iconRailBtn" onClick={toggleSidebar} title="Expand sidebar">
          &#x25B6;
        </button>
        <div className="iconRailDivider" />
        <button type="button" className="iconRailBtn iconRailPrimary" onClick={controls.generate} title="Generate (G)">
          &#x25B6;
        </button>
        <button type="button" className="iconRailBtn iconRailAccent" onClick={controls.solve} disabled={!canSolve} title="Solve (S)">
          &#x26A1;
        </button>
        <button type="button" className="iconRailBtn" onClick={controls.pauseResume} disabled={!canPlaybackControl} title="Pause/Resume">
          {runtime.paused ? "\u23F5" : "\u23F8"}
        </button>
        <button type="button" className="iconRailBtn" onClick={controls.stepOnce} disabled={!canPlaybackControl} title="Step (N)">
          &#x23ED;
        </button>
        <button type="button" className="iconRailBtn iconRailDanger" onClick={controls.reset} title="Reset (R)">
          &#x21BB;
        </button>
        <div className="iconRailDivider" />
        <button type="button" className={`iconRailBtn ${ui.showMetricsHud ? "iconRailActive" : ""}`} onClick={toggleMetricsHud} title="Toggle Metrics (M)">
          M
        </button>
        <button type="button" className={`iconRailBtn ${ui.showTraceHud ? "iconRailActive" : ""}`} onClick={toggleTraceHud} title="Toggle Trace (T)">
          T
        </button>
        <div className="iconRailSpacer" />
        <button type="button" className="iconRailBtn" onClick={() => setColorPopupOpen(true)} title="Maze Config">
          &#x2699;
        </button>
        <Link href="/docs" className="iconRailBtn" title="Documentation">
          ?
        </Link>
        {colorPopupOpen && <MazeConfigPanel onClose={() => setColorPopupOpen(false)} />}
      </section>
    );
  }

  return (
    <section className="controlPanel">
      <div className="sidebarHeader">
        <div className="sidebarBrand">
          <h1>Mazer</h1>
          <div className="sidebarPills">
            <span className={`pill phase${runtime.phase}`}>{runtime.phase}</span>
            <span className={`pill ${runtime.paused ? "pillMuted" : "pillLive"}`}>
              {runtime.paused ? "Idle" : "Live"}
            </span>
            {settings.battleMode && <span className="pill pillBattle">VS</span>}
          </div>
        </div>
        <div className="sidebarActions">
          <Link href="/docs" className="sidebarIconBtn" title="Documentation">?</Link>
          <button type="button" className="sidebarIconBtn" onClick={toggleSidebar} title="Collapse sidebar ([)">
            &#x25C0;
          </button>
        </div>
      </div>

      <AccordionSection title="Algorithms" icon="&#x2699;" defaultOpen>
        <label className="field">
          <span className="fieldLabel">Generator</span>
          <select
            value={settings.generatorId}
            onChange={(event) => setGeneratorId(event.currentTarget.value as typeof settings.generatorId)}
          >
            {GENERATOR_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="fieldLabel">Solver</span>
          <select value={settings.solverId} onChange={onSolverAChange}>
            {SOLVER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="fieldLabel">Seed</span>
          <input
            type="text"
            value={settings.seed}
            onChange={(event) => setSeed(event.currentTarget.value)}
          />
        </label>
      </AccordionSection>

      <AccordionSection title="Battle Mode" icon="&#x2694;" defaultOpen={false}>
        <label className="toggleRow">
          <input
            type="checkbox"
            checked={settings.battleMode}
            onChange={onBattleModeChange}
          />
          <span>Compare two solvers</span>
        </label>
        <label className="field">
          <span className="fieldLabel">Solver B</span>
          <select
            value={settings.solverBId}
            onChange={onSolverBChange}
            disabled={!settings.battleMode}
          >
            {SOLVER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </label>
        {settings.battleMode && (
          <div className="battleLegend">
            <span className="legendItem">
              <i className="legendSwatch legendSwatchA" /> Solver A
            </span>
            <span className="legendItem">
              <i className="legendSwatch legendSwatchB" /> Solver B
            </span>
          </div>
        )}
      </AccordionSection>

      <AccordionSection title="Grid & Speed" icon="&#x2630;" defaultOpen>
        <div className="sliderField">
          <div className="sliderHeader">
            <span>Speed</span>
            <span className="sliderValue">{settings.speed} sps</span>
          </div>
          <div className="sliderRow">
            <input type="range" min={SPEED_MIN} max={SPEED_MAX} value={settings.speed} onChange={(e) => setSpeed(Number(e.currentTarget.value))} />
            <input className="sliderNumber" type="number" min={SPEED_MIN} max={SPEED_MAX} value={settings.speed} onChange={onNumberChange(setSpeed)} />
          </div>
        </div>
        <div className="sliderField">
          <div className="sliderHeader">
            <span>Width</span>
            <span className="sliderValue">{settings.gridWidth}</span>
          </div>
          <div className="sliderRow">
            <input type="range" min={GRID_MIN} max={gridWidthMax} value={settings.gridWidth} onChange={(e) => setGridWidth(Number(e.currentTarget.value))} />
            <input className="sliderNumber" type="number" min={GRID_MIN} max={gridWidthMax} value={settings.gridWidth} onChange={onNumberChange(setGridWidth)} />
          </div>
        </div>
        <div className="sliderField">
          <div className="sliderHeader">
            <span>Height</span>
            <span className="sliderValue">{settings.gridHeight}</span>
          </div>
          <div className="sliderRow">
            <input type="range" min={GRID_MIN} max={gridHeightMax} value={settings.gridHeight} onChange={(e) => setGridHeight(Number(e.currentTarget.value))} />
            <input className="sliderNumber" type="number" min={GRID_MIN} max={gridHeightMax} value={settings.gridHeight} onChange={onNumberChange(setGridHeight)} />
          </div>
        </div>
        <div className="sliderField">
          <div className="sliderHeader">
            <span>Cell Size</span>
            <span className="sliderValue">{settings.cellSize}px</span>
          </div>
          <div className="sliderRow">
            <input type="range" min={CELL_MIN} max={cellSizeMax} value={settings.cellSize} onChange={(e) => setCellSize(Number(e.currentTarget.value))} />
            <input className="sliderNumber" type="number" min={CELL_MIN} max={cellSizeMax} value={settings.cellSize} onChange={onNumberChange(setCellSize)} />
          </div>
        </div>
        <div className="presetRow">
          <button type="button" className="presetBtn" onClick={() => { setGridWidth(25); setGridHeight(15); setCellSize(20); }}>Compact</button>
          <button type="button" className="presetBtn" onClick={() => { setGridWidth(40); setGridHeight(25); setCellSize(16); }}>Default</button>
          <button type="button" className="presetBtn" onClick={() => { setGridWidth(72); setGridHeight(42); setCellSize(10); }}>Dense</button>
          <button type="button" className="presetBtn" onClick={() => setSpeed(Math.min(SPEED_MAX, 4_000))}>Fast</button>
        </div>
      </AccordionSection>

      <AccordionSection title="Display" icon="&#x25C9;" defaultOpen={false}>
        <label className="toggleRow">
          <input type="checkbox" checked={settings.showVisited} onChange={onCheckboxChange(setShowVisited)} />
          <span>Visited cells</span>
        </label>
        <label className="toggleRow">
          <input type="checkbox" checked={settings.showFrontier} onChange={onCheckboxChange(setShowFrontier)} />
          <span>Frontier</span>
        </label>
        <label className="toggleRow">
          <input type="checkbox" checked={settings.showPath} onChange={onCheckboxChange(setShowPath)} />
          <span>Final path</span>
        </label>
        <div className="hudToggles">
          <label className="toggleRow">
            <input type="checkbox" checked={ui.showMetricsHud} onChange={() => toggleMetricsHud()} />
            <span>Metrics HUD</span>
          </label>
          <label className="toggleRow">
            <input type="checkbox" checked={ui.showTraceHud} onChange={() => toggleTraceHud()} />
            <span>Trace HUD</span>
          </label>
        </div>
      </AccordionSection>

      <div className="sidebarFooter">
        <button type="button" className="csGearBtn" onClick={() => setColorPopupOpen(true)} title="Maze Config">
          &#x2699; Maze Config
        </button>
        <p className="shortcutHint">G generate  S solve  Space pause  N step  R reset  [ sidebar  M metrics  T trace</p>
      </div>
      {colorPopupOpen && <MazeConfigPanel onClose={() => setColorPopupOpen(false)} />}
    </section>
  );
}
