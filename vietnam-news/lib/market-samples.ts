// 운영자용 장터 테스트 글 5개 (/admin '테스트 글 넣기'). 제목에 [테스트]가 붙고, '테스트 글 지우기'로 한 번에 지운다
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NewItem } from "./market";

export const SAMPLE_ITEMS: Omit<NewItem, "photos">[] = [
  {
    title: "[테스트] 샤오미 공기청정기 4 Lite 필터 새것",
    description: "1년 사용했고 필터는 지난달에 새로 갈았어요.\n건기 미세먼지 때문에 샀는데 이사 가게 돼서 내놓아요.\n나트랑 시내 쩐푸 거리 근처 직거래.",
    price: 1_500_000,
    category: "가전·디지털",
    area: "나트랑 시내",
    contact: "test_seller",
  },
  {
    title: "[테스트] 혼다 비전 110 오토바이 2019년식",
    description: "출퇴근용으로 탔어요. 정기 점검했고 타이어 교체 6개월 전.\n등록 서류 있어요. 명의 이전 관련은 연락 주시면 설명드릴게요.",
    price: 18_000_000,
    category: "오토바이·차량",
    area: "나트랑 북부",
    contact: "test_seller",
  },
  {
    title: "[테스트] 원목 4인 식탁 + 의자 4개",
    description: "생활 기스 조금 있어요. 직접 가져가셔야 해요 (그랩 카 들어가는 크기 아님).",
    price: 2_200_000,
    category: "가구·생활",
    area: "나트랑 남부",
    contact: "test_seller",
  },
  {
    title: "[테스트] 접이식 유모차 나눔해요",
    description: "아이가 커서 안 써요. 바퀴 상태 좋아요. 필요하신 분 가져가세요.",
    price: 0,
    category: "유아동",
    area: "깜라인",
    contact: "test_seller",
  },
  {
    title: "[테스트] 한국 소설·에세이 10권 일괄",
    description: "한국에서 가져온 책들이에요. 상태 깨끗해요. 목록은 연락 주시면 사진으로 보내 드려요.",
    price: 300_000,
    category: "도서·취미",
    area: "나트랑 시내",
    contact: "test_seller",
  },
];

export async function samplePhotos(): Promise<Buffer[]> {
  // 사진 파일을 못 읽으면 빈 Buffer (그 글은 사진 없이 올라간다)
  return Promise.all(
    SAMPLE_ITEMS.map((_, i) => readFile(path.join(process.cwd(), "public", "market-seed", `${i + 1}.jpg`)).catch(() => Buffer.alloc(0))),
  );
}
