// format.mjs — 트윗 문구 만들기 + 트위터 가중 글자수 계산.
//
// 트위터 글자수 규칙(근사):
//   - 한글/CJK 등은 1글자당 2, 일반 ASCII 는 1
//   - URL 은 실제 길이와 무관하게 항상 23 (t.co 단축)
//   - 상한 280
// 브라우저 대시보드에서도 동일 규칙이 필요해서, 여기 로직을 문자열로도
// 내보내(dashboard.mjs 가 <script> 에 심는다) 서버/클라 동작을 일치시킨다.

export const TWEET_LIMIT = 280;
export const URL_WEIGHT = 23;

// CJK 대략 범위(한글, 한자, 가나 등) → 가중치 2
function isWide(cp) {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) || // 한글 자모
    (cp >= 0x2e80 && cp <= 0xa4cf) || // CJK 부수~한자 확장
    (cp >= 0xac00 && cp <= 0xd7a3) || // 한글 음절
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK 호환 한자
    (cp >= 0xff00 && cp <= 0xff60) || // 전각
    (cp >= 0x20000 && cp <= 0x3ffff) // CJK 확장 B+
  );
}

const URL_RE = /https?:\/\/[^\s]+/g;

// 가중 글자수 계산
export function weightedLength(text) {
  let s = String(text || '');
  let total = 0;
  // URL 을 먼저 23으로 치환 카운트
  const urls = s.match(URL_RE) || [];
  total += urls.length * URL_WEIGHT;
  s = s.replace(URL_RE, '');
  for (const ch of s) {
    total += isWide(ch.codePointAt(0)) ? 2 : 1;
  }
  return total;
}

// 템플릿으로 트윗 만들기. 길면 제목을 …로 줄여 280 안에 맞춘다.
export function buildTweet(post, cfg) {
  const tags = (cfg.hashtags && cfg.hashtags.length ? '\n\n' + cfg.hashtags.join(' ') : '');
  const render = (title) =>
    cfg.tweetTemplate
      .replace('{source}', post.sourceLabel || '')
      .replace('{title}', title)
      .replace('{url}', post.url) + tags;

  let title = post.title;
  let text = render(title);
  // 넘치면 제목을 한 글자씩 줄이며 맞춘다.
  while (weightedLength(text) > TWEET_LIMIT && title.length > 1) {
    title = title.slice(0, -1);
    text = render(title.replace(/[…\s]+$/, '') + '…');
  }
  return text;
}

// 브라우저에 심을 클라이언트용 계산 로직(위와 동일 규칙, 순수 JS 문자열).
export const CLIENT_TWEET_JS = `
const TWEET_LIMIT = ${TWEET_LIMIT};
const URL_WEIGHT = ${URL_WEIGHT};
const URL_RE = /https?:\\/\\/[^\\s]+/g;
function isWide(cp){return (cp>=0x1100&&cp<=0x11ff)||(cp>=0x2e80&&cp<=0xa4cf)||(cp>=0xac00&&cp<=0xd7a3)||(cp>=0xf900&&cp<=0xfaff)||(cp>=0xff00&&cp<=0xff60)||(cp>=0x20000&&cp<=0x3ffff);}
function weightedLength(text){let s=String(text||'');let total=0;const urls=s.match(URL_RE)||[];total+=urls.length*URL_WEIGHT;s=s.replace(URL_RE,'');for(const ch of s){total+=isWide(ch.codePointAt(0))?2:1;}return total;}
function intentUrl(text){return 'https://twitter.com/intent/tweet?text='+encodeURIComponent(text);}
`;
