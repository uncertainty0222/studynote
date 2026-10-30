#!/usr/bin/env node
// print.mjs — 저장된 이야기를 A4 출력본(HTML + PDF)으로 만든다
//
//   node stories/print.mjs <id> [<id> ...] [--out stories/print/파일명.pdf] [--title 문서제목]
//
// PDF 변환은 Playwright Chromium 을 쓴다 (없으면 HTML 만 만들고 브라우저 인쇄 안내).
// 한글 폰트: Noto Sans KR → Noto Sans CJK KR → WenQuanYi Zen Hei 순으로 시스템 폰트 사용.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const DB = process.env.STORY_DB || join(HERE, 'stories.jsonl');
const CRED = { fact: '사실', disputed: '논쟁·미확인', legend: '전설' };

function parseFlags(argv) {
  const out = { _pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1]; i++; }
    else out._pos.push(a);
  }
  return out;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const paras = (s) => esc(s).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
const marks = (html) => html.replace(/\[각색(\d+)\]/g, '<sup class="mark">각색$1</sup>');

function storyHtml(s, n) {
  const emb = s.embellishments || [];
  return `
<section class="story">
  <header>
    <div class="no">STORY ${n} · ${esc(s.tier || '초안')}</div>
    <h1>${esc(s.title)}</h1>
    <div class="meta">${esc(s.place)}${s.region ? ` · ${esc(s.region)}` : ''}${s.tags?.length ? ` · ${s.tags.map((t) => '#' + esc(t)).join(' ')}` : ''}</div>
  </header>

  <div class="hook"><span class="lbl">훅 · 첫 15초</span>${marks(esc(s.hook))}</div>

  <h2>현장 대본</h2>
  <div class="script">${marks(paras(s.story))}</div>
  ${s.impact ? `<div class="impact"><span class="lbl">강한 인상 한 문장</span>${esc(s.impact)}</div>` : ''}

  <div class="guide-only">
    <h2>각색 노트 <small>가이드 전용 · 손님에게 읽지 않음</small></h2>
    ${emb.length ? `<table class="emb">
      <thead><tr><th>#</th><th>대본 속 멘트</th><th>실제 팩트</th><th>"진짜예요?" 대응</th></tr></thead>
      <tbody>${emb.map((e, i) => `<tr>
        <td class="k">각색${i + 1}${e.type ? `<br><small>${esc(e.type)}</small>` : ''}</td>
        <td>${esc(e.line)}</td>
        <td>${esc(e.fact)}${e.source ? `<div class="src">출처: ${esc(e.source)}</div>` : ''}</td>
        <td>${esc(e.comeback || '')}</td></tr>`).join('')}</tbody>
    </table>` : '<p>각색 없음</p>'}

    ${s.emotion ? `<h3>감동 포인트</h3><div>${paras(s.emotion)}</div>` : ''}
    ${s.trust ? `<h3>신뢰 포인트 <small>각색 없음</small></h3><p>${esc(s.trust)}</p>` : ''}
    ${s.action ? `<h3>행동 유도 · 매출 연결</h3><div>${paras(s.action)}</div>` : ''}
    ${s.appendix ? `<h3>부록</h3><div>${paras(s.appendix)}</div>` : ''}
    ${s.sales ? `<p class="sales"><b>판매 메모</b> ${esc(s.sales)}</p>` : ''}

    <h3>사실 검증</h3>
    <table class="facts">
      <thead><tr><th>주장</th><th>등급</th><th>출처</th></tr></thead>
      <tbody>${s.facts.map((f) => `<tr><td>${esc(f.claim)}</td><td class="k">${CRED[f.status] || esc(f.status)}</td><td>${esc(f.source || '—')}</td></tr>`).join('')}</tbody>
    </table>

    ${s.related?.length ? `<h3>다음 꼭지</h3><ol class="rel">${s.related.map((r) => `<li><b>${esc(r.title)}</b>${r.teaser ? ` — ${esc(r.teaser)}` : ''}</li>`).join('')}</ol>` : ''}
  </div>
</section>`;
}

function page(title, stories) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
  @page { size: A4; margin: 16mm 15mm 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Noto Sans KR', 'Noto Sans CJK KR', 'WenQuanYi Zen Hei', sans-serif; color: #1d1d1f; font-size: 10.5pt; line-height: 1.6; margin: 0; }
  .story + .story { break-before: page; }
  header { border-bottom: 2px solid #1d1d1f; padding-bottom: 6px; margin-bottom: 12px; }
  .no { font-size: 8.5pt; letter-spacing: .15em; color: #7a6a3a; font-weight: 700; }
  h1 { font-size: 19pt; margin: 2px 0 4px; line-height: 1.3; }
  .meta { font-size: 8.5pt; color: #666; }
  h2 { font-size: 12.5pt; margin: 16px 0 6px; padding-left: 8px; border-left: 4px solid #c9a227; }
  h2 small, h3 small { font-size: 8pt; font-weight: 400; color: #a33; margin-left: 6px; }
  h3 { font-size: 11pt; margin: 14px 0 4px; }
  .lbl { display: block; font-size: 8pt; font-weight: 700; letter-spacing: .08em; color: #7a6a3a; margin-bottom: 2px; }
  .hook { background: #fbf6e6; border: 1px solid #e8dcb0; border-radius: 6px; padding: 9px 12px; font-size: 13pt; font-weight: 700; line-height: 1.45; }
  .script { font-size: 12pt; line-height: 1.85; }
  .script p { margin: 0 0 9px; }
  sup.mark { font-size: 7pt; color: #a33; border: 1px solid #a33; border-radius: 3px; padding: 0 3px; margin-left: 2px; font-weight: 700; vertical-align: super; }
  .impact { border-top: 1px dashed #bbb; border-bottom: 1px dashed #bbb; padding: 8px 2px; margin: 10px 0 4px; font-size: 12pt; font-weight: 700; }
  .guide-only { break-before: page; }
  .guide-only h2:first-child { margin-top: 0; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; line-height: 1.5; margin: 4px 0 6px; }
  th, td { border: 1px solid #ccc; padding: 5px 6px; vertical-align: top; text-align: left; }
  th { background: #f2f2f2; font-weight: 700; }
  td.k { white-space: nowrap; font-weight: 700; }
  .emb td:nth-child(2) { width: 24%; } .emb td:nth-child(3) { width: 40%; }
  .facts td:nth-child(2) { width: 13%; } .facts td:nth-child(3) { width: 32%; }
  .src { color: #777; font-size: 8pt; margin-top: 3px; }
  .sales { font-size: 9.5pt; color: #444; }
  .rel { margin: 4px 0; padding-left: 20px; font-size: 9.5pt; }
  p { margin: 0 0 6px; }
  tr { break-inside: avoid; }
</style></head><body>
${stories.map((s, i) => storyHtml(s, i + 1)).join('\n')}
</body></html>`;
}

async function toPdf(htmlPath, pdfPath) {
  const require = createRequire(import.meta.url);
  let pw;
  for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
    try { pw = require(p); break; } catch { /* 다음 후보 */ }
  }
  if (!pw) return false;
  const browser = await pw.chromium.launch();
  const pg = await browser.newPage();
  await pg.goto(pathToFileURL(htmlPath).href);
  await pg.pdf({ path: pdfPath, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await browser.close();
  return true;
}

const flags = parseFlags(process.argv.slice(2));
try {
  if (!flags._pos.length) throw new Error('출력할 id 필요: node stories/print.mjs <id> [<id> ...] [--out x.pdf]');
  const all = readFileSync(DB, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const picked = flags._pos.map((id) => {
    const s = all.find((x) => x.id === id);
    if (!s) throw new Error(`id '${id}' 없음. node stories/story.mjs list 로 확인`);
    return s;
  });
  const pdfPath = resolve(flags.out || join(HERE, 'print', `${flags._pos[0]}.pdf`));
  const htmlPath = pdfPath.replace(/\.pdf$/i, '') + '.html';
  mkdirSync(dirname(pdfPath), { recursive: true });
  writeFileSync(htmlPath, page(flags.title || picked[0].title, picked));
  console.log(`✓ HTML → ${htmlPath}`);
  if (await toPdf(htmlPath, pdfPath)) console.log(`✓ PDF  → ${pdfPath}`);
  else console.log('  (Playwright 없음 — HTML 을 브라우저로 열어 인쇄 → PDF 저장)');
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
