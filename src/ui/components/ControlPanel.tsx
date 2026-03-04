"use client";

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from "react";
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
import {
  GENERATOR_OPTIONS,
  getCompatibleSolverOptions,
  getGeneratorTopology,
} from "@/ui/constants/algorithms";
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
        aria-expanded={open}
        aria-controls={`accordion-${title.replace(/\s+/g, '-').toLowerCase()}`}
      >
        <span className="accordionIcon">{icon}</span>
        <span className="accordionLabel">{title}</span>
        <span className={`accordionChevron ${open ? "chevronOpen" : ""}`}>
          &#x25B8;
        </span>
      </button>
      {open && <div id={`accordion-${title.replace(/\s+/g, '-').toLowerCase()}`} className="accordionBody">{children}</div>}
    </section>
  );
}

interface GroupedOption<TId extends string> {
  id: TId;
  label: string;
  group: "Research Core" | "Advanced" | "Aliases";
}

function groupOptionsByTier<TId extends string>(
  options: GroupedOption<TId>[],
) {
  const groups: Array<{
    label: "Research Core" | "Advanced" | "Aliases";
    options: GroupedOption<TId>[];
  }> = [
      { label: "Research Core", options: [] },
      { label: "Advanced", options: [] },
      { label: "Aliases", options: [] },
    ];

  for (const option of options) {
    const group = groups.find((entry) => entry.label === option.group);
    if (group) {
      group.options.push(option);
    }
  }

  return groups.filter((group) => group.options.length > 0);
}

function normalizeGeneratorParams(
  generatorId: string,
  current: Record<string, number | string | boolean>,
): Record<string, number | string | boolean> {
  const schema =
    GENERATOR_OPTIONS.find((option) => option.id === generatorId)
      ?.generatorParamsSchema ?? [];

  if (schema.length === 0) {
    return {};
  }

  const normalized: Record<string, number | string | boolean> = {};
  for (const param of schema) {
    const currentValue = current[param.key];

    if (param.type === "number") {
      const fallback = param.defaultValue;
      const value =
        typeof currentValue === "number" && Number.isFinite(currentValue)
          ? currentValue
          : fallback;
      normalized[param.key] = Math.max(param.min, Math.min(param.max, value));
      continue;
    }

    if (param.type === "boolean") {
      normalized[param.key] =
        typeof currentValue === "boolean" ? currentValue : param.defaultValue;
      continue;
    }

    normalized[param.key] =
      typeof currentValue === "string" &&
        param.options.some((option) => option.value === currentValue)
        ? currentValue
        : param.defaultValue;
  }

  return normalized;
}

export function ControlPanel({ controls }: ControlPanelProps) {
  const settings = useMazeStore((state) => state.settings);
  const runtime = useMazeStore((state) => state.runtime);
  const ui = useMazeStore((state) => state.ui);

  const setGeneratorId = useMazeStore((state) => state.setGeneratorId);
  const setTopologyFilter = useMazeStore((state) => state.setTopologyFilter);
  const setSolverId = useMazeStore((state) => state.setSolverId);
  const setSolverBId = useMazeStore((state) => state.setSolverBId);
  const setGeneratorParams = useMazeStore((state) => state.setGeneratorParams);
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
  const selectedTopology = getGeneratorTopology(settings.generatorId);
  const selectedGeneratorOption = useMemo(
    () => GENERATOR_OPTIONS.find((option) => option.id === settings.generatorId),
    [settings.generatorId],
  );
  const generatorParamSchema = selectedGeneratorOption?.generatorParamsSchema ?? [];

  const solverOptions = useMemo(
    () => getCompatibleSolverOptions(selectedTopology),
    [selectedTopology],
  );
  const filteredGeneratorOptions = useMemo(() => {
    if (settings.topologyFilter === "all") {
      return GENERATOR_OPTIONS;
    }

    return GENERATOR_OPTIONS.filter(
      (option) => option.topologyOut === settings.topologyFilter,
    );
  }, [settings.topologyFilter]);
  const groupedGeneratorOptions = useMemo(
    () => groupOptionsByTier(filteredGeneratorOptions),
    [filteredGeneratorOptions],
  );
  const groupedSolverOptions = useMemo(
    () => groupOptionsByTier(solverOptions),
    [solverOptions],
  );
  const solverFilterNote = useMemo(() => {
    if (selectedTopology === "perfect-planar") {
      return null;
    }

    if (selectedTopology === "loopy-planar") {
      return "Solver list excludes wall-following solvers because loop-rich mazes can trap local wall rules.";
    }

    return "Solver list excludes geometry-locked wall solvers because weave over/under passages break planar wall assumptions.";
  }, [selectedTopology]);

  const onCheckboxChange =
    (setter: (value: boolean) => void) =>
      (event: ChangeEvent<HTMLInputElement>) => {
        setter(event.currentTarget.checked);
      };

  const updateGeneratorParam = useCallback(
    (key: string, value: number | string | boolean) => {
      setGeneratorParams({
        ...settings.generatorParams,
        [key]: value,
      });
    },
    [setGeneratorParams, settings.generatorParams],
  );

  const pickDifferentSolver = useCallback(
    (excludedId: string, options = solverOptions): string | undefined =>
      options.find((option) => option.id !== excludedId)?.id,
    [solverOptions],
  );

  const onGeneratorChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextGeneratorId = event.currentTarget.value as typeof settings.generatorId;
    setGeneratorId(nextGeneratorId);
    setGeneratorParams(
      normalizeGeneratorParams(nextGeneratorId, settings.generatorParams),
    );
  };

  useEffect(() => {
    const visibleGeneratorIds = new Set(
      filteredGeneratorOptions.map((option) => option.id),
    );

    if (filteredGeneratorOptions.length === 0) {
      return;
    }

    if (!visibleGeneratorIds.has(settings.generatorId)) {
      const fallbackGenerator = filteredGeneratorOptions[0]?.id;
      if (fallbackGenerator) {
        setGeneratorId(fallbackGenerator);
        setGeneratorParams(
          normalizeGeneratorParams(fallbackGenerator, settings.generatorParams),
        );
      }
    }
  }, [
    filteredGeneratorOptions,
    setGeneratorId,
    setGeneratorParams,
    settings.generatorId,
    settings.generatorParams,
  ]);

  useEffect(() => {
    const normalized = normalizeGeneratorParams(
      settings.generatorId,
      settings.generatorParams,
    );
    const currentKeys = Object.keys(settings.generatorParams);
    const normalizedKeys = Object.keys(normalized);

    if (
      currentKeys.length === normalizedKeys.length &&
      currentKeys.every((key) => normalized[key] === settings.generatorParams[key])
    ) {
      return;
    }

    setGeneratorParams(normalized);
  }, [
    setGeneratorParams,
    settings.generatorId,
    settings.generatorParams,
  ]);

  useEffect(() => {
    const compatibleIds = new Set(solverOptions.map((option) => option.id));
    if (solverOptions.length === 0) {
      return;
    }

    if (!compatibleIds.has(settings.solverId)) {
      const fallbackSolverA = solverOptions[0]?.id;
      if (fallbackSolverA) {
        setSolverId(fallbackSolverA);
      }
    }

    if (settings.battleMode && !compatibleIds.has(settings.solverBId)) {
      const fallbackSolverB =
        pickDifferentSolver(settings.solverId, solverOptions) ??
        solverOptions[0]?.id;
      if (fallbackSolverB) {
        setSolverBId(fallbackSolverB);
      }
    }

    if (
      settings.battleMode &&
      settings.solverBId === settings.solverId &&
      solverOptions.length > 1
    ) {
      const fallbackSolverB = pickDifferentSolver(settings.solverId, solverOptions);
      if (fallbackSolverB) {
        setSolverBId(fallbackSolverB);
      }
    }
  }, [
    pickDifferentSolver,
    setSolverBId,
    setSolverId,
    settings.battleMode,
    settings.solverBId,
    settings.solverId,
    solverOptions,
  ]);

  const onBattleModeChange = (event: ChangeEvent<HTMLInputElement>) => {
    const enabled = event.currentTarget.checked;
    setBattleMode(enabled);

    if (!enabled || settings.solverBId !== settings.solverId) {
      return;
    }

    const fallback = pickDifferentSolver(settings.solverId, solverOptions);

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
        <div className="field">
          <span className="fieldLabel">Topology</span>
          <div className="presetRow">
            {([
              { value: "all", label: "All" },
              { value: "perfect-planar", label: "Perfect" },
              { value: "loopy-planar", label: "Loopy" },
              { value: "weave", label: "Weave" },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                className={`presetBtn ${settings.topologyFilter === option.value ? "presetBtnActive" : ""}`}
                onClick={() => setTopologyFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="fieldLabel">Generator</span>
          <select
            value={settings.generatorId}
            onChange={onGeneratorChange}
          >
            {groupedGeneratorOptions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {generatorParamSchema.map((param) => {
          if (param.type === "number") {
            const value =
              typeof settings.generatorParams[param.key] === "number"
                ? (settings.generatorParams[param.key] as number)
                : param.defaultValue;
            return (
              <div key={param.key} className="sliderField">
                <div className="sliderHeader">
                  <span>{param.label}</span>
                  <span className="sliderValue">{value}</span>
                </div>
                <div className="sliderRow">
                  <input
                    type="range"
                    min={param.min}
                    max={param.max}
                    step={param.step ?? 1}
                    value={value}
                    onChange={(event) =>
                      updateGeneratorParam(param.key, Number(event.currentTarget.value))
                    }
                  />
                  <input
                    className="sliderNumber"
                    type="number"
                    min={param.min}
                    max={param.max}
                    step={param.step ?? 1}
                    value={value}
                    onChange={(event) =>
                      updateGeneratorParam(param.key, Number(event.currentTarget.value))
                    }
                  />
                </div>
                {param.description && <p className="fieldHint">{param.description}</p>}
              </div>
            );
          }

          if (param.type === "boolean") {
            const value =
              typeof settings.generatorParams[param.key] === "boolean"
                ? (settings.generatorParams[param.key] as boolean)
                : param.defaultValue;
            return (
              <label key={param.key} className="toggleRow">
                <input
                  type="checkbox"
                  checked={value}
                  onChange={(event) =>
                    updateGeneratorParam(param.key, event.currentTarget.checked)
                  }
                />
                <span>{param.label}</span>
              </label>
            );
          }

          const value =
            typeof settings.generatorParams[param.key] === "string"
              ? (settings.generatorParams[param.key] as string)
              : param.defaultValue;
          return (
            <label key={param.key} className="field">
              <span className="fieldLabel">{param.label}</span>
              <select
                value={value}
                onChange={(event) => updateGeneratorParam(param.key, event.currentTarget.value)}
              >
                {param.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        {selectedTopology === "loopy-planar" &&
          generatorParamSchema.some((param) => param.key === "loopDensity") && (
            <div className="presetRow">
              <button
                type="button"
                className="presetBtn"
                onClick={() => updateGeneratorParam("loopDensity", 20)}
              >
                Sparse 20
              </button>
              <button
                type="button"
                className="presetBtn"
                onClick={() => updateGeneratorParam("loopDensity", 35)}
              >
                Balanced 35
              </button>
              <button
                type="button"
                className="presetBtn"
                onClick={() => updateGeneratorParam("loopDensity", 60)}
              >
                Dense 60
              </button>
            </div>
          )}
        <label className="field">
          <span className="fieldLabel">Solver</span>
          <select value={settings.solverId} onChange={onSolverAChange}>
            {groupedSolverOptions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        {solverFilterNote && <p className="fieldHint">{solverFilterNote}</p>}
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
            {groupedSolverOptions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </optgroup>
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
