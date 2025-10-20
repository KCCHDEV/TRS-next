import type { WikiArticle } from "./wiki";
import {
  DEFAULT_STAGE_PREFERENCES,
  clampSpeedMultiplier,
  type StagePreferences,
} from "./settings";

export interface KeywordMatch {
  keyword: string;
  paragraphIndex: number;
  start: number;
  end: number;
}

export interface TimelineItem {
  keyword: string;
  paragraphIndex: number;
  panMs: number;
  zoomMs: number;
  highlightMs: number;
  holdMs: number;
  transitionMs: number;
}

export const DEFAULT_DURATIONS = {
  panMs: 400,
  zoomMs: 450,
  highlightMs: 200,
  holdMs: 200,
  transitionMs: 120,
};

const CENTERED_MODE_DURATIONS = {
  panMs: 0,
  zoomMs: 0,
  highlightMs: 140,
  holdMs: 120,
  transitionMs: 90,
};

export function splitKeywords(input: string): string[] {
  return input
    .split(/[,;\n]/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function normalizeToken(token: string): string {
  return token.toLocaleLowerCase();
}

export function collectMatches(
  article: WikiArticle,
  rawKeywords: string
): KeywordMatch[] {
  const keywords = splitKeywords(rawKeywords);
  const normalizedKeywords = keywords.map(normalizeToken);

  if (!keywords.length) {
    return [];
  }

  const matches: KeywordMatch[] = [];

  article.paragraphs.forEach((paragraph, paragraphIndex) => {
    const haystack = normalizeToken(paragraph);

    normalizedKeywords.forEach((needle, keywordIndex) => {
      let cursor = haystack.indexOf(needle);

      while (cursor !== -1) {
        matches.push({
          keyword: keywords[keywordIndex],
          paragraphIndex,
          start: cursor,
          end: cursor + needle.length,
        });

        cursor = haystack.indexOf(needle, cursor + needle.length);
      }
    });
  });

  return matches;
}

export function buildTimeline(
  matches: KeywordMatch[],
  preferences: StagePreferences = DEFAULT_STAGE_PREFERENCES
): TimelineItem[] {
  const toggles = preferences.phases;
  const multiplier = clampSpeedMultiplier(preferences.speedMultiplier ?? 1);
  const baseDurations =
    preferences.playbackMode === "centered" ? CENTERED_MODE_DURATIONS : DEFAULT_DURATIONS;

  const resolveDuration = (enabled: boolean, base: number) =>
    enabled ? Math.max(0, Math.round(base * multiplier)) : 0;

  return matches.map((match) => ({
    keyword: match.keyword,
    paragraphIndex: match.paragraphIndex,
    panMs: resolveDuration(toggles.pan, baseDurations.panMs),
    zoomMs: resolveDuration(toggles.zoom, baseDurations.zoomMs),
    highlightMs: resolveDuration(toggles.highlight, baseDurations.highlightMs),
    holdMs: resolveDuration(toggles.hold, baseDurations.holdMs),
    transitionMs: resolveDuration(toggles.transition, baseDurations.transitionMs),
  }));
}
