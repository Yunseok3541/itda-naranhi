// 신청 도우미 (고민기록 #37 수정안 1, #39) — 규칙 부분. 서버(api/policies/helper.ts)와 화면 예시 모드가 같이 쓴다
// - 신청 순서 · 서류 · 작게 시작하기: 원문을 나누거나 정해 둔 문장만 (AI 없음 → 지어낼 수 없음)
// - 문의 대본 · 말하기 연습 · 자유 질문: AI를 쓰고, 실패하면 여기 기본 문장으로
// DB·Gemini를 import하지 않는다 (화면에서도 불러 쓰기 때문)

export const HELPER_INTENTS = ["steps", "docs", "script", "practice", "ask", "start"] as const;
export type HelperIntent = (typeof HELPER_INTENTS)[number];

export const INTENT_LABEL: Record<HelperIntent, string> = {
  steps: "신청 순서 알려줘",
  docs: "서류가 뭐가 필요해?",
  script: "뭐라고 말하지?",
  practice: "말하기 연습할래",
  ask: "직접 물어볼래",
  start: "작게 시작하고 싶어",
};

/** 말하기 연습은 사용자 말 6번까지 (무료 한도와 대화가 길어지는 것을 막기 위함) */
export const PRACTICE_MAX_TURNS = 6;

export type Burden = "online" | "visit" | "phone" | "group";
export type HelperPolicy = {
  title: string;
  burden: Burden;
  applyText: string | null;
  reviewText: string | null;
  docsText: string | null;
};
export type Section = { title: string; items: string[] };
export type Script = { label: string; opening: string; questions: string[]; closing: string };
export type HelperReply = {
  intent: HelperIntent;
  reply: string;
  sections: Section[];
  script?: Script;
  /** 말하기 연습: 상대(담당자) 말과 짧은 도움말 */
  staffLine?: string;
  tip?: string | null;
  turnsLeft?: number;
  /** rule: 원문·정해 둔 문장 / ai: AI가 만든 문장(검사 통과) / fallback: AI 대신 기본 문장 */
  source: "rule" | "ai" | "fallback";
  /** 다음에 누를 만한 버튼 */
  followUps: HelperIntent[];
};

const MAX_ITEMS = 8;
const MAX_ITEM = 120;

/** 원문 한 칸을 단계·항목으로 나눈다 (→ ▷ □ 줄바꿈 번호 등). 원문 문장을 바꾸지 않고 자르기만 한다 */
export function splitSource(text: string | null, by: "steps" | "list"): string[] {
  if (!text?.trim()) return [];
  const steps = by === "steps" ? /\s*(?:→|->|▷|▶|⇒|\n|□|■|○|ㅇ\s|[①-⑳]|\d+\.\s|\d+\)\s)\s*/ : /\s*(?:\n|,|，|□|■|○|ㅇ\s|·|ㆍ|[①-⑳]|\d+\.\s|\d+\)\s)\s*/;
  const out: string[] = [];
  for (const raw of text.split(steps)) {
    const t = raw.replace(/^[-–•*\s]+/, "").trim();
    if (t.length < 2 || out.includes(t)) continue;
    out.push(t.length > MAX_ITEM ? `${t.slice(0, MAX_ITEM - 1)}…` : t);
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** "신청 사이트 참조"처럼 원문이 사실상 비어 있는지 */
const isThin = (items: string[]) => items.length === 0 || (items.length === 1 && /참조|참고|확인|문의/.test(items[0]) && items[0].length < 20);

export function stepsReply(p: HelperPolicy): HelperReply {
  const apply = splitSource(p.applyText, "steps");
  const review = splitSource(p.reviewText, "steps");
  const sections: Section[] = [];
  if (apply.length) sections.push({ title: "원문에 적힌 신청 방법", items: apply });
  if (review.length) sections.push({ title: "원문에 적힌 선정 과정", items: review });
  if (isThin(apply) && isThin(review)) {
    return {
      intent: "steps", source: "rule", sections,
      reply: "원문에 신청 순서가 자세히 적혀 있지 않아요. 원문 페이지를 열어 보거나, 문의할 때 물어볼 문장을 같이 만들어 봐요.",
      followUps: ["script", "start"],
    };
  }
  return {
    intent: "steps", source: "rule", sections,
    reply: "원문에 적힌 그대로 나눠 봤어요. 기관이 진행하는 단계도 섞여 있을 수 있어요. 내가 할 일은 보통 '신청'과 '서류 제출'이에요.",
    followUps: ["docs", "start"],
  };
}

export function docsReply(p: HelperPolicy): HelperReply {
  const items = splitSource(p.docsText, "list");
  if (isThin(items)) {
    return {
      intent: "docs", source: "rule", sections: items.length ? [{ title: "원문에 적힌 내용", items }] : [],
      reply: "원문에 제출 서류가 적혀 있지 않아요. 서류가 없을 수도 있고, 신청 페이지에서 따로 안내할 수도 있어요. 문의할 때 물어볼 수 있게 대본에 넣어 둘게요.",
      followUps: ["script", "steps"],
    };
  }
  return {
    intent: "docs", source: "rule", sections: [{ title: "원문에 적힌 제출 서류", items }],
    reply: "원문에 적힌 서류예요. 한 번에 다 준비하지 않아도 돼요. 이름만 메모해 두는 것부터 시작해도 좋아요.",
    followUps: ["start", "script"],
  };
}

const START: Record<Burden, string[]> = {
  online: ["신청 페이지를 열어서 첫 화면만 보기", "필요한 서류 이름만 메모해 두기", "신청 버튼이 어디 있는지만 찾아보기 (누르지 않아도 돼요)"],
  phone: ["문의 대본을 소리 내어 한 번 읽어 보기", "전화 대신 문자·게시판·온라인 문의가 되는지 원문에서 찾아보기", "통화해 볼 시간 하나만 정해 두기"],
  visit: ["지도에서 장소 위치만 확인하기", "가는 길을 지도 사진으로 미리 보기", "방문 전에 전화·온라인으로 되는지 문의해 보기"],
  group: ["프로그램 소개 글을 끝까지 읽어 보기", "궁금한 점 하나만 적어 두기", "혼자 참여해도 되는지 문의해 보기"],
};

export function startReply(p: HelperPolicy): HelperReply {
  return {
    intent: "start", source: "rule",
    sections: [{ title: "오늘 해 볼 만한 작은 준비", items: START[p.burden] }],
    reply: "신청까지 한 번에 가지 않아도 괜찮아요. 이 중 하나만 해 봐도 충분해요.",
    followUps: p.burden === "online" ? ["steps", "docs"] : ["script", "practice"],
  };
}

const SCRIPT_LABEL: Record<Burden, string> = {
  online: "문의 글로 보낼 때",
  phone: "전화로 말할 때",
  visit: "방문해서 말할 때",
  group: "참여 전에 물어볼 때",
};

/** AI 없이 만드는 문의 대본: 원문에 빠진 것을 질문으로 바꾼다 */
export function fallbackScript(p: HelperPolicy, question?: string | null): Script {
  const questions: string[] = [];
  const q = question?.trim();
  // 문장 끝: 이미 부호가 있으면 그대로, 부탁·바람이면 마침표, 나머지("돼요", "되나요")는 물음표
  if (q) questions.push(/[.?!]$/.test(q) ? q : /(싶어요|주세요|드려요|합니다|습니다)$/.test(q) ? `${q}.` : `${q}?`);
  questions.push("제가 신청 대상이 되는지 확인하고 싶어요.");
  if (isThin(splitSource(p.applyText, "steps"))) questions.push("신청은 어떻게 하면 되나요?");
  if (isThin(splitSource(p.docsText, "list"))) questions.push("신청할 때 필요한 서류가 있을까요?");
  return {
    label: SCRIPT_LABEL[p.burden],
    opening: `안녕하세요. '${p.title}' 정책에 대해 여쭤보고 싶어서 연락드렸어요.`,
    questions: questions.slice(0, 3),
    closing: "알려 주셔서 감사합니다.",
  };
}

export function scriptReply(p: HelperPolicy, script: Script, source: HelperReply["source"]): HelperReply {
  return {
    intent: "script", source, sections: [], script,
    reply: "이렇게 말해 보면 어때요? 내 말투로 바꿔도 괜찮아요. 막히면 '확인하고 다시 연락드릴게요'라고 해도 돼요.",
    followUps: ["practice", "start"],
  };
}

const STAFF_LINES = [
  "네, 청년 정책 문의 창구예요. 어떤 일로 연락 주셨어요?",
  "네, 그 정책 문의시군요. 어떤 점이 궁금하세요?",
  "확인해 보고 안내해 드릴게요. 더 궁금한 점 있으세요?",
  "네, 정리해서 다시 안내해 드릴게요. 연락 주셔서 감사합니다.",
];

/** AI 없이 하는 말하기 연습: 정해 둔 담당자 말을 차례로 */
export function fallbackStaffLine(userTurns: number) {
  return STAFF_LINES[Math.min(userTurns, STAFF_LINES.length - 1)];
}

export function practiceReply(staffLine: string, tip: string | null, userTurns: number, source: HelperReply["source"]): HelperReply {
  const turnsLeft = Math.max(0, PRACTICE_MAX_TURNS - userTurns);
  return {
    intent: "practice", source, sections: [], staffLine, tip, turnsLeft,
    reply: userTurns === 0 ? "담당자 역할을 해 볼게요. 실제 이름이나 연락처는 적지 않아도 돼요." : turnsLeft === 0 ? "연습은 여기까지예요. 잘 해 봤어요." : "",
    followUps: turnsLeft === 0 ? ["script", "start"] : [],
  };
}

export const PRACTICE_DONE = "연습은 여기까지예요. 대본을 다시 보거나 작게 시작해 봐요.";

export function notFoundReply(): HelperReply {
  return {
    intent: "ask", source: "rule", sections: [],
    reply: "원문에서 답을 찾지 못했어요. 없는 내용을 지어내지 않으려고 해요. 문의할 때 물어볼 수 있게 대본에 넣어 드릴까요?",
    followUps: ["script"],
  };
}

/** 위험 표현이 보이면 신청 이야기를 멈추고 안내만 */
export function careReply(intent: HelperIntent): HelperReply {
  return {
    intent, source: "rule", sections: [],
    reply: "지금 마음이 많이 힘드신 것 같아요. 정책 신청은 나중에 해도 괜찮아요. 아래 연락처에서 바로 이야기를 들어 줄 수 있어요.",
    followUps: [],
  };
}
