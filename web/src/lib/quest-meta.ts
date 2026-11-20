// 퀘스트 분류 값 (원본: 루트 quests.json의 tags·focuses, DB: stars.tags·stars.focus)
// 서버리스 번들에 그대로 들어가도록 web 안에 상수로 둔다 (실행 중에 파일을 읽지 않음)
// quests.json과 값·이름·순서가 같은지는 scripts/verify-survey.mts가 확인한다
//
// 분류 기준 (고민기록 #31, #32)
//   단계(stage): 얼마나 어려운가
//   focus: 무엇이 필요한가 (고립·은둔 청년 연구의 회복 방향. 내부 계산용, 연구 유형 이름은 화면·응답에 쓰지 않음)
//   tags: 무엇을 좋아하는가 (퀘스트 후 설문으로 계산하는 성향)

/** 성향 태그 (quests.json tags의 key·label, 같은 순서) */
export const TAGS = [
  ["outdoor", "바깥형"],
  ["social", "만남형"],
  ["career", "직업형"],
  ["learning", "배움형"],
  ["rest", "회복형"],
] as const;
export type Tag = (typeof TAGS)[number][0];
export const TAG_KEYS: readonly Tag[] = TAGS.map(([k]) => k);
export const TAG_LABEL = Object.fromEntries(TAGS) as Record<Tag, string>;

/** 회복 방향 (quests.json focuses의 key, 같은 순서. 점수가 같을 때도 이 순서) */
export const FOCUSES = ["daily", "outing", "relation", "work"] as const;
export type Focus = (typeof FOCUSES)[number];
