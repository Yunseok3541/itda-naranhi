// AI ③ 위험 신호 감지의 규칙 부분.
// AI 판단보다 먼저 실행되고, 여기서 걸리면 AI 결과와 상관없이 안내를 보여준다.
// 목록은 예시이며 전문가 자료를 참고해 보완 필요.

const DANGER_PATTERNS = [
  /죽고\s*싶/,
  /자살/,
  /자해/,
  /살기\s*싫/,
  /사라지고\s*싶/,
  /끝내고\s*싶/,
  /없어지고\s*싶/,
];

export type Risk = "normal" | "caution" | "danger";

export function ruleRisk(text: string): Risk {
  return DANGER_PATTERNS.some((p) => p.test(text)) ? "danger" : "normal";
}

/** 규칙과 AI 중 더 위험한 쪽을 택한다 (애매하면 안내를 보여주는 쪽). */
export function mergeRisk(a: Risk, b: Risk): Risk {
  const order: Risk[] = ["normal", "caution", "danger"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

export const HELP_MESSAGE = {
  title: "혼자 감당하지 않아도 돼요",
  lines: [
    "자살예방상담전화 109 (24시간)",
    "정신건강위기상담전화 1577-0199",
    "지역 청년마음건강 지원사업도 찾아볼 수 있어요.",
  ],
};
