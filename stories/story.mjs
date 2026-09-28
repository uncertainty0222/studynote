#!/usr/bin/env node
// story.mjs — 투어 가이드 스토리 DB CLI (의존성 0, Node 18+)
//
//   node stories/story.mjs add            < story.json   (stdin JSON 한 건 저장)
//   node stories/story.mjs list [--place 경복궁] [--tag 조선] [--status todo]
//   node stories/story.mjs search <키워드>
//   node stories/story.mjs show <id>
//   node stories/story.mjs hooks          (아직 안 풀어본 '다음 꼭지' 목록)
//   node stories/story.mjs tags
//
// 저장소: stories/stories.jsonl (한 줄 = 한 이야기). 컨테이너는 휘발성이므로
// 저장 후 반드시 git commit + push 해야 보존된다.

import { readFileSync, appendFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DB = process.env.STORY_DB || join(dirname(fileURLToPath(import.meta.url)), 'stories.jsonl');
const CRED = { fact: '사실', disputed: '논쟁', legend: '전설/야사' };

// ── 공통 유틸 ────────────────────────────────────────────────
function parseFlags(argv) {
  const out = { _pos: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) { out[key] = true; }
      else { out[key] = next; i++; }
    } else {
      out._pos.push(a);
    }
  }
  return out;
}

function load() {
  if (!existsSync(DB)) return [];
  return readFileSync(DB, 'utf8').split('\n').filter(Boolean).map((l, i) => {
    try { return JSON.parse(l); }
    catch { throw new Error(`stories.jsonl ${i + 1}번째 줄 JSON 파싱 실패`); }
  });
}

function slugify(s) {
  return String(s).trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

const text = (s) => [s.title, s.place, s.region, s.hook, s.story, s.action, s.sales,
  ...(s.tags || []), ...(s.facts || []).map((f) => f.claim),
  ...(s.related || []).map((r) => r.title)].filter(Boolean).join(' ').toLowerCase();

function row(s) {
  const tags = (s.tags || []).map((t) => `#${t}`).join(' ');
  return `${s.id}  |  ${s.title}  |  ${s.place || '-'}  ${tags}`;
}

// ── 검증 ────────────────────────────────────────────────────
function validate(s) {
  const errs = [];
  for (const k of ['title', 'place', 'hook', 'story']) {
    if (!s[k] || typeof s[k] !== 'string') errs.push(`'${k}' (문자열) 필수`);
  }
  if (!Array.isArray(s.facts) || s.facts.length === 0) {
    errs.push(`'facts' 배열 필수 — 이야기의 핵심 주장마다 {claim, status, source}`);
  } else {
    s.facts.forEach((f, i) => {
      if (!f.claim) errs.push(`facts[${i}].claim 필수`);
      if (!CRED[f.status]) errs.push(`facts[${i}].status 는 fact | disputed | legend 중 하나`);
      if (f.status === 'fact' && !f.source) errs.push(`facts[${i}] status=fact 이면 source 필수`);
    });
  }
  if (s.related && !Array.isArray(s.related)) errs.push(`'related' 는 배열`);
  return errs;
}

// ── 커맨드 ──────────────────────────────────────────────────
function cmdAdd(flags) {
  const raw = flags.file ? readFileSync(flags.file, 'utf8') : readStdin();
  if (!raw.trim()) throw new Error('저장할 JSON 이 없음. stdin 또는 --file 로 전달');
  const s = JSON.parse(raw);
  const errs = validate(s);
  if (errs.length) throw new Error('검증 실패:\n  - ' + errs.join('\n  - '));

  const all = load();
  s.id = s.id ? slugify(s.id) : slugify(`${s.place}-${s.title}`);
  s.tags = (s.tags || []).map((t) => String(t).replace(/^#/, ''));
  s.related = (s.related || []).map((r) => (typeof r === 'string' ? { title: r } : r));
  s.status = s.status || 'draft';
  s.created = s.created || new Date().toISOString().slice(0, 10);

  const idx = all.findIndex((x) => x.id === s.id);
  if (idx >= 0) {
    if (!flags.replace) throw new Error(`id '${s.id}' 이미 존재. 덮어쓰려면 --replace`);
    s.created = all[idx].created;
    s.updated = new Date().toISOString().slice(0, 10);
    all[idx] = s;
    writeFileSync(DB, all.map((x) => JSON.stringify(x)).join('\n') + '\n');
    console.log(`✓ 갱신됨 → ${s.id}`);
  } else {
    appendFileSync(DB, JSON.stringify(s) + '\n');
    console.log(`✓ 저장됨 → ${s.id}  (총 ${all.length + 1}건)`);
  }
  console.log('  ※ 컨테이너는 휘발성 — 보존하려면 커밋: git add stories/stories.jsonl && git commit');
}

function cmdList(flags) {
  let all = load();
  if (flags.place) all = all.filter((s) => (s.place || '').includes(flags.place) || (s.region || '').includes(flags.place));
  if (flags.tag) all = all.filter((s) => (s.tags || []).includes(String(flags.tag).replace(/^#/, '')));
  if (flags.status) all = all.filter((s) => s.status === flags.status);
  if (!all.length) return console.log('(결과 없음)');
  all.forEach((s) => console.log(row(s)));
  console.log(`\n${all.length}건`);
}

function cmdSearch(flags) {
  const q = flags._pos.join(' ').toLowerCase().trim();
  if (!q) throw new Error('검색어 필요: search <키워드>');
  const terms = q.split(/\s+/);
  const hits = load().filter((s) => { const t = text(s); return terms.every((w) => t.includes(w)); });
  if (!hits.length) return console.log(`'${q}' 관련 저장된 이야기 없음`);
  hits.forEach((s) => console.log(row(s)));
  console.log(`\n${hits.length}건`);
}

function cmdShow(flags) {
  const id = flags._pos[0];
  const s = load().find((x) => x.id === id);
  if (!s) throw new Error(`id '${id}' 없음. list 또는 search 로 확인`);
  const line = '─'.repeat(50);
  console.log(`${s.title}\n${line}`);
  console.log(`장소: ${s.place}${s.region ? ` (${s.region})` : ''}   상태: ${s.status}   저장: ${s.created}`);
  if (s.tags?.length) console.log(`태그: ${s.tags.map((t) => '#' + t).join(' ')}`);
  console.log(`\n[훅] ${s.hook}\n\n[이야기]\n${s.story}`);
  if (s.action) console.log(`\n[행동 유도] ${s.action}`);
  if (s.sales) console.log(`[매출 연결] ${s.sales}`);
  console.log(`\n[사실 검증]`);
  s.facts.forEach((f) => console.log(`  (${CRED[f.status]}) ${f.claim}${f.source ? `  — 출처: ${f.source}` : ''}`));
  if (s.related?.length) {
    console.log(`\n[다음 꼭지]`);
    s.related.forEach((r) => console.log(`  • ${r.title}${r.teaser ? ` — ${r.teaser}` : ''}`));
  }
}

function cmdHooks() {
  const all = load();
  const told = new Set(all.map((s) => s.title.trim()));
  const seen = new Map();
  for (const s of all) for (const r of s.related || []) {
    if (told.has(r.title.trim()) || seen.has(r.title)) continue;
    seen.set(r.title, { ...r, from: s.id });
  }
  if (!seen.size) return console.log('(대기 중인 꼭지 없음)');
  for (const r of seen.values()) console.log(`• ${r.title}${r.teaser ? ` — ${r.teaser}` : ''}   ← ${r.from}`);
  console.log(`\n${seen.size}개 꼭지 대기 중`);
}

function cmdTags() {
  const count = new Map();
  for (const s of load()) for (const t of s.tags || []) count.set(t, (count.get(t) || 0) + 1);
  if (!count.size) return console.log('(태그 없음)');
  [...count.entries()].sort((a, b) => b[1] - a[1]).forEach(([t, n]) => console.log(`#${t}  ${n}`));
}

function help() {
  console.log(`투어 가이드 스토리 DB  (저장소: ${DB})

  add [--file x.json] [--replace]   stdin/파일의 JSON 한 건 저장 (같은 id면 --replace 필요)
  list [--place X] [--tag X] [--status draft|ready|used]
  search <키워드...>                 제목·본문·태그·장소 전체에서 AND 검색
  show <id>                          한 건 전체 출력
  hooks                              아직 이야기로 만들지 않은 '다음 꼭지' 목록
  tags                               태그별 건수

JSON 필드: title, place, hook, story, facts[{claim,status,source}] 필수
           region, tags[], action, sales, related[{title,teaser}], sources[], status, id 선택
facts.status: fact(출처 필수) | disputed | legend`);
}

// ── main ────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);
try {
  switch (cmd) {
    case 'add': cmdAdd(flags); break;
    case 'list': cmdList(flags); break;
    case 'search': cmdSearch(flags); break;
    case 'show': cmdShow(flags); break;
    case 'hooks': cmdHooks(); break;
    case 'tags': cmdTags(); break;
    default: help();
  }
} catch (e) {
  console.error(`✗ ${e.message}`);
  process.exit(1);
}
