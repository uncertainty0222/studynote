// sources.mjs — 커뮤니티 사이트에서 일일 인기글을 긁어오는 어댑터 모음.
//
// 각 어댑터는 post 배열을 돌려준다:
//   { id, title, url, thumb, images[], score, comments, author, when, sourceLabel }
//
// 엔진은 두 가지:
//   - playwright: 실제 크롬. Cloudflare/JS 렌더 대응(권장, 기본값).
//   - fetch     : 단순 HTTP + 정규식 파싱. 가볍지만 봇차단에 약함.
//
// ⚠️ 중요: 커뮤니티 사이트는 HTML 구조를 수시로 바꾼다. 아래 셀렉터는
//    "합리적 초기값"이며, 실제로 돌리는 환경(사이트가 열리는 곳)에서 한 번
//    확인하고 필요하면 selectors 를 손봐야 한다. --debug 로 원인 파악.

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ── 절대 URL 로 정규화 ─────────────────────────────────────────
function absUrl(href, base) {
  if (!href) return '';
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

// ── 어댑터 정의 ────────────────────────────────────────────────
// 각 어댑터: { listUrl, base, extract(document-like) }
// extract 는 브라우저 안(page.evaluate) 혹은 fetch 파싱 양쪽에서 쓸 수 있게
// "행(row) 목록 → post" 매핑 규칙을 셀렉터로 기술한다.
export const ADAPTERS = {
  // 일베 일간베스트: 메인의 베스트 리스트. 추천 많은 순으로 노출.
  ilbe: {
    // 일간베스트 정렬 리스트. 사이트 개편 시 이 URL만 바꾸면 된다.
    listUrl: 'https://www.ilbe.com/list/ilbe?listStyle=list&searchType=all&orderby=recommend',
    base: 'https://www.ilbe.com',
    selectors: {
      row: '.board-body tr, ul.board-body li, .list-block',
      title: '.title a, a.subject, td.title a',
      score: '.recommend, .num-recommend, td.recommend',
      comments: '.comment, .num-comment, .reply-num',
      author: '.nick, .writer, td.name',
      when: '.date, td.date, time',
      thumb: 'img',
    },
  },

  // 디시인사이드 특정 갤러리 "개념글"(추천 많은 글) 리스트.
  // gallId 는 config 에서 주입된다.
  dcgall: {
    listUrl: (o) =>
      `https://gall.dcinside.com/board/lists/?id=${o.gallId}&exception_mode=recommend`,
    base: 'https://gall.dcinside.com',
    selectors: {
      row: 'tr.ub-content',
      title: 'td.gall_tit a:not(.reply_numbox)',
      score: 'td.gall_recommend',
      comments: 'td.gall_tit a.reply_numbox .reply_num',
      author: 'td.gall_writer .nickname, td.gall_writer',
      when: 'td.gall_date',
      thumb: 'td.gall_tit a img',
    },
  },

  // 디시 실시간베스트(정치성향 혼재, 참고용).
  dcbest: {
    listUrl: 'https://gall.dcinside.com/board/lists/?id=dcbest',
    base: 'https://gall.dcinside.com',
    selectors: {
      row: 'tr.ub-content',
      title: 'td.gall_tit a:not(.reply_numbox)',
      score: 'td.gall_recommend',
      comments: 'td.gall_tit a.reply_numbox .reply_num',
      author: 'td.gall_writer .nickname, td.gall_writer',
      when: 'td.gall_date',
      thumb: 'td.gall_tit a img',
    },
  },
};

// 브라우저 안에서 실행될 추출 함수(문자열로 넘겨 page.evaluate 로 실행).
// DOM 파싱 로직을 한 곳에 두어 playwright/fetch 어느 쪽이든 재사용.
function domExtract(sel, base) {
  const rows = Array.from(document.querySelectorAll(sel.row));
  const num = (t) => {
    const m = String(t || '').replace(/[^\d]/g, '');
    return m ? parseInt(m, 10) : 0;
  };
  const abs = (h) => {
    if (!h) return '';
    try {
      return new URL(h, base).href;
    } catch {
      return h;
    }
  };
  const out = [];
  for (const row of rows) {
    const a = row.querySelector(sel.title);
    if (!a) continue;
    const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
    const url = abs(a.getAttribute('href'));
    if (!title || !url) continue;
    const img = row.querySelector(sel.thumb);
    const thumb = img ? abs(img.getAttribute('src') || img.getAttribute('data-src')) : '';
    const scoreEl = sel.score && row.querySelector(sel.score);
    const cmtEl = sel.comments && row.querySelector(sel.comments);
    const authEl = sel.author && row.querySelector(sel.author);
    const whenEl = sel.when && row.querySelector(sel.when);
    out.push({
      title,
      url,
      thumb,
      score: scoreEl ? num(scoreEl.textContent) : null,
      comments: cmtEl ? num(cmtEl.textContent) : null,
      author: authEl ? (authEl.textContent || '').trim().replace(/\s+/g, ' ') : '',
      when: whenEl ? (whenEl.textContent || '').trim() : '',
    });
  }
  return out;
}

// ── Playwright 엔진 ────────────────────────────────────────────
async function scrapeWithPlaywright(adapter, cfg, opts) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      "playwright 모듈이 없습니다. `npm i` 후 다시 실행하거나 config.engine='fetch' 로 바꾸세요.",
    );
  }
  const launchOpts = { headless: cfg.headless };
  if (cfg.browserExecutable) launchOpts.executablePath = cfg.browserExecutable;
  const browser = await chromium.launch(launchOpts);
  try {
    const ctx = await browser.newContext({ userAgent: UA, locale: 'ko-KR' });
    const page = await ctx.newPage();
    await page.goto(adapter.listUrl, {
      waitUntil: 'domcontentloaded',
      timeout: cfg.navTimeoutMs,
    });
    // Cloudflare/지연 렌더 대비 살짝 대기 후 행이 나타나길 기다린다.
    await page
      .waitForSelector(adapter.selectors.row, { timeout: cfg.navTimeoutMs })
      .catch(() => {});
    if (opts.debug) {
      const html = await page.content();
      console.error(`[debug] ${adapter.listUrl} → ${html.length} bytes HTML`);
    }
    const rows = await page.evaluate(
      ([sel, base]) => {
        // domExtract 를 인라인(브라우저 컨텍스트라 import 불가)
        const rows = Array.from(document.querySelectorAll(sel.row));
        const num = (t) => {
          const m = String(t || '').replace(/[^\d]/g, '');
          return m ? parseInt(m, 10) : 0;
        };
        const abs = (h) => {
          if (!h) return '';
          try {
            return new URL(h, base).href;
          } catch {
            return h;
          }
        };
        const out = [];
        for (const row of rows) {
          const a = row.querySelector(sel.title);
          if (!a) continue;
          const title = (a.textContent || '').trim().replace(/\s+/g, ' ');
          const url = abs(a.getAttribute('href'));
          if (!title || !url) continue;
          const img = row.querySelector(sel.thumb);
          const thumb = img
            ? abs(img.getAttribute('src') || img.getAttribute('data-src'))
            : '';
          const scoreEl = sel.score && row.querySelector(sel.score);
          const cmtEl = sel.comments && row.querySelector(sel.comments);
          const authEl = sel.author && row.querySelector(sel.author);
          const whenEl = sel.when && row.querySelector(sel.when);
          out.push({
            title,
            url,
            thumb,
            score: scoreEl ? num(scoreEl.textContent) : null,
            comments: cmtEl ? num(cmtEl.textContent) : null,
            author: authEl ? (authEl.textContent || '').trim().replace(/\s+/g, ' ') : '',
            when: whenEl ? (whenEl.textContent || '').trim() : '',
          });
        }
        return out;
      },
      [adapter.selectors, adapter.base],
    );
    return rows;
  } finally {
    await browser.close();
  }
}

// ── fetch 엔진(경량 폴백) ──────────────────────────────────────
// 정규식 기반이라 사이트마다 정확도가 다르다. 우선은 playwright 권장.
async function scrapeWithFetch(adapter, cfg, opts) {
  const res = await fetch(adapter.listUrl, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' },
    signal: AbortSignal.timeout(cfg.navTimeoutMs),
  });
  if (opts.debug) console.error(`[debug] fetch ${adapter.listUrl} → HTTP ${res.status}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} (${adapter.listUrl})`);
  const html = await res.text();
  // 아주 단순한 링크 추출: 제목 셀렉터의 첫 태그/클래스를 정규식으로 근사.
  // 정교한 파싱이 필요하면 playwright 엔진을 쓰거나 cheerio 를 추가하라.
  const out = [];
  const anchor = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = anchor.exec(html))) {
    const url = absUrl(m[1], adapter.base);
    const title = m[2].replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
    if (title.length < 4) continue;
    // 게시글 링크로 보이는 것만(view/read/숫자 id 포함) 러프하게 필터.
    if (!/(view|read|no=|\/\d{3,})/i.test(url)) continue;
    out.push({ title, url, thumb: '', score: null, comments: null, author: '', when: '' });
  }
  return out;
}

// ── 공개 함수: 어댑터 하나 스크래핑 ────────────────────────────
export async function scrapeSource(srcCfg, cfg, opts = {}) {
  const base = ADAPTERS[srcCfg.adapter];
  if (!base) throw new Error(`알 수 없는 adapter: ${srcCfg.adapter}`);
  // listUrl 이 함수면 소스별 옵션(gallId 등) 주입.
  const adapter = {
    ...base,
    listUrl: typeof base.listUrl === 'function' ? base.listUrl(srcCfg) : base.listUrl,
  };
  const raw =
    cfg.engine === 'fetch'
      ? await scrapeWithFetch(adapter, cfg, opts)
      : await scrapeWithPlaywright(adapter, cfg, opts);

  // 중복 제거 + 소스 라벨/id 부여 + 이미지 배열화.
  const seen = new Set();
  const posts = [];
  for (const r of raw) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    posts.push({
      id: r.url,
      title: r.title,
      url: r.url,
      thumb: r.thumb || '',
      images: r.thumb ? [r.thumb] : [],
      score: r.score,
      comments: r.comments,
      author: r.author || '',
      when: r.when || '',
      sourceLabel: srcCfg.label || srcCfg.adapter,
    });
  }
  return posts;
}

// domExtract 는 fetch+jsdom 확장 시 재사용하려고 export 해 둔다.
export { domExtract };
