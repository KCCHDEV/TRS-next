export interface StagePhaseToggles {
  intro: boolean;
  pan: boolean;
  zoom: boolean;
  highlight: boolean;
  hold: boolean;
  transition: boolean;
}

export interface FontPreset {
  id: string;
  label: string;
  canvasFamily: string;
  cssFamily: string;
  googleUrl?: string;
}

export const FONT_PRESETS: FontPreset[] = [
  {
    id: "inter",
    label: "Inter (Sans)",
    canvasFamily: "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
    cssFamily: "var(--font-inter), 'Inter', 'Segoe UI', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
  },
  {
    id: "prompt",
    label: "Prompt (Thai/Sans)",
    canvasFamily: "'Prompt', 'Sarabun', 'Noto Sans Thai', sans-serif",
    cssFamily: "var(--font-prompt), 'Prompt', 'Sarabun', 'Noto Sans Thai', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600&display=swap",
  },
  {
    id: "roboto-flex",
    label: "Roboto Flex (Sans)",
    canvasFamily: "'Roboto Flex', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
    cssFamily: "var(--font-roboto-flex), 'Roboto Flex', 'Roboto', sans-serif",
    googleUrl: "https://fonts.googleapis.com/css2?family=Roboto+Flex:wght@400;500;600&display=swap",
  },
  {
    id: "source-code",
    label: "Source Code Pro (Mono)",
    canvasFamily: "'Source Code Pro', 'SFMono-Regular', 'Consolas', monospace",
    cssFamily: "var(--font-source-code), 'Source Code Pro', monospace",
    googleUrl: "https://fonts.googleapis.com/css2?family=Source+Code+Pro:wght@400;500;600&display=swap",
  },
];

export const CUSTOM_FONT_PRESET_ID = "custom";

export type StagePlaybackMode = "cinematic" | "centered";

export interface StagePreferences {
  phases: StagePhaseToggles;
  playbackMode: StagePlaybackMode;
  speedMultiplier: number;
  centeredZoomScale: number;
  fontPreset: string;
  customFontFamily: string;
  customFontUrl: string;
  backgroundColor: string;
  showBackground: boolean;
  showOverlay: boolean;
  truncateText: boolean;
}

export const DEFAULT_STAGE_PREFERENCES: StagePreferences = {
  phases: {
    intro: true,
    pan: true,
    zoom: true,
    highlight: true,
    hold: true,
    transition: true,
  },
  playbackMode: "cinematic",
  speedMultiplier: 1,
  centeredZoomScale: 1.15,
  fontPreset: FONT_PRESETS[0]?.id ?? "inter",
  customFontFamily: "",
  customFontUrl: "",
  backgroundColor: "#0f172a",
  showBackground: true,
  showOverlay: true,
  truncateText: true,
};

export const MIN_CENTERED_ZOOM = 0.9;
export const MAX_CENTERED_ZOOM = 2.2;

export function clampSpeedMultiplier(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.min(4, Math.max(0.25, Number(value)));
}

export function clampCenteredZoom(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_STAGE_PREFERENCES.centeredZoomScale;
  }
  return Math.min(MAX_CENTERED_ZOOM, Math.max(MIN_CENTERED_ZOOM, Number(value)));
}

export function getFontPreset(id: string): FontPreset | undefined {
  return FONT_PRESETS.find((preset) => preset.id === id);
}

export function resolveFontFamilies(preferences: StagePreferences): {
  canvasFamily: string;
  cssFamily: string;
} {
  if (preferences.fontPreset === CUSTOM_FONT_PRESET_ID) {
    const fallback = FONT_PRESETS[0];
    const family = preferences.customFontFamily.trim();

    if (family) {
      return {
        canvasFamily: family,
        cssFamily: family,
      };
    }

    return {
      canvasFamily: fallback?.canvasFamily ?? "sans-serif",
      cssFamily: fallback?.cssFamily ?? "sans-serif",
    };
  }

  const preset = getFontPreset(preferences.fontPreset) ?? FONT_PRESETS[0];

  return {
    canvasFamily: preset?.canvasFamily ?? "sans-serif",
    cssFamily: preset?.cssFamily ?? "sans-serif",
  };
}

export function cloneStagePreferences(
  preferences: StagePreferences = DEFAULT_STAGE_PREFERENCES
): StagePreferences {
  return {
    ...DEFAULT_STAGE_PREFERENCES,
    ...preferences,
    phases: { ...DEFAULT_STAGE_PREFERENCES.phases, ...preferences.phases },
  };
}
