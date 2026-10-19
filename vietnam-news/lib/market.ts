// 나트랑 장터: 교민 중고거래 (최소 기능).
// - 글쓰기·연락처 보기는 카카오 로그인 회원만. 거래 연락은 판매자가 적은 카카오톡 ID·오픈채팅 링크로 한다
// - 사진은 브라우저에서 줄여 보낸 JPEG를 Postgres에 그대로 저장한다 (별도 저장소 없이 시작)
// - 신고가 서로 다른 회원 3명에게서 쌓이면 자동으로 숨기고, 운영자가 /admin 에서 확인한다
// - 끌어올리기: 마지막으로 올리거나 끌어올린 지 24시간이 지나면 다시 맨 위로 (글당 10회)
// - 목록 정리: 30일 동안 끌어올리지 않은 판매중·예약중 글과, 판매완료 후 7일 지난 글은 목록에서 빠진다
//   (지우지는 않는다. 작성자의 '내 글'과 글 주소로는 계속 볼 수 있고, 끌어올리면 다시 목록에 나온다)

import { query } from "./db";

export const CATEGORIES = ["가전·디지털", "가구·생활", "주방", "유아동", "의류·잡화", "도서·취미", "오토바이·차량", "티켓·쿠폰", "기타"] as const;
export const AREAS = ["나트랑 시내", "나트랑 북부", "나트랑 남부", "깜라인", "기타"] as const;
export const STATUSES = { selling: "판매중", reserved: "예약중", sold: "판매완료" } as const;
export type ItemStatus = keyof typeof STATUSES;

export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 600_000; // 브라우저에서 줄인 뒤 장당 상한
export const DAILY_POST_LIMIT = 10;
const AUTO_HIDE_REPORTS = 3;
export const BUMP_INTERVAL_HOURS = 24;
export const MAX_BUMPS = 10;
const EXPIRE_DAYS = 30; // 끌어올리지 않으면 목록에서 빠지기까지
const SOLD_VISIBLE_DAYS = 7; // 판매완료 후 목록에 남는 기간

export type ItemSummary = {
  id: number;
  title: string;
  price: number; // 동. 0이면 나눔
  category: string;
  area: string;
  status: ItemStatus;
  createdAt: number;
  bumpedAt: number; // 처음 올린 시각 또는 마지막 끌어올린 시각 (목록 순서 기준)
  bumped: boolean; // 한 번이라도 끌어올렸는지
  expired: boolean; // 오래돼 목록에서 빠진 글 (내 글에서만 보임)
  thumbId: number | null;
  likes: number;
};

export type ItemDetail = ItemSummary & {
  bumpCount: number;
  description: string;
  contact: string;
  sellerId: string;
  sellerAlias: string;
  sellerAvatar: string;
  imageIds: number[];
  likedByMe: boolean;
  hidden: boolean;
};

let ready: Promise<void> | null = null;
// 장터 표는 처음 쓸 때 만든다 (뉴스만 쓰는 배포에는 영향 없음)
function ensureTables() {
  ready ??= query(`
    create table if not exists market_items (
      id serial primary key,
      seller_id bigint not null references members(kakao_id),
      title text not null,
      description text not null default '',
      price bigint not null default 0,
      category text not null,
      area text not null,
      contact text not null,
      status text not null default 'selling',
      hidden boolean not null default false,
      deleted boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table market_items add column if not exists bumped_at timestamptz not null default now();
    alter table market_items add column if not exists bump_count integer not null default 0;
    alter table market_items add column if not exists sample boolean not null default false; -- 운영자 테스트 글
    create index if not exists market_items_list on market_items(deleted, hidden, bumped_at desc);
    create table if not exists market_images (
      id serial primary key,
      item_id integer not null references market_items(id) on delete cascade,
      position integer not null,
      thumb bytea not null,
      full_image bytea not null
    );
    create index if not exists market_images_item on market_images(item_id, position);
    create table if not exists market_likes (
      item_id integer not null references market_items(id) on delete cascade,
      kakao_id bigint not null,
      created_at timestamptz not null default now(),
      primary key (item_id, kakao_id)
    );
    create table if not exists market_reports (
      id serial primary key,
      item_id integer not null references market_items(id) on delete cascade,
      reporter_id bigint not null,
      reason text not null default '',
      created_at timestamptz not null default now(),
      unique (item_id, reporter_id)
    );
  `).then(() => undefined);
  ready.catch(() => {
    ready = null;
  });
  return ready;
}

type Row = {
  id: number;
  title: string;
  price: string;
  category: string;
  area: string;
  status: ItemStatus;
  created_at: Date;
  bumped_at: Date;
  bump_count: number;
  expired: boolean;
  thumb_id: number | null;
  likes: string;
};

function toSummary(r: Row): ItemSummary {
  return {
    id: r.id,
    title: r.title,
    price: Number(r.price),
    category: r.category,
    area: r.area,
    status: r.status,
    createdAt: r.created_at.getTime(),
    bumpedAt: r.bumped_at.getTime(),
    bumped: r.bump_count > 0,
    expired: r.expired,
    thumbId: r.thumb_id,
    likes: Number(r.likes),
  };
}

const SUMMARY_COLUMNS = `
  i.id, i.title, i.price, i.category, i.area, i.status, i.created_at, i.bumped_at, i.bump_count,
  (case when i.status = 'sold' then i.updated_at < now() - interval '${SOLD_VISIBLE_DAYS} days'
        else i.bumped_at < now() - interval '${EXPIRE_DAYS} days' end) as expired,
  (select m.id from market_images m where m.item_id = i.id order by m.position limit 1) as thumb_id,
  (select count(*) from market_likes l where l.item_id = i.id) as likes`;

export type ListFilter = {
  q?: string;
  category?: string;
  free?: boolean; // 나눔만
  hideSold?: boolean;
  mine?: string; // 회원번호: 내 글
  liked?: string; // 회원번호: 관심 목록
  limit?: number;
};

export async function listItems(f: ListFilter): Promise<ItemSummary[]> {
  await ensureTables();
  const where = ["not i.deleted"];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  // 숨김 글은 작성자 본인의 '내 글'에서만 보인다
  // 오래된 글은 공개 목록에서 빠지고 '내 글'에서만 보인다
  if (f.mine) where.push(`i.seller_id = ${p(f.mine)}`);
  else {
    where.push("not i.hidden");
    if (!f.liked)
      where.push(`(case when i.status = 'sold' then i.updated_at >= now() - interval '${SOLD_VISIBLE_DAYS} days'
                        else i.bumped_at >= now() - interval '${EXPIRE_DAYS} days' end)`);
  }
  if (f.liked) where.push(`exists(select 1 from market_likes l where l.item_id = i.id and l.kakao_id = ${p(f.liked)})`);
  if (f.category) where.push(`i.category = ${p(f.category)}`);
  if (f.free) where.push("i.price = 0");
  if (f.hideSold) where.push("i.status <> 'sold'");
  if (f.q?.trim()) where.push(`(i.title ilike ${p(`%${f.q.trim()}%`)} or i.description ilike $${params.length})`);
  const rows = await query<Row>(
    `select ${SUMMARY_COLUMNS} from market_items i where ${where.join(" and ")}
     order by (i.status = 'sold'), i.bumped_at desc limit ${Math.min(f.limit ?? 60, 200)}`,
    params,
  );
  return rows.map(toSummary);
}

// 탈퇴한 회원의 장터 기록을 지운다 (글을 지우면 사진·관심·신고도 함께 지워진다)
export async function purgeMember(id: string) {
  await ensureTables();
  await query(`delete from market_items where seller_id = $1`, [id]);
  await query(`delete from market_likes where kakao_id = $1`, [id]);
  await query(`delete from market_reports where reporter_id = $1`, [id]);
}

export async function getItem(id: number, viewerId: string | null): Promise<ItemDetail | null> {
  await ensureTables();
  const rows = await query<
    Row & { description: string; contact: string; seller_id: string; alias: string | null; avatar: string | null; hidden: boolean; liked: boolean }
  >(
    `select ${SUMMARY_COLUMNS}, i.description, i.contact, i.seller_id::text, m.alias, m.avatar, i.hidden,
       exists(select 1 from market_likes l where l.item_id = i.id and l.kakao_id = $2) as liked
     from market_items i join members m on m.kakao_id = i.seller_id
     where i.id = $1 and not i.deleted`,
    [id, viewerId ?? 0],
  );
  const r = rows[0];
  if (!r) return null;
  const images = await query<{ id: number }>(`select id from market_images where item_id = $1 order by position`, [id]);
  return {
    ...toSummary(r),
    bumpCount: r.bump_count,
    description: r.description,
    contact: r.contact,
    sellerId: r.seller_id,
    sellerAlias: r.alias ?? "회원",
    sellerAvatar: r.avatar ?? "",
    imageIds: images.map((i) => i.id),
    likedByMe: r.liked,
    hidden: r.hidden,
  };
}

export type NewItem = {
  title: string;
  description: string;
  price: number;
  category: string;
  area: string;
  contact: string;
  photos: { thumb: Buffer; full: Buffer }[];
};

// 입력 검사. 문제가 있으면 한국어 오류 문구, 없으면 null
export function validateItem(n: NewItem): string | null {
  if (!n.title.trim() || n.title.length > 60) return "제목은 1~60자로 적어 주세요.";
  if (n.description.length > 3000) return "설명은 3,000자 이내로 적어 주세요.";
  if (!Number.isFinite(n.price) || n.price < 0 || n.price > 10_000_000_000) return "가격을 확인해 주세요.";
  if (!(CATEGORIES as readonly string[]).includes(n.category)) return "카테고리를 골라 주세요.";
  if (!(AREAS as readonly string[]).includes(n.area)) return "거래 지역을 골라 주세요.";
  if (!n.contact.trim() || n.contact.length > 120) return "카카오톡 ID나 오픈채팅 링크를 적어 주세요.";
  if (n.photos.length > MAX_PHOTOS) return `사진은 ${MAX_PHOTOS}장까지예요.`;
  if (n.photos.some((p) => p.full.length > MAX_PHOTO_BYTES || p.thumb.length > MAX_PHOTO_BYTES)) return "사진 용량이 너무 커요.";
  if (n.photos.some((p) => !isJpeg(p.full) || !isJpeg(p.thumb))) return "사진 형식을 읽지 못했어요.";
  return null;
}

function isJpeg(b: Buffer) {
  return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

export async function postsToday(sellerId: string) {
  await ensureTables();
  const rows = await query<{ n: string }>(
    `select count(*) as n from market_items where seller_id = $1 and created_at > now() - interval '1 day'`,
    [sellerId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function createItem(sellerId: string, n: NewItem): Promise<number> {
  await ensureTables();
  const rows = await query<{ id: number }>(
    `insert into market_items (seller_id, title, description, price, category, area, contact)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [sellerId, n.title.trim(), n.description.trim(), Math.round(n.price), n.category, n.area, n.contact.trim()],
  );
  const id = rows[0].id;
  for (const [i, photo] of n.photos.entries()) {
    await query(`insert into market_images (item_id, position, thumb, full_image) values ($1, $2, $3, $4)`, [
      id,
      i,
      photo.thumb,
      photo.full,
    ]);
  }
  return id;
}

// 상태 변경·삭제는 작성자 본인 또는 운영자만
export async function updateStatus(id: number, actorId: string, isAdmin: boolean, status: ItemStatus) {
  await ensureTables();
  const rows = await query(
    `update market_items set status = $3, updated_at = now() where id = $1 and not deleted and (seller_id = $2 or $4) returning id`,
    [id, actorId, status, isAdmin],
  );
  return rows.length > 0;
}

export async function deleteItem(id: number, actorId: string, isAdmin: boolean) {
  await ensureTables();
  const rows = await query(
    `update market_items set deleted = true, updated_at = now() where id = $1 and not deleted and (seller_id = $2 or $3) returning id`,
    [id, actorId, isAdmin],
  );
  if (rows.length) await query(`delete from market_images where item_id = $1`, [id]); // 지운 글의 사진은 바로 비운다
  return rows.length > 0;
}

// 끌어올리기: 작성자만, 판매완료가 아니고, 마지막 시각에서 24시간이 지났고, 10회 미만일 때
export async function bumpItem(id: number, sellerId: string): Promise<string | null> {
  await ensureTables();
  const rows = await query<{ id: number }>(
    `update market_items set bumped_at = now(), bump_count = bump_count + 1, updated_at = now()
     where id = $1 and seller_id = $2 and not deleted and status <> 'sold'
       and bumped_at < now() - interval '${BUMP_INTERVAL_HOURS} hours' and bump_count < ${MAX_BUMPS}
     returning id`,
    [id, sellerId],
  );
  return rows.length ? null : `끌어올리기는 ${BUMP_INTERVAL_HOURS}시간에 한 번, 글당 ${MAX_BUMPS}번까지예요.`;
}

// 운영자 테스트 글: 넣기·지우기 (sample 표시로 구분)
export async function insertSamples(sellerId: string, samples: Omit<NewItem, "photos">[], photos: Buffer[]) {
  await ensureTables();
  for (const [i, s] of samples.entries()) {
    const id = await createItem(sellerId, { ...s, photos: photos[i]?.length ? [{ full: photos[i], thumb: photos[i] }] : [] });
    // 목록이 자연스럽게 보이도록 올린 시각을 조금씩 다르게
    await query(
      `update market_items set sample = true, created_at = now() - make_interval(mins => $2), bumped_at = now() - make_interval(mins => $2) where id = $1`,
      [id, i * 47 + 5],
    );
  }
}

export async function clearSamples() {
  await ensureTables();
  const rows = await query<{ id: number }>(`delete from market_items where sample returning id`);
  return rows.length;
}

export async function restoreItem(id: number) {
  await ensureTables();
  await query(`update market_items set hidden = false where id = $1`, [id]);
  await query(`delete from market_reports where item_id = $1`, [id]);
}

export async function toggleLike(id: number, kakaoId: string): Promise<boolean> {
  await ensureTables();
  const removed = await query(`delete from market_likes where item_id = $1 and kakao_id = $2 returning item_id`, [id, kakaoId]);
  if (removed.length) return false;
  await query(`insert into market_likes (item_id, kakao_id) values ($1, $2) on conflict do nothing`, [id, kakaoId]);
  return true;
}

// 신고: 같은 회원은 한 번만. 서로 다른 3명이 신고하면 자동으로 숨긴다
export async function reportItem(id: number, reporterId: string, reason: string) {
  await ensureTables();
  await query(
    `insert into market_reports (item_id, reporter_id, reason) values ($1, $2, $3) on conflict (item_id, reporter_id) do nothing`,
    [id, reporterId, reason.trim().slice(0, 300)],
  );
  const rows = await query<{ n: string }>(`select count(*) as n from market_reports where item_id = $1`, [id]);
  if (Number(rows[0]?.n ?? 0) >= AUTO_HIDE_REPORTS) await query(`update market_items set hidden = true where id = $1`, [id]);
}

export type ReportedItem = { id: number; title: string; hidden: boolean; reports: number; reasons: string[] };

export async function listReported(): Promise<ReportedItem[]> {
  await ensureTables();
  const rows = await query<{ id: number; title: string; hidden: boolean; reports: string; reasons: string[] }>(
    `select i.id, i.title, i.hidden, count(r.id) as reports, array_agg(r.reason order by r.created_at desc) as reasons
     from market_items i join market_reports r on r.item_id = i.id
     where not i.deleted group by i.id order by max(r.created_at) desc limit 100`,
  );
  return rows.map((r) => ({ id: r.id, title: r.title, hidden: r.hidden, reports: Number(r.reports), reasons: r.reasons.filter(Boolean) }));
}

export async function getImage(id: number, size: "thumb" | "full"): Promise<Buffer | null> {
  await ensureTables();
  const col = size === "thumb" ? "thumb" : "full_image";
  const rows = await query<{ data: Buffer }>(`select ${col} as data from market_images where id = $1`, [id]);
  return rows[0]?.data ?? null;
}

// 카카오톡 오픈채팅 링크면 링크, 아니면 ID로 보여 준다
export function contactLink(contact: string): string | null {
  const c = contact.trim();
  return /^https:\/\/open\.kakao\.com\//i.test(c) ? c : null;
}
