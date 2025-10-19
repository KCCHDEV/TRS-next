"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeywordMatch, TimelineItem } from "@/lib/text";
import { DEFAULT_DURATIONS } from "@/lib/text";
import type { WikiArticle } from "@/lib/wiki";
import {
  CUSTOM_FONT_PRESET_ID,
  resolveFontFamilies,
  type StagePreferences,
} from "@/lib/settings";

type StagePhase = "idle" | "intro" | "pan" | "zoom" | "highlight" | "hold" | "transition";

interface PreviewStageProps {
  article: WikiArticle | null;
  matches: KeywordMatch[];
  timeline: TimelineItem[];
  highlightColor: string;
  stagePreferences: StagePreferences;
  onActiveMatchChange?(index: number | null): void;
}

type PresetOption =
  | "ultrafast"
  | "superfast"
  | "veryfast"
  | "faster"
  | "fast"
  | "medium"
  | "slow"
  | "slower"
  | "veryslow";

type ResolutionOption = "auto" | "3840x2160" | "1920x1080" | "1280x720" | "1080x1920" | "1080x1080";

interface ExportSettings {
  webmName: string;
  mp4Name: string;
  videoBitrate: string;
  audioBitrate: string;
  preset: PresetOption;
  crf: number;
  resolution: ResolutionOption;
}

interface AnimationController {
  cancelled: boolean;
  frameId: number | null;
  cancelCallbacks: Array<() => void>;
}

interface FrameState {
  scale: number;
  offsetY: number;
  highlightAlpha: number;
}

interface DrawContext extends FrameState {
  phase: StagePhase;
}

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const INTRO_DURATION = 240;
const BEFORE_SNIPPET_LIMIT = 80;
const AFTER_SNIPPET_LIMIT = 80;
const LINE_HEIGHT = 42;
const TEXT_FONT_SIZE = 30;
const TEXT_FONT_WEIGHT = 500;
const HEADER_FONT_WEIGHT = 600;
const HEADER_FONT_SIZE = 20;
const SUBHEADER_FONT_WEIGHT = 500;
const SUBHEADER_FONT_SIZE = 18;
const STAGE_PADDING_X = 64;
const FFMPEG_SCRIPT_FILENAME = "convert-text-match-cut.sh";
const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  webmName: "text-match-cut.webm",
  mp4Name: "text-match-cut.mp4",
  videoBitrate: "6M",
  audioBitrate: "192k",
  preset: "medium",
  crf: 18,
  resolution: "auto",
};
const PRESET_OPTIONS: PresetOption[] = [
  "ultrafast",
  "superfast",
  "veryfast",
  "faster",
  "fast",
  "medium",
  "slow",
  "slower",
  "veryslow",
];
const RESOLUTION_OPTIONS: Array<{ value: ResolutionOption; label: string }> = [
  { value: "auto", label: "Auto (use canvas size)" },
  { value: "3840x2160", label: "2160p (4K 16:9)" },
  { value: "1920x1080", label: "1080p (16:9)" },
  { value: "1280x720", label: "720p (16:9)" },
  { value: "1080x1920", label: "1080x1920 (Vertical 9:16)" },
  { value: "1080x1080", label: "1080x1080 (Square 1:1)" },
];

interface CanvasFonts {
  text: string;
  header: string;
  subheader: string;
}

interface RenderOptions {
  highlightColor: string;
  preferences: StagePreferences;
  fonts: CanvasFonts;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

type TokenType = "normal" | "highlight";

interface Token {
  text: string;
  type: TokenType;
}

type TokenLine = Token[];

const hexToRgb = (color: string): [number, number, number] => {
  const safe = /^#?[0-9A-Fa-f]{6}$/;
  const base = safe.test(color) ? color.replace("#", "") : "facc15";
  const value = parseInt(base, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

const sanitizeFilename = (value: string, fallback: string, extension: string): string => {
  const trimmed = value.trim() || fallback;
  const cleaned = trimmed.replace(/[\\/:*?"<>|]/g, "-");
  if (cleaned.toLowerCase().endsWith(`.${extension}`)) {
    return cleaned;
  }
  return `${cleaned}.${extension}`;
};

const ellipsisLeft = (text: string, limit: number) => {
  if (text.length <= limit) {
    return text;
  }
  const sliced = text.slice(text.length - limit);
  return `...${sliced.trimStart()}`;
};

const ellipsisRight = (text: string, limit: number) => {
  if (text.length <= limit) {
    return text;
  }
  const sliced = text.slice(0, limit);
  return `${sliced.trimEnd()}...`;
};

const tokenize = (text: string, type: TokenType): Token[] => {
  if (type === "highlight") {
    return [{ text, type }];
  }

  return text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((segment) => ({
      text: segment,
      type,
    }));
};

const buildTokens = (before: string, target: string, after: string): Token[] => {
  return [...tokenize(before, "normal"), ...tokenize(target, "highlight"), ...tokenize(after, "normal")];
};

const wrapTokens = (ctx: CanvasRenderingContext2D, tokens: Token[], maxWidth: number): TokenLine[] => {
  const lines: TokenLine[] = [];
  let current: TokenLine = [];
  let width = 0;

  tokens.forEach((token) => {
    if (!token.text) {
      return;
    }

    const segments = token.type === "highlight" ? [token] : tokenize(token.text, token.type);

    segments.forEach((segment) => {
      const textWidth = ctx.measureText(segment.text).width;
      const isWhitespace = segment.text.trim().length === 0;

      if (current.length > 0 && width + textWidth > maxWidth) {
        lines.push(current);
        current = [];
        width = 0;

        if (isWhitespace) {
          return;
        }
      }

      current.push(segment);
      width += textWidth;
    });
  });

  if (current.length) {
    lines.push(current);
  }

  return lines;
};

const measureLineWidth = (ctx: CanvasRenderingContext2D, line: TokenLine) =>
  line.reduce((total, token) => total + ctx.measureText(token.text).width, 0);

const fillStageBackground = (ctx: CanvasRenderingContext2D, preferences: StagePreferences) => {
  ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const fallback = "#0f172a";
  const background = preferences.backgroundColor?.trim() || fallback;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  if (preferences.showBackground) {
    const overlay = ctx.createLinearGradient(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    overlay.addColorStop(0, "rgba(255,255,255,0.06)");
    overlay.addColorStop(1, "rgba(0,0,0,0.32)");
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  }
};

const drawPlaceholder = (
  ctx: CanvasRenderingContext2D,
  message: string,
  renderOptions: RenderOptions
) => {
  fillStageBackground(ctx, renderOptions.preferences);

  ctx.fillStyle = "rgba(226,232,240,0.85)";
  ctx.font = renderOptions.fonts.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
};

const drawMatchFrame = (
  ctx: CanvasRenderingContext2D,
  article: WikiArticle,
  match: KeywordMatch,
  options: DrawContext,
  renderOptions: RenderOptions,
  matchIndex: number,
  totalMatches: number
) => {
  fillStageBackground(ctx, renderOptions.preferences);
  const { preferences, fonts } = renderOptions;

  ctx.save();
  ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.translate(0, options.offsetY);
  ctx.scale(options.scale, options.scale);
  ctx.translate(-CANVAS_WIDTH / 2, -CANVAS_HEIGHT / 2);

  const paragraph = article.paragraphs[match.paragraphIndex] ?? "";
  const beforeSource = paragraph.slice(0, match.start);
  const target = paragraph.slice(match.start, match.end);
  const afterSource = paragraph.slice(match.end);

  const before = preferences.truncateText
    ? ellipsisLeft(beforeSource, BEFORE_SNIPPET_LIMIT)
    : beforeSource;
  const after = preferences.truncateText
    ? ellipsisRight(afterSource, AFTER_SNIPPET_LIMIT)
    : afterSource;

  ctx.font = fonts.text;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  const tokens = buildTokens(before, target, after);
  const lines = wrapTokens(ctx, tokens, CANVAS_WIDTH - STAGE_PADDING_X * 2);
  const contentHeight = lines.length * LINE_HEIGHT;
  const startY = (CANVAS_HEIGHT - contentHeight) / 2;
  const [r, g, b] = hexToRgb(renderOptions.highlightColor);

  lines.forEach((line, lineIndex) => {
    const lineWidth = measureLineWidth(ctx, line);
    let cursorX = (CANVAS_WIDTH - lineWidth) / 2;
    const cursorY = startY + lineIndex * LINE_HEIGHT;

    line.forEach((token) => {
      const width = ctx.measureText(token.text).width;

      if (token.type === "highlight") {
        const alpha = Math.max(0, Math.min(1, options.highlightAlpha));
        ctx.save();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.28 * alpha})`;
        ctx.fillRect(cursorX - 8, cursorY - 6, width + 16, LINE_HEIGHT + 12);
        ctx.shadowColor = `rgba(${r}, ${g}, ${b}, ${0.48 * alpha})`;
        ctx.shadowBlur = 22 * alpha;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.92})`;
        ctx.fillText(token.text, cursorX, cursorY);
        ctx.restore();
      } else {
        ctx.fillStyle = "rgba(226,232,240,0.92)";
        ctx.fillText(token.text, cursorX, cursorY);
      }

      cursorX += width;
    });
  });

  ctx.restore();

  if (!preferences.showOverlay) {
    return;
  }

  ctx.font = fonts.header;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(148,163,184,0.9)";
  ctx.fillText(`Match ${matchIndex + 1} / ${totalMatches}`, 40, 46);

  ctx.font = fonts.subheader;
  ctx.fillStyle = "rgba(226,232,240,0.85)";
  const keywordLabel = `Keyword: ${match.keyword}`;
  ctx.fillText(keywordLabel, 40, 78);

  const paragraphLabel = `Paragraph ${match.paragraphIndex + 1}`;
  ctx.fillText(paragraphLabel, 40, CANVAS_HEIGHT - 60);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(100,116,139,0.82)";
  ctx.fillText(options.phase.toUpperCase(), CANVAS_WIDTH - 40, 46);

  ctx.font = fonts.subheader;
  ctx.fillStyle = "rgba(148,163,184,0.75)";
  ctx.fillText(article.title, CANVAS_WIDTH - 40, CANVAS_HEIGHT - 60);
};

const buildFfmpegScript = (settings: ExportSettings) => {
  const { webmName, mp4Name, preset, crf, videoBitrate, audioBitrate, resolution } = settings;
  const filters = ["format=yuv420p"];

  if (resolution !== "auto") {
    const [width, height] = resolution.split("x");
    filters.unshift(`scale=${width}:${height}:flags=lanczos`);
  }

  const filterChain = filters.join(",");
  const videoBitrateArg = videoBitrate ? ` -b:v ${videoBitrate}` : "";
  const audioBitrateArg = audioBitrate ? ` -b:a ${audioBitrate}` : "";
  const resolutionLabel = resolution === "auto" ? "canvas" : resolution;

  return `#!/bin/bash
# Text Match CUT — convert WebM preview export to MP4 (H.264 + AAC)
# Settings: preset=${preset}, crf=${crf}${videoBitrate ? `, video_bitrate=${videoBitrate}` : ""}${audioBitrate ? `, audio_bitrate=${audioBitrate}` : ""}, resolution=${resolutionLabel}
set -e

INPUT="${webmName}"
OUTPUT="${mp4Name}"

if [ ! -f "$INPUT" ]; then
  echo "Missing $INPUT - export a WebM from Text Match CUT before running this script."
  exit 1
fi

ffmpeg -i "$INPUT" -c:v libx264 -preset ${preset} -crf ${crf}${videoBitrateArg} -vf "${filterChain}" -c:a aac${audioBitrateArg} "$OUTPUT"

echo "Done! Created $OUTPUT"

# Windows / PowerShell equivalent:
# ffmpeg -i "${webmName}" -c:v libx264 -preset ${preset} -crf ${crf}${videoBitrateArg} -vf "${filterChain}" -c:a aac${audioBitrateArg} "${mp4Name}"
`;
};

export default function PreviewStage({
  article,
  matches,
  timeline,
  highlightColor,
  stagePreferences,
  onActiveMatchChange,
}: PreviewStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<AnimationController | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingAbortRef = useRef(false);
  const recordingGateRef = useRef<{ promise: Promise<void>; resolve: () => void } | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [phaseLabel, setPhaseLabel] = useState<StagePhase>("idle");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasExport, setHasExport] = useState(false);
  const [downloadUrl, setDownloadUrlState] = useState<string | null>(null);
  const [exportSettings, setExportSettings] = useState<ExportSettings>(DEFAULT_EXPORT_SETTINGS);

  const updateDownloadUrl = useCallback((value: string | null) => {
    setDownloadUrlState((prev) => {
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      return value;
    });
    setHasExport(Boolean(value));
  }, []);

  const resolvedSettings = useMemo<ExportSettings>(() => {
    const webmName = sanitizeFilename(
      exportSettings.webmName,
      DEFAULT_EXPORT_SETTINGS.webmName,
      "webm"
    );
    const mp4Name = sanitizeFilename(
      exportSettings.mp4Name,
      DEFAULT_EXPORT_SETTINGS.mp4Name,
      "mp4"
    );
    const preset = PRESET_OPTIONS.includes(exportSettings.preset)
      ? exportSettings.preset
      : DEFAULT_EXPORT_SETTINGS.preset;
    const normalizedCrf = Number.isFinite(exportSettings.crf)
      ? Math.min(51, Math.max(0, Math.round(exportSettings.crf)))
      : DEFAULT_EXPORT_SETTINGS.crf;
    const videoBitrate = exportSettings.videoBitrate.trim();
    const audioBitrate = exportSettings.audioBitrate.trim();
    const resolution = RESOLUTION_OPTIONS.some((option) => option.value === exportSettings.resolution)
      ? exportSettings.resolution
      : DEFAULT_EXPORT_SETTINGS.resolution;

    return {
      webmName,
      mp4Name,
      videoBitrate,
      audioBitrate,
      preset,
      crf: normalizedCrf,
      resolution,
    };
  }, [exportSettings]);

  function handleSettingsChange<K extends keyof ExportSettings>(
    key: K,
    value: ExportSettings[K]
  ) {
    setExportSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  const fontFamilies = useMemo(
    () => resolveFontFamilies(stagePreferences),
    [stagePreferences]
  );

  const fonts = useMemo<CanvasFonts>(
    () => ({
      text: `${TEXT_FONT_WEIGHT} ${TEXT_FONT_SIZE}px ${fontFamilies.canvasFamily}`,
      header: `${HEADER_FONT_WEIGHT} ${HEADER_FONT_SIZE}px ${fontFamilies.canvasFamily}`,
      subheader: `${SUBHEADER_FONT_WEIGHT} ${SUBHEADER_FONT_SIZE}px ${fontFamilies.canvasFamily}`,
    }),
    [fontFamilies.canvasFamily]
  );

  const stageFontFamily = fontFamilies.cssFamily;

  const renderOptions = useMemo<RenderOptions>(
    () => ({
      highlightColor,
      preferences: stagePreferences,
      fonts,
    }),
    [highlightColor, stagePreferences, fonts]
  );

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const selector = 'link[data-preview-stage-font="custom"]';

    if (stagePreferences.fontPreset !== CUSTOM_FONT_PRESET_ID) {
      document.querySelectorAll(selector).forEach((link) => {
        link.parentElement?.removeChild(link);
      });
      return;
    }

    const href = stagePreferences.customFontUrl.trim();
    if (!href) {
      return;
    }

    const existing = document.querySelector<HTMLLinkElement>(selector);
    if (existing?.href === href) {
      return;
    }

    if (existing) {
      existing.remove();
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.previewStageFont = "custom";
    document.head.appendChild(link);

    return () => {
      link.remove();
    };
  }, [stagePreferences.fontPreset, stagePreferences.customFontUrl]);

  useEffect(() => {
    if (!onActiveMatchChange) {
      return;
    }

    onActiveMatchChange(activeIndex ?? null);
  }, [activeIndex, onActiveMatchChange]);

  const ensureContext = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    return canvas.getContext("2d");
  };

  const drawIdleFrame = useCallback(
    (index: number | null) => {
      const ctx = ensureContext();
      if (!ctx) {
        return;
      }

      if (!article || !matches.length || index === null || index < 0) {
        drawPlaceholder(
          ctx,
          "Run a search to stage animations for the selected keywords.",
          renderOptions
        );
        return;
      }

      drawMatchFrame(
        ctx,
        article,
        matches[index],
        { scale: 1, offsetY: 0, highlightAlpha: 0, phase: "idle" },
        renderOptions,
        index,
        matches.length
      );
    },
    [article, matches, renderOptions]
  );

  useEffect(() => {
    if (!matches.length) {
      setActiveIndex(null);
    } else if (activeIndex === null || activeIndex >= matches.length) {
      setActiveIndex(0);
    }

    if (!isPlaying) {
      drawIdleFrame(matches.length ? 0 : null);
    }
  }, [matches, activeIndex, drawIdleFrame, isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      drawIdleFrame(activeIndex);
    }
  }, [isPlaying, activeIndex, drawIdleFrame]);

  useEffect(() => {
    if (!article) {
      setActiveIndex(null);
      drawIdleFrame(null);
    }
  }, [article, drawIdleFrame]);

  const createController = () => {
    const existing = animationRef.current;
    if (existing) {
      existing.cancelled = true;
      if (existing.frameId !== null) {
        cancelAnimationFrame(existing.frameId);
      }
      existing.cancelCallbacks.forEach((callback) => callback());
      existing.cancelCallbacks = [];
    }

    const controller: AnimationController = {
      cancelled: false,
      frameId: null,
      cancelCallbacks: [],
    };

    animationRef.current = controller;
    return controller;
  };

  const createDeferred = () => {
    let resolve!: () => void;
    const promise = new Promise<void>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  };

  const registerCancel = (controller: AnimationController, callback: () => void) => {
    controller.cancelCallbacks.push(callback);
    return () => {
      controller.cancelCallbacks = controller.cancelCallbacks.filter((fn) => fn !== callback);
    };
  };

  const stopRecording = useCallback(async (abort: boolean) => {
    const recorder = recorderRef.current;
    recordingAbortRef.current = abort;

    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore recorder stop failures
      }
    }

    const gate = recordingGateRef.current;
    if (gate) {
      await gate.promise;
    }

    recorderRef.current = null;
    recordingGateRef.current = null;
    chunksRef.current = [];
  }, []);

  const stopPlayback = useCallback(async (forceRecordingAbort: boolean) => {
    const controller = animationRef.current;
    if (controller) {
      controller.cancelled = true;
      if (controller.frameId !== null) {
        cancelAnimationFrame(controller.frameId);
      }
      controller.cancelCallbacks.forEach((callback) => callback());
      controller.cancelCallbacks = [];
      animationRef.current = null;
    }

    setIsPlaying(false);
    setPhaseLabel("idle");

    if (forceRecordingAbort) {
      await stopRecording(true);
      setIsRecording(false);
      updateDownloadUrl(null);
    }
  }, [stopRecording, updateDownloadUrl]);

  useEffect(() => {
    return () => {
      void stopPlayback(true);
      updateDownloadUrl(null);
    };
  }, [stopPlayback, updateDownloadUrl]);

  const startRecording = async (): Promise<boolean> => {
    const canvas = canvasRef.current;
    if (!canvas) {
      setError("Preview canvas is unavailable.");
      return false;
    }

    if (typeof MediaRecorder === "undefined") {
      setError("MediaRecorder is not supported in this environment.");
      return false;
    }

    const canvasElement = canvas as HTMLCanvasElement & {
      captureStream?(frameRate?: number): MediaStream;
    };

    if (typeof canvasElement.captureStream !== "function") {
      setError("Canvas captureStream is not supported in this browser.");
      return false;
    }

    const stream = canvasElement.captureStream(30);

    let preferredMime = "video/webm";
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9")) {
      preferredMime = "video/webm;codecs=vp9";
    } else if (MediaRecorder.isTypeSupported("video/webm;codecs=vp8")) {
      preferredMime = "video/webm;codecs=vp8";
    }

    try {
      const recorder = new MediaRecorder(stream, { mimeType: preferredMime });
      chunksRef.current = [];
      recordingAbortRef.current = false;
      const deferred = createDeferred();
      recordingGateRef.current = deferred;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (!recordingAbortRef.current && chunksRef.current.length) {
          const blob = new Blob(chunksRef.current, { type: preferredMime });
          const url = URL.createObjectURL(blob);
          updateDownloadUrl(url);
        }
        setIsRecording(false);
        deferred.resolve();
      };

      recorder.onerror = (event) => {
        setError(`Recording failed: ${event.error?.message ?? "unknown error"}.`);
        deferred.resolve();
      };

      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      return true;
    } catch (captureError) {
      setError(
        captureError instanceof Error
          ? `Unable to start recording: ${captureError.message}.`
          : "Unable to start recording."
      );
      return false;
    }
  };

  const startAnimation = async (record: boolean) => {
    if (!article || matches.length === 0) {
      setError("Add at least one keyword match before playing.");
      return;
    }

    setError(null);
    const ctx = ensureContext();
    if (!ctx) {
      setError("Unable to access the drawing context.");
      return;
    }

    if (record) {
      const started = await startRecording();
      if (!started) {
        await stopPlayback(true);
        return;
      }
    }

    const controller = createController();
    setIsPlaying(true);
    let currentState: FrameState = {
      scale: 0.94,
      offsetY: 0,
      highlightAlpha: 0,
    };

    const animateTo = async (
      target: Partial<FrameState>,
      durationMs: number,
      phase: StagePhase,
      match: KeywordMatch,
      matchIndex: number
    ) => {
      if (controller.cancelled) {
        return;
      }

      const duration = Math.max(0, Math.round(durationMs));
      setPhaseLabel(phase);

      if (duration === 0) {
        currentState = {
          scale: target.scale ?? currentState.scale,
          offsetY: target.offsetY ?? currentState.offsetY,
          highlightAlpha: target.highlightAlpha ?? currentState.highlightAlpha,
        };
        drawMatchFrame(
          ctx,
          article,
          match,
          { ...currentState, phase },
          renderOptions,
          matchIndex,
          matches.length
        );
        return;
      }

        const start = { ...currentState };
        const startTime = performance.now();

        await new Promise<void>((resolve) => {
          let settled = false;
          let release: () => void = () => undefined;
          const finish = () => {
            if (settled) {
              return;
            }
            settled = true;
            release();
            controller.frameId = null;
            resolve();
          };

          release = registerCancel(controller, finish);

          if (controller.cancelled) {
            finish();
            return;
          }

          const step = (timestamp: number) => {
            if (controller.cancelled) {
              finish();
              return;
            }
            const elapsed = timestamp - startTime;
            const t = Math.min(1, elapsed / duration);
            const eased = easeInOut(t);

            currentState = {
              scale: target.scale !== undefined ? lerp(start.scale, target.scale, eased) : start.scale,
              offsetY: target.offsetY !== undefined ? lerp(start.offsetY, target.offsetY, eased) : start.offsetY,
              highlightAlpha:
                target.highlightAlpha !== undefined
                  ? lerp(start.highlightAlpha, target.highlightAlpha, eased)
                  : start.highlightAlpha,
            };

            drawMatchFrame(
              ctx,
              article,
              match,
              { ...currentState, phase },
              renderOptions,
              matchIndex,
              matches.length
            );

            if (t < 1) {
              controller.frameId = requestAnimationFrame(step);
            } else {
              finish();
            }
          };

          controller.frameId = requestAnimationFrame(step);
        });
    };

    for (let index = 0; index < matches.length; index += 1) {
      if (controller.cancelled) {
        break;
      }

      const match = matches[index];
      setActiveIndex(index);

      currentState = {
        scale: 0.94,
        offsetY: 0,
        highlightAlpha: 0,
      };

      const { phases } = stagePreferences;

      drawMatchFrame(
        ctx,
        article,
        match,
        { ...currentState, phase: phases.intro ? "intro" : "idle" },
        renderOptions,
        index,
        matches.length
      );

      const schedule = timeline[index] ?? DEFAULT_DURATIONS;

      if (phases.intro) {
        await animateTo({ scale: 1, highlightAlpha: 0 }, INTRO_DURATION, "intro", match, index);
      }
      if (phases.pan && schedule.panMs > 0) {
        await animateTo({ offsetY: -60 }, schedule.panMs, "pan", match, index);
      }
      if (phases.zoom && schedule.zoomMs > 0) {
        await animateTo({ scale: 1.18 }, schedule.zoomMs, "zoom", match, index);
      }
      if (phases.highlight && schedule.highlightMs > 0) {
        await animateTo({ highlightAlpha: 1 }, schedule.highlightMs, "highlight", match, index);
      }
      if (phases.hold && schedule.holdMs > 0) {
        await animateTo({}, schedule.holdMs, "hold", match, index);
      }
      if (phases.transition && schedule.transitionMs > 0) {
        await animateTo(
          { highlightAlpha: 0, scale: 1, offsetY: 0 },
          schedule.transitionMs,
          "transition",
          match,
          index
        );
      }
    }

    if (record) {
      await stopRecording(false);
    }

    setIsPlaying(false);
    setPhaseLabel("idle");
    controller.cancelCallbacks = [];
    controller.frameId = null;
    animationRef.current = null;
  };

  const handlePlay = async () => {
    if (isPlaying) {
      return;
    }
    await stopPlayback(false);
    void startAnimation(false);
  };

  const handlePause = async () => {
    await stopPlayback(true);
  };

  const handleExport = async () => {
    if (isRecording) {
      return;
    }
    await stopPlayback(true);
    void startAnimation(true);
  };

  const handleDownload = () => {
    if (!downloadUrl) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = resolvedSettings.webmName;
    anchor.click();
  };

  const handleDownloadFfmpegScript = () => {
    const script = buildFfmpegScript(resolvedSettings);
    const blob = new Blob([script], { type: "text/x-shellscript" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = FFMPEG_SCRIPT_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="preview-stage" style={{ fontFamily: stageFontFamily }}>
      <header>
        <h2>Preview Stage</h2>
      </header>

      <div className="stage-canvas-wrapper">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          aria-label="Match cut preview canvas"
        />
      </div>

      <div className="stage-controls">
        <div className="stage-status">
          <span>{isPlaying ? `Playing (${phaseLabel})` : "Idle"}</span>
          {isRecording ? <span className="stage-recording">REC</span> : null}
        </div>

        <div className="stage-actions">
          <button type="button" onClick={handlePlay} disabled={isPlaying || matches.length === 0}>
            Play
          </button>
          <button type="button" onClick={handlePause} disabled={!isPlaying && !isRecording}>
            Pause
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={matches.length === 0 || isRecording || isPlaying}
          >
            Export WebM
          </button>
        </div>
      </div>

      <div className="stage-export-settings">
        <div className="export-settings-header">
          <h3>Export Settings</h3>
          <span>Adjust filenames and FFmpeg parameters before downloading.</span>
        </div>

        <div className="export-grid">
          <label className="export-field">
            <span>WebM filename</span>
            <input
              value={exportSettings.webmName}
              onChange={(event) => handleSettingsChange("webmName", event.target.value)}
              placeholder="text-match-cut.webm"
            />
          </label>

          <label className="export-field">
            <span>MP4 filename</span>
            <input
              value={exportSettings.mp4Name}
              onChange={(event) => handleSettingsChange("mp4Name", event.target.value)}
              placeholder="text-match-cut.mp4"
            />
          </label>

          <label className="export-field">
            <span>FFmpeg preset</span>
            <select
              value={exportSettings.preset}
              onChange={(event) => handleSettingsChange("preset", event.target.value as PresetOption)}
            >
              {PRESET_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label className="export-field">
            <span>CRF</span>
            <input
              type="number"
              min={0}
              max={51}
              value={exportSettings.crf}
              onChange={(event) => {
                const next = Number(event.target.value);
                handleSettingsChange("crf", Number.isNaN(next) ? exportSettings.crf : next);
              }}
            />
          </label>

          <label className="export-field">
            <span>Video bitrate</span>
            <input
              value={exportSettings.videoBitrate}
              onChange={(event) => handleSettingsChange("videoBitrate", event.target.value)}
              placeholder="e.g. 6M"
            />
          </label>

          <label className="export-field">
            <span>Audio bitrate</span>
            <input
              value={exportSettings.audioBitrate}
              onChange={(event) => handleSettingsChange("audioBitrate", event.target.value)}
              placeholder="e.g. 192k"
            />
          </label>

          <label className="export-field">
            <span>Resolution override</span>
            <select
              value={exportSettings.resolution}
              onChange={(event) =>
                handleSettingsChange("resolution", event.target.value as ResolutionOption)
              }
            >
              {RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="stage-downloads">
          <button
            type="button"
            className="download-button"
            onClick={handleDownload}
            disabled={!hasExport}
          >
            {hasExport ? `Download ${resolvedSettings.webmName}` : "Download WebM (export first)"}
          </button>
          <button
            type="button"
            className="download-button secondary"
            onClick={handleDownloadFfmpegScript}
          >
            Download FFmpeg script
          </button>
        </div>

        {!hasExport ? (
          <p className="stage-hint">
            Export to WebM before downloading the file. The FFmpeg script references {resolvedSettings.webmName} and can be saved anytime.
          </p>
        ) : null}
      </div>

      {error ? <p className="stage-error">{error}</p> : null}
    </section>
  );
}
