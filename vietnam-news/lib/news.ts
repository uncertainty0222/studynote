import { XMLParser } from "fast-xml-parser";
import { SOURCES, type Region, type Source } from "./sources";
import { classify, type TopicId } from "./topics";

export type Article = {
  id: string;
  title: string;
  link: string;
  publisher: string;
  sourceId: string;
  region: Region;
  lang: Source["lang"];
  publishedAt: number; // epoch ms
  summary: string;
  topics: TopicId[];
  korea: boolean;
};

export type Trend = {
  term: string;
  traffic: string; // 예: "2000+" (Google이 제공하는 대략값)
  publishedAt: number;
  newsTitle?: string;
  newsUrl?: string;
  newsSource?: string;
};

export type SourceStatus = {
  id: string;
  name: string;
  region: Region;
  ok: boolean;
  count: number;
  error?: string;
};

export type NewsBundle = {
  fetchedAt: number;
  articles: Article[];
  trends: Trend[];
  sources: SourceStatus[];
};

const CACHE_TTL_MS = 15 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  htmlEntities: true,
});

// Railway 같은 단일 프로세스 서버 기준 인메모리 캐시
let cache: NewsBundle | null = null;
let inflight: Promise<NewsBundle> | null = null;

export async function getNews(force = false): Promise<NewsBundle> {
  if (!force && cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = fetchAll()
    .then((bundle) => {
      cache = bundle;
      return bundle;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

async function fetchAll(): Promise<NewsBundle> {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const sources: SourceStatus[] = [];
  const all: Article[] = [];
  const trends: Trend[] = [];
  results.forEach((r, i) => {
    const s = SOURCES[i];
    const count = r.articles.length + r.trends.length;
    sources.push({ id: s.id, name: s.name, region: s.region, ok: r.ok, count, error: r.error });
    all.push(...r.articles);
    trends.push(...r.trends);
  });
  return { fetchedAt: Date.now(), articles: dedupe(all), trends, sources };
}

type SourceResult = { ok: boolean; articles: Article[]; trends: Trend[]; error?: string };

async function fetchSource(source: Source): Promise<SourceResult> {
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VietnamNewsBriefing/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, articles: [], trends: [], error: `HTTP ${res.status}` };
    const xml = await res.text();
    if (source.kind === "trends") return { ok: true, articles: [], trends: parseTrends(xml) };
    return { ok: true, articles: parseFeed(xml, source), trends: [] };
  } catch (e) {
    return { ok: false, articles: [], trends: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseFeed(xml: string, source: Source): Article[] {
  const doc = parser.parse(xml);
  const rawItems: unknown[] = toArray(doc?.rss?.channel?.item ?? doc?.feed?.entry);
  const now = Date.now();
  const out: Article[] = [];

  for (const raw of rawItems) {
    const it = raw as Record<string, unknown>;
    let title = text(it.title);
    const link = extractLink(it.link);
    if (!title || !link) continue;

    const dateStr = text(it.pubDate) || text(it.published) || text(it.updated) || text(it["dc:date"]);
    const publishedAt = dateStr ? Date.parse(dateStr) : NaN;
    if (Number.isFinite(publishedAt) && now - publishedAt > MAX_AGE_MS) continue;

    // Google News는 "제목 - 언론사" 형식이며 <source>에 언론사명이 들어 있다
    let publisher = text(it.source);
    if (publisher && title.endsWith(` - ${publisher}`)) {
      title = title.slice(0, -(publisher.length + 3));
    }
    if (!publisher) publisher = source.name;

    const isGoogle = link.includes("news.google.com");
    const summary = isGoogle ? "" : stripHtml(text(it.description) || text(it.summary) || text(it.content)).slice(0, 280);

    const haystack = `${title} ${summary}`;
    if (source.mustMatch && !source.mustMatch.test(haystack)) continue;

    const { topics, korea } = classify(haystack);
    out.push({
      id: `${source.id}:${link}`,
      title: decodeEntities(title),
      link,
      publisher,
      sourceId: source.id,
      region: source.region,
      lang: source.lang,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : now,
      summary: decodeEntities(summary),
      topics,
      korea,
    });
  }
  return out;
}

// Google Trends "Trending now" RSS: <item><title>검색어</title><ht:approx_traffic>…</ht:approx_traffic><ht:news_item>…</ht:news_item></item>
export function parseTrends(xml: string): Trend[] {
  const doc = parser.parse(xml);
  const out: Trend[] = [];
  for (const raw of toArray(doc?.rss?.channel?.item)) {
    const it = raw as Record<string, unknown>;
    const term = decodeEntities(text(it.title));
    if (!term) continue;
    const news = toArray(it["ht:news_item"])[0] as Record<string, unknown> | undefined;
    const date = Date.parse(text(it.pubDate));
    out.push({
      term,
      traffic: text(it["ht:approx_traffic"]),
      publishedAt: Number.isFinite(date) ? date : Date.now(),
      newsTitle: news ? decodeEntities(text(news["ht:news_item_title"])) || undefined : undefined,
      newsUrl: news ? text(news["ht:news_item_url"]) || undefined : undefined,
      newsSource: news ? text(news["ht:news_item_source"]) || undefined : undefined,
    });
  }
  return out;
}

function dedupe(articles: Article[]): Article[] {
  const seen = new Set<string>();
  const out: Article[] = [];
  for (const a of articles.sort((x, y) => y.publishedAt - x.publishedAt)) {
    const key = a.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    if (seen.has(key) || seen.has(a.link)) continue;
    seen.add(key);
    seen.add(a.link);
    out.push(a);
  }
  return out;
}

function toArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) {
    return text((v as Record<string, unknown>)["#text"]);
  }
  return "";
}

function extractLink(v: unknown): string {
  // RSS: <link>url</link>, Atom: <link href="url" rel="alternate"/>
  for (const l of toArray(v)) {
    if (typeof l === "string") return l.trim();
    if (l && typeof l === "object") {
      const o = l as Record<string, unknown>;
      const rel = o["@_rel"];
      if (typeof o["@_href"] === "string" && (!rel || rel === "alternate")) return (o["@_href"] as string).trim();
      const t = text(o);
      if (t) return t;
    }
  }
  return "";
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}
