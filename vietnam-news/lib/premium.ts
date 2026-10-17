// 유료 이용권 (1단계: 코드 방식).
// 결제(계좌이체·카카오페이 등)를 받은 뒤 운영자가 코드를 알려주고, 독자가 사이트에 코드를 입력하면 유료 기능이 열린다.
//
// PREMIUM_CODES  : 쉼표로 구분한 코드 목록. 만료일을 붙이려면 "CODE@2026-12-31" (그날 23:59 베트남 시간까지 유효)
// PREMIUM_SECRET : 쿠키 서명용 비밀값 (아무 긴 문자열). 없으면 서버가 재시작될 때마다 독자가 코드를 다시 입력해야 한다
//
// 목록에서 코드를 지우면 그 코드를 쓰던 독자의 유료 기능도 바로 닫힌다 (매 요청마다 목록과 대조한다).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const PREMIUM_COOKIE = "vn_premium";
export const COOKIE_MAX_AGE = 400 * 24 * 3600; // 브라우저 최대 보관 기간 수준. 실제 유효기간은 코드 만료일이 정한다

const G = globalThis as unknown as { __vnPremiumSecret?: string };
function secret() {
  return process.env.PREMIUM_SECRET || (G.__vnPremiumSecret ??= randomBytes(32).toString("hex"));
}

type CodeInfo = { code: string; expiresAt: number | null };

function codes(): CodeInfo[] {
  return (process.env.PREMIUM_CODES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const [code, date] = entry.split("@");
      const expiresAt = date ? Date.parse(`${date}T23:59:59+07:00`) : null;
      return { code: code.trim().toUpperCase(), expiresAt: Number.isFinite(expiresAt) ? expiresAt : null };
    });
}

function findValid(code: string): CodeInfo | null {
  const c = code.trim().toUpperCase();
  const info = codes().find((x) => x.code === c);
  if (!info) return null;
  if (info.expiresAt !== null && Date.now() > info.expiresAt) return null;
  return info;
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function makeCookieValue(code: string) {
  const v = Buffer.from(code.trim().toUpperCase()).toString("base64url");
  return `${v}.${sign(v)}`;
}

// 쿠키가 유효한 코드를 담고 있으면 그 코드 정보를, 아니면 null
export function verifyCookie(value: string | undefined): CodeInfo | null {
  if (!value) return null;
  const [v, sig] = value.split(".");
  if (!v || !sig) return null;
  const expected = Buffer.from(sign(v));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return findValid(Buffer.from(v, "base64url").toString());
}

export function redeem(code: string): CodeInfo | null {
  return findValid(code);
}

export type Access = { premium: boolean; expiresAt: number | null };

export function accessFromCookie(value: string | undefined): Access {
  const info = verifyCookie(value);
  return { premium: Boolean(info), expiresAt: info?.expiresAt ?? null };
}
