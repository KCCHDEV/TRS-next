"use client";

import { useMemo, useState } from "react";
import SearchPanel, { SearchPayload } from "@/components/SearchPanel";
import ArticlePreview from "@/components/ArticlePreview";
import TimelineSummary from "@/components/TimelineSummary";
import PreviewStage from "@/components/PreviewStage";
import StatusBanner from "@/components/StatusBanner";
import {
  fetchArticleByTopic,
  type WikiArticle,
} from "@/lib/wiki";
import {
  buildTimeline,
  collectMatches,
  type KeywordMatch,
  type TimelineItem,
} from "@/lib/text";
import {
  clampSpeedMultiplier,
  DEFAULT_STAGE_PREFERENCES,
} from "@/lib/settings";

type FetchState = "idle" | "loading" | "error" | "ready";

interface AppState {
  status: FetchState;
  message: string | null;
  article: WikiArticle | null;
  matches: KeywordMatch[];
  timeline: TimelineItem[];
  payload: SearchPayload | null;
}

const INITIAL_STATE: AppState = {
  status: "idle",
  message: null,
  article: null,
  matches: [],
  timeline: [],
  payload: null,
};

export default function Home() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const [activeMatchIndex, setActiveMatchIndex] = useState<number | null>(null);

  async function handleSearch(payload: SearchPayload) {
    setState((previous) => ({
      ...previous,
      status: "loading",
      message: "Fetching article from Wikipedia...",
    }));
    setActiveMatchIndex(null);

    try {
      const article = await fetchArticleByTopic(payload.topic, payload.language);

      if (!article) {
        setActiveMatchIndex(null);
        setState({
          ...INITIAL_STATE,
          status: "error",
          message: `No Wikipedia article found for "${payload.topic}" (${payload.language.toUpperCase()}).`,
        });
        return;
      }

      const matches = collectMatches(article, payload.keywords)
        .sort((a, b) => {
          if (a.paragraphIndex === b.paragraphIndex) {
            return a.start - b.start;
          }

          return a.paragraphIndex - b.paragraphIndex;
        })
        .slice(0, payload.maxMatches);

      const timeline = buildTimeline(matches, payload.stagePreferences);
      setActiveMatchIndex(matches.length > 0 ? 0 : null);

      setState({
        status: "ready",
        message: `Loaded "${article.title}" with ${matches.length} planned match cut target(s).`,
        article,
        matches,
        timeline,
        payload,
      });
    } catch (error) {
      const fallbackMessage =
        error instanceof Error ? error.message : "Unexpected error occurred.";

      setState({
        ...INITIAL_STATE,
        status: "error",
        message: fallbackMessage,
      });
      setActiveMatchIndex(null);
    }
  }

  const speedMultiplier = useMemo(() => {
    const raw = state.payload?.stagePreferences.speedMultiplier ?? 1;
    return clampSpeedMultiplier(raw);
  }, [state.payload?.stagePreferences.speedMultiplier]);

  const stagePreferences = useMemo(
    () => state.payload?.stagePreferences ?? DEFAULT_STAGE_PREFERENCES,
    [state.payload?.stagePreferences]
  );

  return (
    <div className="page">
      <header className="page-header">
        <h1>Text Match CUT (MVP)</h1>
        <p>
          Load a Wikipedia article, map keyword matches, and stage the match cut
          animation timeline.
        </p>
      </header>

      <StatusBanner state={state.status} message={state.message} />

      <SearchPanel isBusy={state.status === "loading"} onSubmit={handleSearch} />

      <main className="layout">
        <div className="layout-column">
          {state.article ? (
            <ArticlePreview
              article={state.article}
              keywords={state.payload?.keywords ?? ""}
              highlightColor={state.payload?.highlightColor ?? "#facc15"}
            />
          ) : (
            <section className="placeholder">
              <p>Search for a topic to load the article preview.</p>
            </section>
          )}
        </div>

        <div className="layout-column">
          <PreviewStage
            article={state.article}
            matches={state.matches}
            timeline={state.timeline}
            highlightColor={state.payload?.highlightColor ?? "#facc15"}
            stagePreferences={stagePreferences}
            onActiveMatchChange={setActiveMatchIndex}
          />
          <TimelineSummary
            matches={state.matches}
            timeline={state.timeline}
            speedMultiplier={speedMultiplier}
            stageToggles={stagePreferences.phases}
            activeIndex={activeMatchIndex}
          />
        </div>
      </main>
    </div>
  );
}
