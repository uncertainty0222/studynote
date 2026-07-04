#!/usr/bin/env node
// bot.mjs — 커뮤니티 일일 인기글 → "딸깍 트윗" 대시보드 봇 (메인 CLI)
//
//   node bot.mjs                # 스크래핑 → out/index.html 생성 (+ 텔레그램 알림)
//   node bot.mjs --debug        # 스크래핑 상세 로그(셀렉터 점검용)
//   node bot.mjs --sample       # 네트워크 없이 샘플 데이터로 대시보드만 생성(UX 확인용)
//   node bot.mjs --serve[=PORT] # out/index.html 을 웹서버로 제공(기본 8080, Railway용)
//   node bot.mjs --once --serve # 한 번 스크래핑 후 서버 유지
//
// 텔레그램: 환경변수 TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID 있으면 자동 알림.
// 자세한 사용법/배포는 README.md 참고.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { config } from './config.mjs';
import { scrapeSource } from './sources.mjs';
import { renderDashboard } from './dashboard.mjs';
import { buildTweet } from './format.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, config.outDir);
const OUT_HTML = join(OUT_DIR, 'index.html');

// ── 인자 파싱 ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f) => {
  const a = args.find((x) => x.startsWith(f + '='));
  return a ? a.slice(f.length + 1) : null;
};
const opts = {
  debug: has('--debug'),
  sample: has('--sample'),
  serve: has('--serve') || val('--serve') != null,
  once: has('--once'),
  port: parseInt(val('--serve') || process.env.PORT || '8080', 10),
};

// ── 한국시간(KST) 날짜 문자열 ──────────────────────────────────
function kstNow() {
  const d = new Date();
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return {
    date: `${kst.getUTCFullYear()}-${p(kst.getUTCMonth() + 1)}-${p(kst.getUTCDate())}`,
    time: `${p(kst.getUTCHours())}:${p(kst.getUTCMinutes())}`,
  };
}

// ── 필터/정렬 적용 ─────────────────────────────────────────────
function applyFilters(posts, cfg) {
  const bad = (cfg.excludeKeywords || []).map((s) => s.toLowerCase());
  let out = posts.filter((p) => {
    const t = p.title.toLowerCase();
    if (bad.some((k) => k && t.includes(k))) return false;
    if (cfg.minScore > 0 && p.score != null && p.score < cfg.minScore) return false;
    return true;
  });
  // 추천수가 있으면 높은 순, 없으면 원래 순서 유지.
  out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  return out.slice(0, cfg.maxPosts);
}

// ── 스크래핑 파이프라인 ────────────────────────────────────────
async function collect(cfg) {
  const enabled = cfg.sources.filter((s) => s.enabled);
  if (!enabled.length) throw new Error('config.sources 에 enabled 소스가 없습니다.');
  const all = [];
  for (const src of enabled) {
    try {
      const posts = await scrapeSource(src, cfg, opts);
      if (opts.debug) console.error(`[debug] ${src.adapter}: ${posts.length}개 수집`);
      all.push(...posts);
    } catch (e) {
      console.error(`⚠️  ${src.adapter} 수집 실패: ${e.message}`);
    }
  }
  return applyFilters(all, cfg);
}

// ── 텔레그램 알림(선택) ────────────────────────────────────────
async function notifyTelegram(posts, cfg, when) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!cfg.telegram.enabled || !token || !chatId) return;
  const url = cfg.telegram.dashboardPublicUrl;
  const lines = [
    `🔥 오늘의 인기글 ${posts.length}개 준비됨 (${when.date} ${when.time} KST)`,
    url ? `\n대시보드에서 딸깍: ${url}` : '',
    '',
    ...posts.slice(0, 10).map((p, i) => {
      const tw = buildTweet(p, cfg);
      const intent = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tw);
      return `${i + 1}. ${p.title}\n   원문: ${p.url}\n   트윗: ${intent}`;
    }),
  ];
  const text = lines.filter((l) => l !== null).join('\n');
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) console.error(`⚠️  텔레그램 전송 실패: HTTP ${res.status}`);
    else console.log('📲 텔레그램 알림 전송 완료');
  } catch (e) {
    console.error(`⚠️  텔레그램 전송 오류: ${e.message}`);
  }
}

// ── 대시보드 생성 ──────────────────────────────────────────────
async function buildOnce() {
  const when = kstNow();
  let posts;
  if (opts.sample) {
    const sample = JSON.parse(readFileSync(join(HERE, 'sample-data.json'), 'utf8'));
    posts = applyFilters(sample, config);
    console.log(`🧪 샘플 모드: ${posts.length}개`);
  } else {
    console.log(`🔎 수집 시작 (engine=${config.engine})...`);
    posts = await collect(config);
    console.log(`✅ ${posts.length}개 수집 완료`);
  }
  const html = renderDashboard(posts, config, {
    dateStr: `${when.date} ${when.time} KST`,
    generatedAt: `${when.date} ${when.time}`,
  });
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_HTML, html, 'utf8');
  // 날짜별 사본도 남긴다(히스토리).
  writeFileSync(join(OUT_DIR, `${when.date}.html`), html, 'utf8');
  console.log(`📄 대시보드 생성: ${OUT_HTML}`);
  if (!opts.sample) await notifyTelegram(posts, config, when);
  return posts.length;
}

// ── 정적 서버(Railway 배포용) ──────────────────────────────────
function serve(port) {
  const srv = createServer((req, res) => {
    if (req.url === '/healthz') {
      res.writeHead(200).end('ok');
      return;
    }
    try {
      const html = readFileSync(OUT_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    } catch {
      res
        .writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' })
        .end('<h1>아직 대시보드가 없습니다</h1><p>먼저 스크래핑을 실행하세요.</p>');
    }
  });
  srv.listen(port, () => console.log(`🌐 대시보드 서버: http://localhost:${port}`));
}

// ── 엔트리 ─────────────────────────────────────────────────────
(async () => {
  try {
    // --serve 만 주면(스크래핑 없이) 기존 파일 서빙. --once 면 먼저 수집.
    if (opts.serve && !opts.once && !opts.sample) {
      serve(opts.port);
      return;
    }
    await buildOnce();
    if (opts.serve) serve(opts.port);
  } catch (e) {
    console.error(`❌ ${e.stack || e.message}`);
    process.exit(1);
  }
})();
