// AI ③ 위험 신호 감지의 규칙 부분.
// AI 판단보다 먼저 실행되고, 여기서 걸리면 AI 결과와 상관없이 안내를 보여준다.
// 목록은 예시이며 전문기관 자료(자살예방 가이드 등)를 참고해 보완 필요.

// 직접 표현 → danger
const DANGER_PATTERNS = [
  /죽고\s*싶/,
  /죽어\s*버리/,
  /자살/,
  /자해/,
  /살기\s*싫/,
  /사라지고\s*싶/,
  /끝내고\s*싶/,
  /없어지고\s*싶/,
  /뛰어\s*내리/,
  /약을?\s*모아/,
  /유서/,
  /목을?\s*매/,
  /목숨을?\s*끊/,
];

// 간접 표현 → caution
const CAUTION_PATTERNS = [
  /나\s*(하나\s*)?없으면/,
  /나\s*(같은\s*건|따위)/,
  /(다|모든\s*게)\s*소용\s*없/,
  /아무\s*(의미|의욕)(가|도)?\s*없/,
  /희망(이|도)?\s*없/,
  /(더는|더\s*이상)\s*못\s*(버티|살)/,
  /버틸\s*수(가)?\s*없/,
  /짐(이|만)\s*(되|된|돼)/,
  /태어나지\s*말/,
  /다\s*끝났/,
];

// AI 호출이 실패했을 때만 쓰는 부정 감정 표현 → caution
// (AI 판단이 없으면 "애매하면 안내를 보여주는 쪽"으로 처리하기 위함)
const NEGATIVE_PATTERNS = [
  /힘들/,
  /우울/,
  /괴로/,
  /지쳤|지친|지쳐/,
  /외로/,
  /불안/,
  /무기력/,
  /비참/,
  /공허/,
];

export type Risk = "normal" | "caution" | "danger";

export function ruleRisk(text: string): Risk {
  if (DANGER_PATTERNS.some((p) => p.test(text))) return "danger";
  if (CAUTION_PATTERNS.some((p) => p.test(text))) return "caution";
  return "normal";
}

/** 규칙과 AI 중 더 위험한 쪽을 택한다 (애매하면 안내를 보여주는 쪽). */
export function mergeRisk(a: Risk, b: Risk): Risk {
  const order: Risk[] = ["normal", "caution", "danger"];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

/**
 * 최종 위험도.
 * - AI 판단이 있으면: 규칙과 AI 중 더 위험한 쪽
 * - AI가 실패했으면(aiRisk = null): 규칙 결과에 더해, 부정 감정 표현이 있으면 최소 caution
 * 체크인, 회고 등 사용자 문장을 받는 모든 API에서 이 함수를 사용한다.
 */
export function assessRisk(text: string, aiRisk: Risk | null): Risk {
  const rule = ruleRisk(text);
  if (aiRisk !== null) return mergeRisk(rule, aiRisk);
  const negative: Risk = NEGATIVE_PATTERNS.some((p) => p.test(text)) ? "caution" : "normal";
  return mergeRisk(rule, negative);
}

export const HELP_MESSAGE = {
  title: "혼자 감당하지 않아도 돼요",
  lines: [
    "자살예방상담전화 109 (24시간)",
    "정신건강위기상담전화 1577-0199",
    "지역 청년마음건강 지원사업도 찾아볼 수 있어요.",
  ],
};
