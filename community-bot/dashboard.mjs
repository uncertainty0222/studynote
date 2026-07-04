// dashboard.mjs — 인기글 목록을 "딸깍 트윗" 대시보드 HTML 로 만든다.
//
// 각 카드: 순위/출처, 썸네일, 제목, 추천·댓글, 원문보기, 편집 가능한 트윗
// 문구(textarea), 실시간 글자수, [🐦 트위터에 올리기] 버튼(intent 링크),
// 이미지 저장 버튼(intent 는 미디어 첨부가 안 되므로 수동 첨부용).

import { buildTweet, CLIENT_TWEET_JS } from './format.mjs';

const esc = (s) =>
  String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function renderDashboard(posts, cfg, meta = {}) {
  const dateStr = meta.dateStr || '';
  const cards = posts
    .map((p, i) => {
      const tweet = buildTweet(p, cfg);
      const metaBits = [];
      if (p.score != null) metaBits.push(`👍 ${p.score}`);
      if (p.comments != null) metaBits.push(`💬 ${p.comments}`);
      if (p.author) metaBits.push(`✍️ ${esc(p.author)}`);
      if (p.when) metaBits.push(esc(p.when));
      const thumb = p.thumb
        ? `<a href="${esc(p.url)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(p.thumb)}" loading="lazy" alt=""></a>`
        : '';
      const imgBtns = (p.images || [])
        .filter(Boolean)
        .map(
          (src, k) =>
            `<a class="imgbtn" href="${esc(src)}" target="_blank" rel="noopener" download>🖼 이미지${(p.images.length > 1 ? ' ' + (k + 1) : '')}</a>`,
        )
        .join('');
      return `
      <article class="card" data-idx="${i}">
        <div class="rank">${i + 1}</div>
        <div class="body">
          <div class="src">${esc(p.sourceLabel || '')}</div>
          ${thumb}
          <h2 class="title"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></h2>
          <div class="meta">${metaBits.join(' · ')}</div>
          <textarea class="tweet" rows="4">${esc(tweet)}</textarea>
          <div class="row">
            <span class="count"></span>
            <div class="spacer"></div>
            ${imgBtns}
            <a class="src-link" href="${esc(p.url)}" target="_blank" rel="noopener">원문</a>
            <button class="post" type="button">🐦 트위터에 올리기</button>
          </div>
        </div>
      </article>`;
    })
    .join('\n');

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cfg.dashboardTitle)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:#0f1115; color:#e7e9ee;
    font-family: system-ui, -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
  header { position:sticky; top:0; z-index:5; background:#151822ee; backdrop-filter:blur(8px);
    border-bottom:1px solid #232838; padding:14px 18px; display:flex; align-items:baseline; gap:12px; }
  header h1 { font-size:17px; margin:0; }
  header .date { color:#8b93a7; font-size:13px; }
  header .hint { margin-left:auto; color:#8b93a7; font-size:12px; }
  main { max-width:820px; margin:0 auto; padding:16px; display:flex; flex-direction:column; gap:14px; }
  .card { display:flex; gap:12px; background:#161a24; border:1px solid #232838; border-radius:12px; padding:12px; }
  .rank { flex:0 0 28px; font-weight:700; color:#7c85f0; font-size:18px; text-align:center; }
  .body { flex:1; min-width:0; }
  .src { display:inline-block; font-size:11px; color:#9aa3ff; background:#1e2333; border:1px solid #2b3350;
    border-radius:999px; padding:2px 8px; margin-bottom:6px; }
  .thumb { max-height:220px; max-width:100%; border-radius:8px; display:block; margin:6px 0; }
  .title { font-size:15px; margin:4px 0 6px; line-height:1.4; }
  .title a { color:#e7e9ee; text-decoration:none; }
  .title a:hover { text-decoration:underline; }
  .meta { color:#8b93a7; font-size:12px; margin-bottom:8px; }
  textarea.tweet { width:100%; background:#0f1219; color:#e7e9ee; border:1px solid #2b3350;
    border-radius:8px; padding:8px; font:inherit; font-size:13px; resize:vertical; }
  .row { display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap; }
  .spacer { flex:1; }
  .count { font-size:12px; color:#8b93a7; }
  .count.over { color:#ff6b6b; font-weight:700; }
  .imgbtn, .src-link { font-size:12px; color:#9aa3ff; text-decoration:none; border:1px solid #2b3350;
    border-radius:6px; padding:5px 9px; }
  .imgbtn:hover, .src-link:hover { background:#1e2333; }
  button.post { background:#1d9bf0; color:#fff; border:0; border-radius:8px; padding:7px 14px;
    font:inherit; font-weight:700; font-size:13px; cursor:pointer; }
  button.post:hover { background:#1a8cd8; }
  footer { text-align:center; color:#5b6478; font-size:12px; padding:24px; }
  a.foot { color:#8b93a7; }
</style>
</head>
<body>
<header>
  <h1>${esc(cfg.dashboardTitle)}</h1>
  <span class="date">${esc(dateStr)}</span>
  <span class="hint">문구 확인·수정 후 <b>트위터에 올리기</b> → 작성창에서 게시</span>
</header>
<main>
  ${cards || '<p style="color:#8b93a7">가져온 글이 없습니다. --debug 로 셀렉터를 확인하세요.</p>'}
</main>
<footer>
  ${posts.length}개 · 생성 ${esc(meta.generatedAt || '')}<br>
  이미지는 인텐트로 자동첨부가 안 됩니다 — 🖼 버튼으로 저장 후 작성창에 직접 붙여넣으세요.
</footer>
<script>
${CLIENT_TWEET_JS}
document.querySelectorAll('.card').forEach((card) => {
  const ta = card.querySelector('.tweet');
  const cnt = card.querySelector('.count');
  const btn = card.querySelector('.post');
  const update = () => {
    const n = weightedLength(ta.value);
    cnt.textContent = n + ' / ' + TWEET_LIMIT;
    cnt.classList.toggle('over', n > TWEET_LIMIT);
  };
  ta.addEventListener('input', update);
  update();
  btn.addEventListener('click', () => {
    window.open(intentUrl(ta.value), '_blank', 'noopener');
  });
});
</script>
</body>
</html>`;
}
