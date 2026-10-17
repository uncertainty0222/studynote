// RSS 수집: Google News 검색 RSS와 언론사 RSS를 받아 제목·링크·언론사·날짜만 뽑는다.

import { XMLParser } from "fast-xml-parser";

export type Headline = {
  title: string;
  link: string;
  publisher: string;
  publishedAt: number; // epoch ms
};

export type FeedRequest = {
  url: string;
  publisher?: string; // RSS에 언론사 정보가 없을 때 쓸 이름
  maxAgeDays: number;
  mustMatch?: RegExp | RegExp[]; // 제목이 이 정규식(여러 개면 전부)에 맞는 것만 남긴다
  excludeTitle?: RegExp; // 제목이 이 정규식에 맞으면 버린다
  excludeLink?: RegExp; // 링크가 이 정규식에 맞으면 버린다
  kind?: "rss" | "pubmed"; // pubmed: url은 PubMed esearch 주소 (논문 제목을 기사처럼 쓴다)
  fromMs?: number; // 지정 시 이 시각 이후 발행된 기사만
  toMs?: number; // 지정 시 이 시각 이전 발행된 기사만
};

type GnEdition = "en" | "ko" | "vi";

const GN_EDITION: Record<GnEdition, string> = {
  en: "hl=en-US&gl=US&ceid=US:en",
  ko: "hl=ko&gl=KR&ceid=KR:ko",
  vi: "hl=vi&gl=VN&ceid=VN:vi",
};

// Google News 검색 RSS. 검색당 약 100건까지 오며, when:7d / after:YYYY-MM-DD before:YYYY-MM-DD 연산자를 쓸 수 있다
export function googleNews(query: string, edition: GnEdition) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${GN_EDITION[edition]}`;
}

// 제목에 베트남(나라·주요 도시·성·대표 기업·지도자)이 등장하는지
export const VIETNAM_RE = new RegExp(
  [
    "vietnam", "viet nam", "việt nam", "người việt", "베트남", "越南",
    "hanoi", "ha noi", "hà nội", "하노이",
    "ho chi minh", "hồ chí minh", "hcmc", "tp\\.hcm", "saigon", "sài gòn", "호찌민", "호치민", "사이공",
    "da nang", "danang", "đà nẵng", "다낭",
    "nha trang", "나트랑", "냐짱", "khanh hoa", "khánh hòa", "카인호아",
    "phu quoc", "phú quốc", "푸꾸옥",
    "hai phong", "hải phòng", "하이퐁",
    "ha long", "hạ long", "하롱", "quang ninh", "quảng ninh", "꽝닌",
    "hoi an", "hội an", "호이안", "da lat", "dalat", "đà lạt", "달랏", "huế", "후에",
    "can tho", "cần thơ", "껀터", "mekong", "메콩",
    "bac ninh", "bắc ninh", "박닌", "binh duong", "bình dương", "빈증", "dong nai", "đồng nai", "동나이",
    "vung tau", "vũng tàu", "붕따우", "long thanh", "long thành", "롱탄", "sapa", "sa pa", "사파",
    "vinfast", "vingroup", "viettel", "vietjet", "vietnam airlines", "petrovietnam",
    "to lam", "tô lâm", "또 럼", "또럼", "pham minh chinh", "phạm minh chính", "팜 민 찐", "팜민찐",
  ].join("|"),
  "i",
);

const FETCH_TIMEOUT_MS = 12_000;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  htmlEntities: true,
});

// 실패하면 빈 배열을 돌려준다 (한 피드 실패가 전체를 막지 않게)
export async function fetchFeed(req: FeedRequest): Promise<{ ok: boolean; items: Headline[]; error?: string }> {
  try {
    if (req.kind === "pubmed") return { ok: true, items: await fetchPubmed(req) };
    const res = await fetch(req.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VietnamNewsTop10/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, items: [], error: `HTTP ${res.status}` };
    return { ok: true, items: parseFeed(await res.text(), req) };
  } catch (e) {
    return { ok: false, items: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseFeed(xml: string, req: FeedRequest): Headline[] {
  const doc = parser.parse(xml);
  const rawItems: unknown[] = toArray(doc?.rss?.channel?.item ?? doc?.feed?.entry);
  const now = Date.now();
  const maxAge = req.maxAgeDays * 86400_000;
  const out: Headline[] = [];

  for (const raw of rawItems) {
    const it = raw as Record<string, unknown>;
    // 베트남어 성조가 분리형(NFD)으로 오면 키워드 오매칭이 생기므로 결합형으로 통일한다
    let title = decodeEntities(text(it.title)).normalize("NFC");
    const link = extractLink(it.link);
    if (!title || !link) continue;
    if (req.excludeLink?.test(link)) continue;

    const dateStr = text(it.pubDate) || text(it.published) || text(it.updated);
    const publishedAt = dateStr ? Date.parse(dateStr) : NaN;
    if (Number.isFinite(publishedAt) && now - publishedAt > maxAge) continue;
    if (req.fromMs != null && !(publishedAt >= req.fromMs)) continue;
    if (req.toMs != null && !(publishedAt <= req.toMs)) continue;

    // Google News 제목은 "제목 - 언론사" 형식이고 <source>에 언론사명이 있다
    const publisher = decodeEntities(text(it.source)).normalize("NFC") || req.publisher || "";
    if (publisher && title.endsWith(` - ${publisher}`)) title = title.slice(0, -(publisher.length + 3));
    if (!passesTitle(title, req)) continue;

    out.push({ title, link, publisher, publishedAt: Number.isFinite(publishedAt) ? publishedAt : now });
  }
  return out;
}

function passesTitle(title: string, req: FeedRequest) {
  if (req.excludeTitle?.test(title)) return false;
  return [req.mustMatch ?? []].flat().every((re) => re.test(title));
}

// PubMed 검색 주소 (NCBI E-utilities). 날짜는 PubMed 등록일(edat) 기준, 양끝 포함
export function pubmedSearch(term: string, from: string, to: string, max = 30) {
  const d = (s: string) => s.replace(/-/g, "/");
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=pub_date&datetype=edat&mindate=${d(from)}&maxdate=${d(to)}&retmax=${max}&term=${encodeURIComponent(term)}`;
}

type PubmedDoc = {
  title?: string;
  source?: string;
  sortpubdate?: string;
  history?: { pubstatus?: string; date?: string }[];
};

// esearch로 PMID를 받고 esummary로 제목·학술지·등록일을 받는다 (요청 2번)
async function fetchPubmed(req: FeedRequest): Promise<Headline[]> {
  const get = async (url: string) => {
    const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
    if (!res.ok) throw new Error(`PubMed HTTP ${res.status}`);
    return res.json();
  };
  const ids: string[] = (await get(req.url))?.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];
  const result = (await get(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`))?.result ?? {};
  const out: Headline[] = [];
  for (const id of ids) {
    const doc = result[id] as PubmedDoc | undefined;
    // 논문 제목의 <i>학명</i> 같은 태그와 끝 마침표를 지운다
    const title = decodeEntities(doc?.title ?? "").replace(/<[^>]+>/g, "").normalize("NFC").replace(/\.$/, "").trim();
    if (!title || !passesTitle(title, req)) continue;
    // 등록일(entrez)을 날짜로 쓴다. 인쇄 발행일은 몇 달 뒤일 수 있어서
    const entrez = doc?.history?.find((h) => h.pubstatus === "entrez")?.date ?? doc?.sortpubdate ?? "";
    let publishedAt = Date.parse(entrez.slice(0, 10).replace(/\//g, "-") + "T00:00:00+07:00");
    // 검색 조건상 등록일은 요청 구간 안이다. 등록일이 없어 발행일로 대신했을 때만 구간 밖일 수 있어 구간 끝에 맞춘다
    if (req.fromMs != null && publishedAt < req.fromMs) publishedAt = req.fromMs;
    if (req.toMs != null && publishedAt > req.toMs) publishedAt = req.toMs;
    out.push({
      title,
      link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      publisher: doc?.source ? `PubMed · ${doc.source}` : "PubMed",
      publishedAt: Number.isFinite(publishedAt) ? publishedAt : Date.now(),
    });
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
