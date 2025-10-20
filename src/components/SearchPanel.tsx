"use client";

import { useMemo, useState } from "react";
import type { SupportedLanguage } from "@/lib/wiki";
import {
  CUSTOM_FONT_PRESET_ID,
  DEFAULT_STAGE_PREFERENCES,
  FONT_PRESETS,
  MIN_CENTERED_ZOOM,
  MAX_CENTERED_ZOOM,
  clampSpeedMultiplier,
  clampCenteredZoom,
  cloneStagePreferences,
  getFontPreset,
} from "@/lib/settings";
import type {
  StagePlaybackMode,
  StagePreferences,
  StagePhaseToggles,
} from "@/lib/settings";

export interface SearchPayload {
  topic: string;
  keywords: string;
  language: SupportedLanguage;
  highlightColor: string;
  maxMatches: number;
  stagePreferences: StagePreferences;
}

interface SearchPanelProps {
  defaultPayload?: Partial<SearchPayload>;
  isBusy: boolean;
  onSubmit(payload: SearchPayload): void;
}

const MIN_SPEED = 0.25;
const MAX_SPEED = 4;
const SPEED_STEP = 0.01;
const CENTERED_ZOOM_STEP = 0.01;

const SPEED_PRESETS: Array<{ label: string; value: number }> = [
  { label: "0.35×", value: 0.35 },
  { label: "0.5×", value: 0.5 },
  { label: "0.75×", value: 0.75 },
  { label: "1×", value: 1 },
  { label: "1.25×", value: 1.25 },
  { label: "1.5×", value: 1.5 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
];

const CENTERED_ZOOM_PRESETS: Array<{ label: string; value: number }> = [
  { label: "1.0×", value: 1 },
  { label: "1.15×", value: 1.15 },
  { label: "1.3×", value: 1.3 },
  { label: "1.5×", value: 1.5 },
  { label: "1.7×", value: 1.7 },
  { label: "1.9×", value: 1.9 },
  { label: "2.1×", value: 2.1 },
];

const createDefaultPayload = (): SearchPayload => ({
  topic: "",
  keywords: "",
  language: "en",
  highlightColor: "#facc15",
  maxMatches: 25,
  stagePreferences: cloneStagePreferences(),
});

export default function SearchPanel({
  defaultPayload,
  isBusy,
  onSubmit,
}: SearchPanelProps) {
  const [form, setForm] = useState<SearchPayload>(() => {
    const base = createDefaultPayload();

    if (!defaultPayload) {
      return base;
    }

    return {
      ...base,
      ...defaultPayload,
      stagePreferences: cloneStagePreferences(
        defaultPayload.stagePreferences ?? DEFAULT_STAGE_PREFERENCES
      ),
    };
  });

  const selectedFontPreset = useMemo(
    () => getFontPreset(form.stagePreferences.fontPreset),
    [form.stagePreferences.fontPreset]
  );

  function handleChange<K extends keyof SearchPayload>(
    key: K,
    value: SearchPayload[K]
  ) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  function updateStagePreferences(
    updater: (prev: StagePreferences) => StagePreferences
  ) {
    setForm((prev) => ({
      ...prev,
      stagePreferences: updater(prev.stagePreferences),
    }));
  }

  function updateStagePhase<K extends keyof StagePhaseToggles>(
    key: K,
    value: StagePhaseToggles[K]
  ) {
    updateStagePreferences((prev) => ({
      ...prev,
      phases: {
        ...prev.phases,
        [key]: value,
      },
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload: SearchPayload = {
      ...form,
      stagePreferences: cloneStagePreferences(form.stagePreferences),
    };

    payload.topic = payload.topic.trim();
    payload.keywords = payload.keywords.trim();
    payload.maxMatches = Math.max(1, Math.min(200, payload.maxMatches));
    payload.stagePreferences.speedMultiplier = clampSpeedMultiplier(
      payload.stagePreferences.speedMultiplier
    );
    payload.stagePreferences.customFontFamily =
      payload.stagePreferences.customFontFamily.trim();
    payload.stagePreferences.customFontUrl =
      payload.stagePreferences.customFontUrl.trim();
    payload.stagePreferences.centeredZoomScale = clampCenteredZoom(
      payload.stagePreferences.centeredZoomScale
    );

    onSubmit(payload);
  }

  return (
    <form className="panel" onSubmit={handleSubmit}>
      <div className="panel-grid">
        <label className="field">
          <span>Topic (optional)</span>
          <input
            placeholder="Leave blank to auto-detect from keywords"
            value={form.topic}
            onChange={(event) => handleChange("topic", event.target.value)}
          />
          <span className="field-hint">
            The app will try your keywords as backup search terms when this is empty.
          </span>
        </label>

        <label className="field">
          <span>Keywords / phrases</span>
          <textarea
            rows={3}
            placeholder="Separate with commas or line breaks"
            value={form.keywords}
            onChange={(event) => handleChange("keywords", event.target.value)}
          />
        </label>

        <label className="field">
          <span>Language</span>
          <select
            value={form.language}
            onChange={(event) =>
              handleChange("language", event.target.value as SupportedLanguage)
            }
          >
            <option value="en">English</option>
            <option value="th">Thai (TH)</option>
          </select>
        </label>

        <label className="field">
          <span>Highlight color</span>
          <input
            type="color"
            value={form.highlightColor}
            onChange={(event) =>
              handleChange("highlightColor", event.target.value)
            }
          />
        </label>

        <label className="field">
          <span>Max matches</span>
          <input
            type="number"
            min={1}
            max={200}
            value={form.maxMatches}
            onChange={(event) =>
              handleChange("maxMatches", Number(event.target.value))
            }
          />
        </label>

        <label className="field">
          <span>Speed multiplier</span>
          <div className="speed-control">
            <input
              type="range"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={SPEED_STEP}
              value={form.stagePreferences.speedMultiplier}
              onChange={(event) =>
                updateStagePreferences((prev) => ({
                  ...prev,
                  speedMultiplier: clampSpeedMultiplier(
                    Number(event.target.value)
                  ),
                }))
              }
            />
            <input
              type="number"
              min={MIN_SPEED}
              max={MAX_SPEED}
              step={SPEED_STEP}
              value={form.stagePreferences.speedMultiplier}
              onChange={(event) =>
                updateStagePreferences((prev) => ({
                  ...prev,
                  speedMultiplier: clampSpeedMultiplier(
                    Number(event.target.value)
                  ),
                }))
              }
            />
          </div>
          <div className="preset-row">
            {SPEED_PRESETS.map((preset) => {
              const isActive =
                Math.abs(form.stagePreferences.speedMultiplier - preset.value) <
                0.001;

              return (
                <button
                  key={preset.value}
                  type="button"
                  className={`timeline-pill ${
                    isActive ? "is-enabled" : "is-disabled"
                  }`}
                  disabled={isActive}
                  onClick={() =>
                    updateStagePreferences((prev) => ({
                      ...prev,
                      speedMultiplier: clampSpeedMultiplier(preset.value),
                    }))
                  }
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
          <span className="field-hint">
            Current ×{form.stagePreferences.speedMultiplier.toFixed(2)}. Apply a
            global speed scale (lower is faster, higher is slower).
          </span>
        </label>
      </div>

      <div className="panel-section">
        <h3>Stage phases</h3>
        <div className="phase-grid">
          {(Object.keys(
            form.stagePreferences.phases
          ) as Array<keyof StagePhaseToggles>).map((phase) => (
            <label key={phase} className="checkbox-field">
              <input
                type="checkbox"
                checked={form.stagePreferences.phases[phase]}
                onChange={(event) =>
                  updateStagePhase(phase, event.target.checked)
                }
              />
              <span>{phase}</span>
            </label>
          ))}
        </div>

        <label className="field">
          <span>Playback mode</span>
          <select
            value={form.stagePreferences.playbackMode}
            onChange={(event) =>
              updateStagePreferences((prev) => ({
                ...prev,
                playbackMode: event.target.value as StagePlaybackMode,
              }))
            }
          >
            <option value="cinematic">Cinematic (pan / zoom)</option>
            <option value="centered">Centered fast cuts</option>
          </select>
          <span className="field-hint">
            Centered mode keeps the highlight locked mid-frame and speeds up transitions.
          </span>
        </label>

        {form.stagePreferences.playbackMode === "centered" ? (
          <label className="field">
            <span>Centered zoom</span>
            <div className="speed-control">
              <input
                type="range"
                min={MIN_CENTERED_ZOOM}
                max={MAX_CENTERED_ZOOM}
                step={CENTERED_ZOOM_STEP}
                value={form.stagePreferences.centeredZoomScale}
                onChange={(event) =>
                  updateStagePreferences((prev) => ({
                    ...prev,
                    centeredZoomScale: clampCenteredZoom(Number(event.target.value)),
                  }))
                }
              />
              <input
                type="number"
                min={MIN_CENTERED_ZOOM}
                max={MAX_CENTERED_ZOOM}
                step={CENTERED_ZOOM_STEP}
                value={form.stagePreferences.centeredZoomScale}
                onChange={(event) =>
                  updateStagePreferences((prev) => ({
                    ...prev,
                    centeredZoomScale: clampCenteredZoom(Number(event.target.value)),
                  }))
                }
              />
            </div>
            <div className="preset-row">
              {CENTERED_ZOOM_PRESETS.map((preset) => {
                const isActive =
                  Math.abs(
                    form.stagePreferences.centeredZoomScale - preset.value
                  ) < 0.01;

                return (
                  <button
                    key={preset.value}
                    type="button"
                    className={`timeline-pill ${
                      isActive ? "is-enabled" : "is-disabled"
                    }`}
                    disabled={isActive}
                    onClick={() =>
                      updateStagePreferences((prev) => ({
                        ...prev,
                        centeredZoomScale: clampCenteredZoom(preset.value),
                      }))
                    }
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <span className="field-hint">
              Current ×{form.stagePreferences.centeredZoomScale.toFixed(
                2
              )}. Increase above 1.0 to zoom in while keeping the highlight
              locked at centre.
            </span>
          </label>
        ) : null}
      </div>

      <div className="panel-section">
        <h3>Typography</h3>
        <div className="panel-grid">
          <label className="field">
            <span>Font preset</span>
            <select
              value={form.stagePreferences.fontPreset}
              onChange={(event) =>
                updateStagePreferences((prev) => ({
                  ...prev,
                  fontPreset: event.target.value,
                }))
              }
            >
              {FONT_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
              <option value={CUSTOM_FONT_PRESET_ID}>
                Custom (Google / manual)
              </option>
            </select>
            <span className="field-hint">
              {selectedFontPreset
                ? selectedFontPreset.canvasFamily
                : "Provide a custom font stack below."}
            </span>
          </label>

          {form.stagePreferences.fontPreset === CUSTOM_FONT_PRESET_ID ? (
            <>
              <label className="field">
                <span>Custom font family</span>
                <input
                  placeholder="e.g. 'Kanit', sans-serif"
                  value={form.stagePreferences.customFontFamily}
                  onChange={(event) =>
                    updateStagePreferences((prev) => ({
                      ...prev,
                      customFontFamily: event.target.value,
                    }))
                  }
                />
                <span className="field-hint">
                  CSS font-family value used for the preview canvas.
                </span>
              </label>

              <label className="field">
                <span>Google Fonts stylesheet URL</span>
                <input
                  placeholder="https://fonts.googleapis.com/..."
                  value={form.stagePreferences.customFontUrl}
                  onChange={(event) =>
                    updateStagePreferences((prev) => ({
                      ...prev,
                      customFontUrl: event.target.value,
                    }))
                  }
                />
              </label>
            </>
          ) : null}
        </div>
      </div>

      <div className="panel-section">
        <h3>Appearance</h3>
        <div className="panel-grid">
          <label className="field">
            <span>Background color</span>
            <input
              type="color"
              value={form.stagePreferences.backgroundColor}
              onChange={(event) =>
                updateStagePreferences((prev) => ({
                  ...prev,
                  backgroundColor: event.target.value,
                }))
              }
            />
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.stagePreferences.showBackground}
              onChange={(event) =>
                updateStagePreferences((prev) => ({
                  ...prev,
                  showBackground: event.target.checked,
                }))
              }
            />
            <span>Render background gradient</span>
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={form.stagePreferences.showOverlay}
              onChange={(event) =>
                updateStagePreferences((prev) => ({
                  ...prev,
                  showOverlay: event.target.checked,
                }))
              }
            />
            <span>Show stage overlay labels</span>
          </label>

          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={!form.stagePreferences.truncateText}
              onChange={(event) =>
                updateStagePreferences((prev) => ({
                  ...prev,
                  truncateText: !event.target.checked,
                }))
              }
            />
            <span>Allow full paragraph (no ellipsis)</span>
          </label>
        </div>
      </div>

      <button type="submit" disabled={isBusy} className="primary-button">
        {isBusy ? "Loading..." : "Generate matches"}
      </button>
    </form>
  );
}
