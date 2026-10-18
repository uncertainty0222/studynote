// 이 요청의 유료 이용 여부: 이용권 코드 쿠키 또는 카카오 로그인 회원의 멤버십 기간

import { cookies } from "next/headers";
import { accessFromCookie, PREMIUM_COOKIE, type Access } from "./premium";
import { getMember, loginEnabled, readSession, SESSION_COOKIE, type Member } from "./members";

export type FullAccess = Access & { loginEnabled: boolean; member: Member | null; byCode: boolean };

export async function getAccess(): Promise<FullAccess> {
  const store = await cookies();
  const byCode = accessFromCookie(store.get(PREMIUM_COOKIE)?.value);
  const enabled = loginEnabled();
  const id = enabled ? readSession(store.get(SESSION_COOKIE)?.value) : null;

  let member: Member | null = null;
  if (id) {
    try {
      member = await getMember(id);
    } catch {
      member = null; // DB 장애 때는 비회원처럼 보여 준다 (뉴스는 계속 보이게)
    }
  }
  const memberActive = member?.premiumUntil != null && member.premiumUntil > Date.now();
  // 코드와 멤버십이 둘 다 있으면 더 늦게 끝나는 쪽을 보여 준다 (코드 만료일이 없으면 무기한)
  const premium = byCode.premium || memberActive;
  const expiresAt = byCode.premium && byCode.expiresAt === null ? null : Math.max(byCode.expiresAt ?? 0, memberActive ? member!.premiumUntil! : 0) || null;
  return { premium, expiresAt, loginEnabled: enabled, member, byCode: byCode.premium };
}
