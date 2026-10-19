// 회원 별명과 프로필 그림. 카카오 닉네임(실명인 경우가 많다) 대신 사이트 안에서는 이것만 보여 준다.
// 별명 = 형용사 + 베트남 소재 이름, 프로필 = 그 이름의 이모지 + 배경색 (이미지 파일 없이 그린다)

const ADJECTIVES = [
  "느긋한", "졸린", "부지런한", "신난", "수줍은", "용감한", "상냥한", "배고픈", "행복한", "씩씩한",
  "꼼꼼한", "엉뚱한", "다정한", "똑똑한", "반짝이는", "조용한", "명랑한", "든든한", "여유로운", "낭만적인",
  "호기심 많은", "산책하는", "노래하는", "춤추는", "낮잠 자는", "수영하는", "서핑하는", "햇볕 쬐는",
];

// key는 DB에 저장되는 값이라 바꾸지 않는다 (지우면 기본 그림으로 보인다)
export const AVATARS: Record<string, { name: string; emoji: string; bg: string }> = {
  mango: { name: "망고", emoji: "🥭", bg: "#FDE68A" },
  banhmi: { name: "반미", emoji: "🥖", bg: "#FED7AA" },
  pho: { name: "쌀국수", emoji: "🍜", bg: "#FECACA" },
  coconut: { name: "코코넛", emoji: "🥥", bg: "#E7E5E4" },
  coffee: { name: "커피", emoji: "☕", bg: "#E7D7C1" },
  pineapple: { name: "파인애플", emoji: "🍍", bg: "#FEF08A" },
  banana: { name: "바나나", emoji: "🍌", bg: "#FEF9C3" },
  watermelon: { name: "수박", emoji: "🍉", bg: "#BBF7D0" },
  avocado: { name: "아보카도", emoji: "🥑", bg: "#D9F99D" },
  milktea: { name: "밀크티", emoji: "🧋", bg: "#F5E6D3" },
  lemon: { name: "레몬", emoji: "🍋", bg: "#FEF9C3" },
  turtle: { name: "거북이", emoji: "🐢", bg: "#A7F3D0" },
  dolphin: { name: "돌고래", emoji: "🐬", bg: "#BAE6FD" },
  crab: { name: "꽃게", emoji: "🦀", bg: "#FECACA" },
  shrimp: { name: "새우", emoji: "🦐", bg: "#FFE4E6" },
  fish: { name: "열대어", emoji: "🐠", bg: "#BFDBFE" },
  octopus: { name: "문어", emoji: "🐙", bg: "#FBCFE8" },
  shell: { name: "조개", emoji: "🐚", bg: "#FCE7F3" },
  palm: { name: "야자수", emoji: "🌴", bg: "#BBF7D0" },
  scooter: { name: "오토바이", emoji: "🛵", bg: "#DDD6FE" },
  cat: { name: "고양이", emoji: "🐱", bg: "#FDE68A" },
  dog: { name: "강아지", emoji: "🐶", bg: "#FED7AA" },
  monkey: { name: "원숭이", emoji: "🐒", bg: "#E7D7C1" },
  buffalo: { name: "물소", emoji: "🐃", bg: "#D6D3D1" },
  elephant: { name: "코끼리", emoji: "🐘", bg: "#E5E7EB" },
  sun: { name: "햇살", emoji: "🌞", bg: "#FEF3C7" },
};

const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

// 무작위 별명과 그림. 가입할 때 한 번만 뽑아 카카오 회원번호에 묶는다 (겹치면 호출하는 쪽에서 다시 뽑는다)
export function randomProfile(suffix = false) {
  const avatar = pick(Object.keys(AVATARS));
  const alias = `${pick(ADJECTIVES)} ${AVATARS[avatar].name}${suffix ? ` ${10 + Math.floor(Math.random() * 90)}` : ""}`;
  return { alias, avatar };
}
