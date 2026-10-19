import { AVATARS } from "@/lib/profile";

// 회원 프로필 그림: 동그란 배경 + 이모지 (서버·클라이언트 어디서나 쓴다)
export default function Avatar({ avatar, size = 24, className = "" }: { avatar: string | null | undefined; size?: number; className?: string }) {
  const a = (avatar && AVATARS[avatar]) || { emoji: "🙂", bg: "#E4E4E7" };
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full leading-none ${className}`}
      style={{ width: size, height: size, background: a.bg, fontSize: Math.round(size * 0.58) }}
    >
      {a.emoji}
    </span>
  );
}
