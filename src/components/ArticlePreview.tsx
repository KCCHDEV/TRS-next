"use client";

import { useMemo } from "react";
import type { WikiArticle } from "@/lib/wiki";
import { splitKeywords } from "@/lib/text";

interface ArticlePreviewProps {
  article: WikiArticle;
  keywords: string;
  highlightColor: string;
  fontFamily?: string;
}

function escapeRegex(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function ArticlePreview({
  article,
  keywords,
  highlightColor,
  fontFamily,
}: ArticlePreviewProps) {
  const tokens = useMemo(() => splitKeywords(keywords), [keywords]);
  const highlightPattern = useMemo(() => {
    if (!tokens.length) {
      return null;
    }

    const escaped = tokens.map(escapeRegex).join("|");
    return new RegExp(`(${escaped})`, "gi");
  }, [tokens]);

  return (
    <section
      className="article-preview"
      style={fontFamily ? { fontFamily } : undefined}
    >
      <header>
        <h2>{article.title}</h2>
        <span className="language-tag">{article.language.toUpperCase()}</span>
      </header>

      <div className="paragraphs">
        {article.paragraphs.map((paragraph, index) => (
          <p key={index}>
            {highlightPattern
              ? paragraph.split(highlightPattern).map((segment, segmentIndex) => {
                  const isMatch = tokens.some(
                    (token) => segment.toLocaleLowerCase() === token.toLocaleLowerCase()
                  );

                  if (isMatch) {
                    return (
                      <mark
                        key={`${index}-${segmentIndex}`}
                        style={{ backgroundColor: highlightColor }}
                      >
                        {segment}
                      </mark>
                    );
                  }

                  return <span key={`${index}-${segmentIndex}`}>{segment}</span>;
                })
              : paragraph}
          </p>
        ))}
      </div>
    </section>
  );
}
