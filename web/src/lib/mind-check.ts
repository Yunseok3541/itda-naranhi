// 마음 짚기 (선택, 4주마다): UCLA 3문항 + LSNS-6 + WHO-5 (기획: docs/기획/아이디어_v4.md 3장, 고민기록 #56·#57)
// - 점수는 변화를 보는 데만 쓴다. 시작 단계·위험 판정에 쓰지 않는다
// - 화면에는 점수 숫자 대신 지난번과 달라진 점을 문장으로 보여 준다
// - 문항은 건너뛸 수 있다. 한 묶음(척도)을 다 답해야 그 묶음 점수가 생긴다 (빠진 묶음은 null)
// - ⚠ 문항 문구는 팀 번역. 공식 한국어판과 대조하고 사용 조건을 확인해야 함 (docs/제출/외부자원과_출처.md)
// 화면(클라이언트)과 서버가 같은 목록·계산을 쓰도록 DB 의존이 없는 순수 모듈로 둔다

export const MIND_CHECK_INTERVAL_DAYS = 28;

type Option = readonly [value: number, label: string];

export type ScaleId = "ucla" | "lsns" | "who5";
export type Scale = {
  id: ScaleId;
  /** 단계 이름 (화면 위 순서 표시) */
  step: string;
  /** 문항 묶음 앞에 붙는 질문 */
  prompt: string;
  /** 소제목이 있는 문항 묶음 (LSNS-6: 가족·친척 / 친구) */
  groups: { title?: string; items: string[] }[];
  options: readonly Option[];
};

/** UCLA 외로움 척도 3문항판 (Hughes et al., 2004). 3~9점, 높을수록 외로움이 큼 */
const UCLA: Scale = {
  id: "ucla",
  step: "외로움",
  prompt: "요즘 얼마나 자주 이렇게 느끼나요?",
  groups: [{ items: [
    "함께 어울릴 사람이 없다고 느껴요",
    "나만 빠져 있다고 느껴요",
    "다른 사람들과 동떨어져 있다고 느껴요",
  ] }],
  options: [[1, "거의 없어요"], [2, "가끔 있어요"], [3, "자주 있어요"]],
};

/** Lubben 사회적 관계망 척도 6문항판 (Lubben et al., 2006). 0~30점, 높을수록 관계망이 넓음 */
const LSNS: Scale = {
  id: "lsns",
  step: "곁에 있는 사람",
  prompt: "몇 명쯤 있나요? 대략 떠올려도 괜찮아요.",
  groups: [
    { title: "가족·친척 중에서 (같이 살든 따로 살든)", items: [
      "한 달에 한 번 이상 보거나 연락하는 사람",
      "개인적인 이야기를 편하게 나눌 수 있는 사람",
      "도움이 필요할 때 부탁할 수 있을 만큼 가까운 사람",
    ] },
    { title: "친구 중에서 (가까이 사는 사람도 포함)", items: [
      "한 달에 한 번 이상 보거나 연락하는 사람",
      "개인적인 이야기를 편하게 나눌 수 있는 사람",
      "도움이 필요할 때 부탁할 수 있을 만큼 가까운 사람",
    ] },
  ],
  options: [[0, "없어요"], [1, "1명"], [2, "2명"], [3, "3~4명"], [4, "5~8명"], [5, "9명 이상"]],
};

/** WHO-5 웰빙 지표 (WHO, 1998). 원점수 0~25점, 높을수록 좋음. 13점 미만이면 마음 상태가 낮은 편 */
const WHO5: Scale = {
  id: "who5",
  step: "지난 2주 마음",
  prompt: "지난 2주 동안 어땠나요?",
  groups: [{ items: [
    "즐겁고 기분이 좋았어요",
    "마음이 차분하고 편안했어요",
    "활기차고 힘이 있었어요",
    "아침에 상쾌하고 개운하게 일어났어요",
    "일상이 관심 가는 일들로 채워져 있었어요",
  ] }],
  options: [[5, "늘 그랬어요"], [4, "대부분 그랬어요"], [3, "절반 넘게 그랬어요"], [2, "절반이 안 됐어요"], [1, "가끔 그랬어요"], [0, "전혀 아니었어요"]],
};

export const SCALES: readonly Scale[] = [UCLA, LSNS, WHO5];
export const itemCount = (s: Scale) => s.groups.reduce((n, g) => n + g.items.length, 0);

/** WHO-5 원점수가 이보다 낮으면 결과 화면에 상담받을 곳을 안내 (WHO-5 사용 안내의 기준) */
export const WHO5_LOW = 13;

/** 문항별 답. 답하지 않은 문항은 null */
export type MindAnswers = Record<ScaleId, (number | null)[]>;
export type MindScores = Record<ScaleId, number | null>;

export const emptyAnswers = (): MindAnswers =>
  Object.fromEntries(SCALES.map((s) => [s.id, Array(itemCount(s)).fill(null)])) as MindAnswers;

/** 요청 본문 검사. 틀린 칸이 있으면 { invalid: "칸 이름" }, 한 묶음도 다 답하지 않았으면 { invalid: "answers" } */
export function parseMindAnswers(v: unknown): { value: MindAnswers } | { invalid: string } {
  if (!v || typeof v !== "object" || Array.isArray(v)) return { invalid: "answers" };
  const o = v as Record<string, unknown>;
  const out = {} as MindAnswers;
  for (const s of SCALES) {
    const raw = o[s.id] ?? null;
    const n = itemCount(s);
    if (raw === null) { out[s.id] = Array(n).fill(null); continue; }
    if (!Array.isArray(raw) || raw.length !== n) return { invalid: `answers.${s.id}` };
    const allowed = s.options.map(([value]) => value);
    if (!raw.every((x) => x === null || allowed.includes(x as number))) return { invalid: `answers.${s.id}` };
    out[s.id] = raw as (number | null)[];
  }
  return Object.values(scoreMind(out)).some((x) => x !== null) ? { value: out } : { invalid: "answers" };
}

/** 묶음마다 모두 답했으면 합계, 하나라도 비었으면 null */
export function scoreMind(a: MindAnswers): MindScores {
  const sum = (xs: (number | null)[]) => (xs.length && xs.every((x) => x !== null) ? (xs as number[]).reduce((p, x) => p + x, 0) : null);
  return { ucla: sum(a.ucla), lsns: sum(a.lsns), who5: sum(a.who5) };
}

export type MindChange = { scale: ScaleId; trend: "better" | "same" | "worse"; text: string };
export type MindResult = {
  checkedAt: string;
  scores: MindScores;
  /** 지난번이 없으면 null (첫 마음 짚기) */
  changes: MindChange[] | null;
  /** WHO-5가 낮은 편 → 상담받을 곳 안내 */
  lowWellbeing: boolean;
  /** 다음 마음 짚기를 권하는 날 (한국 날짜 YYYY-MM-DD) */
  nextAt: string;
};

// 변화로 보는 최소 차이 (팀 기준). WHO-5는 10%p(원점수 2.5점) 이상을 의미 있는 변화로 보는 관례를 따라 3점
const STEP: Record<ScaleId, number> = { ucla: 1, lsns: 2, who5: 3 };
// higherIsBetter: UCLA는 낮을수록 좋음
const TEXT: Record<ScaleId, { higherIsBetter: boolean; better: string; same: string; worse: string }> = {
  ucla: { higherIsBetter: false, better: "지난번보다 외롭다고 느끼는 때가 줄었어요.", same: "외롭다고 느끼는 정도는 지난번과 비슷해요.", worse: "지난번보다 외롭다고 느끼는 때가 조금 늘었어요." },
  lsns: { higherIsBetter: true, better: "지난번보다 연락하고 기댈 수 있는 사람이 늘었어요.", same: "곁에 있는 사람은 지난번과 비슷해요.", worse: "지난번보다 연락하고 기댈 수 있는 사람이 조금 줄었어요." },
  who5: { higherIsBetter: true, better: "지난번보다 지난 2주 마음이 조금 가벼워졌어요.", same: "지난 2주 마음은 지난번과 비슷해요.", worse: "지난번보다 지난 2주 마음이 조금 무거웠어요." },
};

/** 두 번의 점수를 비교한 문장. 두 번 모두 답한 묶음만 */
export function compareMind(now: MindScores, before: MindScores): MindChange[] {
  return SCALES.flatMap(({ id }) => {
    const a = now[id], b = before[id];
    if (a === null || b === null) return [];
    const t = TEXT[id];
    const diff = (a - b) * (t.higherIsBetter ? 1 : -1);
    const trend = diff >= STEP[id] ? "better" : diff <= -STEP[id] ? "worse" : "same";
    return [{ scale: id, trend, text: t[trend] }];
  });
}

const kstDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" });
export function nextMindCheckDate(checkedAt: string | Date): string {
  const d = new Date(checkedAt);
  return kstDate.format(new Date(d.getTime() + MIND_CHECK_INTERVAL_DAYS * 86_400_000));
}

/** "11월 21일" (한국 날짜). YYYY-MM-DD 또는 ISO 시각 */
export function mindDay(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return `${Number(m[2])}월 ${Number(m[3])}일`;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric" }).format(new Date(value));
}

/** 다시 짚어 볼 때인지 (4주가 지남) */
export const isMindCheckDue = (result: Pick<MindResult, "nextAt">, now = new Date()) => result.nextAt <= kstDate.format(now);

/** 저장된 기록 두 개(최근, 그 전)로 결과를 만든다 */
export function buildMindResult(latest: { checkedAt: string; scores: MindScores }, previous: { scores: MindScores } | null): MindResult {
  return {
    checkedAt: latest.checkedAt,
    scores: latest.scores,
    changes: previous ? compareMind(latest.scores, previous.scores) : null,
    lowWellbeing: latest.scores.who5 !== null && latest.scores.who5 < WHO5_LOW,
    nextAt: nextMindCheckDate(latest.checkedAt),
  };
}
