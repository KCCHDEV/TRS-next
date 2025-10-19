"use client";

import type { KeywordMatch, TimelineItem } from "@/lib/text";

interface StagePhaseToggles {
  intro: boolean;
  pan: boolean;
  zoom: boolean;
  highlight: boolean;
  hold: boolean;
  transition: boolean;
}

interface TimelineSummaryProps {
  matches: KeywordMatch[];
  timeline: TimelineItem[];
  speedMultiplier: number;
  stageToggles: StagePhaseToggles;
  activeIndex?: number | null;
}

export default function TimelineSummary({
  matches,
  timeline,
  speedMultiplier,
  stageToggles,
  activeIndex = null,
}: TimelineSummaryProps) {
  if (!matches.length) {
    return (
      <section className="timeline">
        <header>
          <h2>Timeline</h2>
        </header>
        <p className="empty">Add keywords to see planned match cuts.</p>
      </section>
    );
  }

  return (
    <section className="timeline">
      <header>
        <h2>Timeline</h2>
        <span className="meta">
          {matches.length} match{matches.length > 1 ? "es" : ""} · speed ×
          {speedMultiplier.toFixed(2)}
        </span>
      </header>

      <div className="timeline-legend">
        {["intro", "pan", "zoom", "highlight", "hold", "transition"].map((phase) => {
          const key = phase as keyof StagePhaseToggles;
          const enabled = stageToggles[key];

          return (
            <span
              key={phase}
              className={`timeline-pill ${enabled ? "is-enabled" : "is-disabled"}`}
            >
              {phase}
            </span>
          );
        })}
      </div>

      <ol>
        {timeline.map((item, index) => {
          const isActive = activeIndex === index;
          const details: string[] = [
            `Paragraph ${item.paragraphIndex + 1}`,
          ];

          if (stageToggles.pan && item.panMs > 0) {
            details.push(`pan ${Math.round(item.panMs)}ms`);
          }

          if (stageToggles.zoom && item.zoomMs > 0) {
            details.push(`zoom ${Math.round(item.zoomMs)}ms`);
          }

          if (stageToggles.highlight && item.highlightMs > 0) {
            details.push(`highlight ${Math.round(item.highlightMs)}ms`);
          }

          if (stageToggles.hold && item.holdMs > 0) {
            details.push(`hold ${Math.round(item.holdMs)}ms`);
          }

          if (stageToggles.transition && item.transitionMs > 0) {
            details.push(`transition ${Math.round(item.transitionMs)}ms`);
          }

          return (
            <li
              key={`${item.keyword}-${index}`}
              className={isActive ? "is-active" : undefined}
            >
              <span className="step-index">{index + 1}</span>
            <div className="step-body">
              <strong>{item.keyword}</strong>
                <span className="details">{details.join(" · ")}</span>
            </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
