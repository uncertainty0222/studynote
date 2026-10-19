// 장터 화면 공통 표기

export function formatPrice(price: number) {
  return price === 0 ? "나눔" : `${price.toLocaleString("ko-KR")}동`;
}

export function timeAgo(t: number, now = Date.now()) {
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const d = Math.floor(h / 24);
  if (d === 1) return "어제";
  if (d < 30) return `${d}일 전`;
  const date = new Date(t);
  return `${date.getMonth() + 1}.${date.getDate()}`;
}
