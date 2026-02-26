"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

import {
  COLOR_PRESETS,
  DEFAULT_COLOR_THEME,
  randomizeTheme,
  type ColorTheme,
} from "@/render/colorPresets";
import { useMazeStore } from "@/ui/store/mazeStore";

interface MazeConfigPanelProps {
  onClose: () => void;
}

function rgbaToHexAlpha(rgba: string): { hex: string; alpha: number } {
  const match = rgba.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/,
  );
  if (match) {
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    const a = match[4] !== undefined ? Number(match[4]) : 1;
    const hex = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
    return { hex, alpha: a };
  }

  if (rgba.startsWith("#")) {
    return { hex: rgba.length >= 7 ? rgba.slice(0, 7) : rgba, alpha: 1 };
  }

  return { hex: "#000000", alpha: 1 };
}

function hexAlphaToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  if (alpha >= 1) {
    return hex;
  }
  return `rgba(${r}, ${g}, ${b}, ${parseFloat(alpha.toFixed(2))})`;
}

const COLOR_GROUPS: {
  label: string;
  keys: { key: keyof ColorTheme; label: string; hasAlpha: boolean }[];
}[] = [
  {
    label: "Grid",
    keys: [
      { key: "background", label: "Background", hasAlpha: false },
      { key: "cellA", label: "Cell A", hasAlpha: false },
      { key: "cellB", label: "Cell B", hasAlpha: false },
      { key: "cellInset", label: "Cell Inset", hasAlpha: true },
      { key: "wallShadow", label: "Wall Shadow", hasAlpha: false },
      { key: "wall", label: "Wall", hasAlpha: false },
    ],
  },
  {
    label: "Overlays",
    keys: [
      { key: "visitedA", label: "Visited A", hasAlpha: true },
      { key: "visitedB", label: "Visited B", hasAlpha: true },
      { key: "frontierA", label: "Frontier A", hasAlpha: true },
      { key: "frontierB", label: "Frontier B", hasAlpha: true },
      { key: "currentRingA", label: "Current A", hasAlpha: true },
      { key: "currentRingB", label: "Current B", hasAlpha: true },
    ],
  },
  {
    label: "Paths",
    keys: [
      { key: "pathA", label: "Path A", hasAlpha: true },
      { key: "pathB", label: "Path B", hasAlpha: true },
    ],
  },
  {
    label: "Endpoints",
    keys: [
      { key: "start", label: "Start", hasAlpha: false },
      { key: "goal", label: "Goal", hasAlpha: false },
      { key: "endpointStroke", label: "Stroke", hasAlpha: true },
    ],
  },
];

export function MazeConfigPanel({ onClose }: MazeConfigPanelProps) {
  const colorTheme = useMazeStore((s) => s.settings.colorTheme);
  const wallThickness = useMazeStore((s) => s.settings.wallThickness);
  const showWallShadow = useMazeStore((s) => s.settings.showWallShadow);
  const showCellInset = useMazeStore((s) => s.settings.showCellInset);
  const setColorTheme = useMazeStore((s) => s.setColorTheme);
  const setColorProperty = useMazeStore((s) => s.setColorProperty);
  const setWallThickness = useMazeStore((s) => s.setWallThickness);
  const setShowWallShadow = useMazeStore((s) => s.setShowWallShadow);
  const setShowCellInset = useMazeStore((s) => s.setShowCellInset);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const id = setTimeout(() => {
      window.addEventListener("mousedown", onClick);
    }, 50);
    return () => {
      clearTimeout(id);
      window.removeEventListener("mousedown", onClick);
    };
  }, [onClose]);

  const handlePreset = useCallback(
    (name: string) => {
      const preset = COLOR_PRESETS[name];
      if (preset) {
        setColorTheme(preset);
      }
    },
    [setColorTheme],
  );

  const handleRandomize = useCallback(() => {
    setColorTheme(randomizeTheme());
  }, [setColorTheme]);

  const handleReset = useCallback(() => {
    setColorTheme({ ...DEFAULT_COLOR_THEME });
  }, [setColorTheme]);

  const handleColorChange = useCallback(
    (key: keyof ColorTheme, hex: string, hasAlpha: boolean) => {
      if (!hasAlpha) {
        setColorProperty(key, hex);
        return;
      }
      const current = rgbaToHexAlpha(colorTheme[key]);
      setColorProperty(key, hexAlphaToRgba(hex, current.alpha));
    },
    [colorTheme, setColorProperty],
  );

  const handleAlphaChange = useCallback(
    (key: keyof ColorTheme, alpha: number) => {
      const current = rgbaToHexAlpha(colorTheme[key]);
      setColorProperty(key, hexAlphaToRgba(current.hex, alpha));
    },
    [colorTheme, setColorProperty],
  );

  const thicknessPercent = Math.round(wallThickness * 100);

  const content = (
    <div className="csPanel" ref={panelRef}>
      <div className="csPanelHeader">
        <h3>Maze Config</h3>
        <button type="button" className="csCloseBtn" onClick={onClose}>
          &#x2715;
        </button>
      </div>

      <div className="csPanelBody">
        {/* ── Rendering section ── */}
        <div className="csGroup">
          <h4 className="csGroupLabel">Rendering</h4>
          <div className="csRenderRows">
            <div className="csRenderRow">
              <span className="csRenderLabel">Wall Thickness</span>
              <div className="csAlphaWrap">
                <input
                  type="range"
                  min={2}
                  max={30}
                  value={thicknessPercent}
                  onChange={(e) => setWallThickness(Number(e.currentTarget.value) / 100)}
                  className="csAlphaSlider"
                />
                <span className="csAlphaValue">{thicknessPercent}%</span>
              </div>
            </div>
            <label className="csToggleRow">
              <input
                type="checkbox"
                checked={showWallShadow}
                onChange={(e) => setShowWallShadow(e.currentTarget.checked)}
              />
              <span>Wall shadow</span>
            </label>
            <label className="csToggleRow">
              <input
                type="checkbox"
                checked={showCellInset}
                onChange={(e) => setShowCellInset(e.currentTarget.checked)}
              />
              <span>Cell inset</span>
            </label>
          </div>
        </div>

        {/* ── Presets section ── */}
        <div className="csGroup">
          <h4 className="csGroupLabel">Theme Presets</h4>
          <div className="csPresets">
            {Object.keys(COLOR_PRESETS).map((name) => (
              <button
                key={name}
                type="button"
                className="csPresetBtn"
                onClick={() => handlePreset(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="csActions">
            <button type="button" className="csActionBtn" onClick={handleRandomize}>
              Randomize
            </button>
            <button type="button" className="csActionBtn csActionReset" onClick={handleReset}>
              Reset
            </button>
          </div>
        </div>

        {/* ── Color groups ── */}
        <div className="csGroups">
          {COLOR_GROUPS.map((group) => (
            <div key={group.label} className="csGroup">
              <h4 className="csGroupLabel">{group.label}</h4>
              <div className="csColorRows">
                {group.keys.map(({ key, label, hasAlpha }) => {
                  const parsed = rgbaToHexAlpha(colorTheme[key]);
                  return (
                    <div key={key} className="csColorRow">
                      <label className="csSwatchWrap">
                        <input
                          type="color"
                          value={parsed.hex}
                          onChange={(e) =>
                            handleColorChange(key, e.currentTarget.value, hasAlpha)
                          }
                          className="csColorInput"
                        />
                        <span
                          className="csSwatchPreview"
                          style={{ background: colorTheme[key] }}
                        />
                      </label>
                      <span className="csColorLabel">{label}</span>
                      {hasAlpha && (
                        <div className="csAlphaWrap">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={Math.round(parsed.alpha * 100)}
                            onChange={(e) =>
                              handleAlphaChange(key, Number(e.currentTarget.value) / 100)
                            }
                            className="csAlphaSlider"
                          />
                          <span className="csAlphaValue">
                            {Math.round(parsed.alpha * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
