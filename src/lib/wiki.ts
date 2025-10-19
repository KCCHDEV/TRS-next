export type SupportedLanguage = "en" | "th";

export interface WikiSearchResult {
  title: string;
  language: SupportedLanguage;
}

export interface WikiArticle extends WikiSearchResult {
  paragraphs: string[];
  rawText: string;
}

const ACTION_API_ENDPOINT = "https://$LANG.wikipedia.org/w/api.php";
const SUMMARY_ENDPOINT = "https://$LANG.wikipedia.org/api/rest_v1/page/summary/";

function createEndpoint(template: string, language: SupportedLanguage): string {
  return template.replace("$LANG", language);
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Wikipedia request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function searchArticleTitle(
  query: string,
  language: SupportedLanguage
): Promise<string | null> {
  const trimmed = query.trim();

  if (!trimmed) {
    return null;
  }

  const endpoint = createEndpoint(ACTION_API_ENDPOINT, language);
  const url = `${endpoint}?action=opensearch&search=${encodeURIComponent(
    trimmed
  )}&limit=1&origin=*`;

  const payload = await fetchJson<[string, string[], string[], string[]]>(url);
  const [, titles] = payload;

  return titles.length > 0 ? titles[0] : null;
}

interface ExtractQueryResponse {
  query?: {
    pages?: Array<{
      missing?: boolean;
      extract?: string;
    }>;
  };
}

async function fetchSummaryExtract(
  title: string,
  language: SupportedLanguage
): Promise<string | null> {
  const endpoint = createEndpoint(SUMMARY_ENDPOINT, language);
  const response = await fetch(`${endpoint}${encodeURIComponent(title)}`);

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as { extract?: string };
  return payload.extract ?? null;
}

async function fetchPlainArticle(
  title: string,
  language: SupportedLanguage
): Promise<string> {
  const endpoint = createEndpoint(ACTION_API_ENDPOINT, language);
  const searchParams = new URLSearchParams({
    action: "query",
    prop: "extracts",
    exlimit: "1",
    titles: title,
    explaintext: "1",
    format: "json",
    formatversion: "2",
    redirects: "1",
    origin: "*",
  });
  const payload = await fetchJson<ExtractQueryResponse>(
    `${endpoint}?${searchParams.toString()}`
  );

  const extract =
    payload.query?.pages && payload.query.pages[0]
      ? payload.query.pages[0].missing
        ? null
        : payload.query.pages[0].extract ?? null
      : null;

  if (extract && extract.trim().length > 0) {
    return extract;
  }

  const fallback = await fetchSummaryExtract(title, language);

  if (fallback && fallback.trim().length > 0) {
    return fallback;
  }

  throw new Error("Unable to load article text.");
}

function extractParagraphs(rawText: string, limit = 30): string[] {
  return rawText
    .split(/\n{2,}/g)
    .map((paragraph) => paragraph.replace(/\n+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

export async function fetchArticleByTopic(
  query: string,
  language: SupportedLanguage
): Promise<WikiArticle | null> {
  const title = await searchArticleTitle(query, language);

  if (!title) {
    return null;
  }

  const rawText = await fetchPlainArticle(title, language);
  const paragraphs = extractParagraphs(rawText);

  return {
    title,
    language,
    rawText,
    paragraphs,
  };
}
