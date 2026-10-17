import { XMLParser } from "fast-xml-parser";
import { SOURCES, type Region, type Source } from "./sources";
import { classify, keywordInterest, type TopicId } from "./topics";
import { getTranslation, queueTranslations, translationStatus } from "./translate";
import { getTop10, type Top10 } from "./top10";

export type Article = {
  id: string;
  title: string;
  titleKo?: string; // 영어·베트남어 제목의 한국어 번역 (번역 기능이 켜져 있고 번역이 끝난 경우)
  interest: number; // 흥미도 1~10. AI 점수가 있으면 그것, 없으면 키워드 기반 추정
  interestByAi: boolean;
  link: string;
  publisher: string;
  sourceId: string;
  region: Region;
  lang: Source["lang"];
  publishedAt: number; // epoch ms
  summary: string;
  topics: TopicId[];
  korea: boolean;
  section?: "money";
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
  sources: SourceStatus[];
  translation: ReturnType<typeof translationStatus>;
  top10: Top10;
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
let cache: Omit<NewsBundle, "translation" | "top10"> | null = null;
let inflight: Promise<Omit<NewsBundle, "translation" | "top10">> | null = null;

// 페이스북 게시글은 별도 주기로 갱신되므로 응답할 때마다 최신 저장본을 붙인다.
// force(새로고침 버튼)는 뉴스만 다시 받고 페이스북 수집은 다시 돌리지 않는다 (비용).
export async function getNews(force = false): Promise<NewsBundle> {
  const bundle = await getNewsOnly(force);
  queueTranslations(bundle.articles.map((a) => a.title));
  const articles = bundle.articles.map((a) => {
    const t = getTranslation(a.title);
    if (!t) return a;
    return { ...a, titleKo: a.lang === "ko" ? undefined : t.ko, interest: t.interest, interestByAi: true };
  });
  return {
    ...bundle,
    articles,
    translation: translationStatus(),
    top10: getTop10(bundle.articles),
  };
}

type BaseBundle = Omit<NewsBundle, "translation" | "top10">;

async function getNewsOnly(force: boolean): Promise<BaseBundle> {
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

async function fetchAll(): Promise<BaseBundle> {
  const results = await Promise.all(SOURCES.map(fetchSource));
  const sources: SourceStatus[] = [];
  const all: Article[] = [];
  results.forEach((r, i) => {
    const s = SOURCES[i];
    sources.push({ id: s.id, name: s.name, region: s.region, ok: r.ok, count: r.articles.length, error: r.error });
    all.push(...r.articles);
  });
  return { fetchedAt: Date.now(), articles: dedupe(all), sources };
}

type SourceResult = { ok: boolean; articles: Article[]; error?: string };

export async function fetchSource(source: Source): Promise<SourceResult> {
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VietnamNewsBriefing/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, articles: [], error: `HTTP ${res.status}` };
    const xml = await res.text();
    return { ok: true, articles: parseFeed(xml, source) };
  } catch (e) {
    return { ok: false, articles: [], error: e instanceof Error ? e.message : String(e) };
  }
}

const VN_MEDIA_RE = /vietnam\.vn|vietnamplus|\bvov\b|nhân dân|nhan dan|nhandan|vnanet|ttxvn|vietnam news agency|báo|thông tấn|베트남통신|베트남·신시대/i;

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
    const maxAge = source.maxAgeDays ? source.maxAgeDays * 86400_000 : MAX_AGE_MS;
    if (Number.isFinite(publishedAt) && now - publishedAt > maxAge) continue;

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
    if (source.excludeLink && source.excludeLink.test(link)) continue;

    // 한국어 검색에 섞여 나오는 베트남 국영·관영 매체의 한국어판은 '베트남 언론'으로 분류한다
    const region = source.region === "kr" && VN_MEDIA_RE.test(publisher) ? "vn" : source.region;

    const { topics, korea } = classify(haystack);
    out.push({
      id: `${source.id}:${link}`,
      title: decodeEntities(title),
      link,
      publisher,
      sourceId: source.id,
      region,
      lang: source.lang,
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : now,
      summary: decodeEntities(summary),
      topics,
      korea,
      section: source.section,
      interest: keywordInterest(haystack, topics, korea, region === "intl"),
      interestByAi: false,
    });
  }
  return out;
}

function dedupe(articles: Article[]): Article[] {
  const seen = new Map<string, Article>();
  const out: Article[] = [];
  for (const a of articles.sort((x, y) => y.publishedAt - x.publishedAt)) {
    const key = a.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    const kept = seen.get(key) ?? seen.get(a.link);
    if (kept) {
      // 일반 소스에도 잡힌 기사면 일반 목록에도 보이게 한다
      if (!a.section) kept.section = undefined;
      continue;
    }
    seen.set(key, a);
    seen.set(a.link, a);
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
