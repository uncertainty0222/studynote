import { upsertNewsArticle } from "./db";

// 관련 키워드 필터
const KEYWORDS = [
  "다문화",
  "결혼이민",
  "출산",
  "육아",
  "아동수당",
  "부모급여",
  "첫만남",
  "창원",
  "영아",
  "보육",
  "양육",
  "육아휴직",
  "다자녀",
];

const RSS_FEEDS = [
  {
    url: "https://www.mohw.go.kr/react/rss.jsp",
    source: "보건복지부",
  },
  {
    url: "https://www.mogef.go.kr/rss/rss.do",
    source: "여성가족부",
  },
  {
    url: "https://www.moel.go.kr/rss/rss010201List.do",
    source: "고용노동부",
  },
];

interface RSSItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

function extractCDATA(xml: string, tag: string): string {
  const patterns = [
    new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, "i"),
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = xml.match(pattern);
    if (match) return match[1].trim();
  }
  return "";
}

function parseRSSItems(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractCDATA(block, "title");
    const link = extractCDATA(block, "link");
    const description = extractCDATA(block, "description");
    const pubDate = extractCDATA(block, "pubDate");
    if (title && link) items.push({ title, link, description, pubDate });
  }
  return items;
}

function isRelevant(item: RSSItem): boolean {
  const text = `${item.title} ${item.description}`;
  return KEYWORDS.some((kw) => text.includes(kw));
}

async function fetchFeed(url: string): Promise<RSSItem[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml);
  } catch {
    return [];
  }
}

export async function refreshAllFeeds(): Promise<{ total: number; newCount: number }> {
  let total = 0;
  let newCount = 0;

  for (const feed of RSS_FEEDS) {
    const items = await fetchFeed(feed.url);
    const relevant = items.filter(isRelevant);
    total += relevant.length;

    for (const item of relevant) {
      const isNew = await upsertNewsArticle({
        title: item.title,
        summary: item.description ? item.description.slice(0, 400) : null,
        url: item.link,
        source: feed.source,
        published_at: item.pubDate ? new Date(item.pubDate) : null,
      });
      if (isNew) newCount++;
    }
  }

  return { total, newCount };
}
