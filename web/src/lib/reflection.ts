// 회고 처리: AI ④ 회고 응원 + AI ③ 위기 표현 안내 (담당 고은비, 명세: docs/API명세.md "회고 처리 함수")
//
// 시도 저장 API(POST /api/attempts, 담당 윤석)가 회고를 DB에 저장하기 **전에** 호출한다.
//   import { processReflection } from "@/lib/reflection";
//   const { cheer, help } = await processReflection({ status, reflection, starTitle, stopReason });
//   // 저장 성공 → 201 { attemptId, starId, status, cheer, help }
//   // 저장 실패 → 500 { error, code: "SAVE_FAILED", help }   (cheer는 저장 성공 뒤에만 보여 줌)
//
// 이 함수는 예외를 던지지 않는다. Gemini 호출·출력 검증이 실패하면 기본 응원 + 규칙 기반 안내를 돌려준다.
// 모델에는 별 제목·결과·멈춘 이유·회고만 보낸다 (사용자 ID·닉네임·지역 등 식별 정보는 보내지 않음).
import { generateJson } from "@/lib/gemini";
import { assessRisk, helpFor, isSafeAiText, type HELP_MESSAGE, type Risk } from "@/lib/safety";

export const STOP_REASONS = ["crowded", "weather", "tired", "no_time", "not_for_me", "cost", "other"] as const;
export type StopReason = (typeof STOP_REASONS)[number];
export type AttemptStatus = "bright" | "dim";

/** 위기 안내. null 또는 { title, lines } */
export type Help = typeof HELP_MESSAGE | null;

export type ReflectionInput = {
  /** bright(하늘의 별 따기) | dim(손 뻗어 보기) */
  status: AttemptStatus;
  /** 회고 한 줄. null·빈 문자열이면 AI를 부르지 않고 기본 응원 */
  reflection?: string | null;
  /** 별 제목. 응원이 구체적인 행동을 짚도록 넣는다 (없으면 "작은 활동") */
  starTitle?: string | null;
  /** dim일 때 고른 멈춘 이유 (선택) */
  stopReason?: StopReason | null;
};

export type ReflectionResult = { cheer: string; help: Help };

/** 검증·기록용 정보까지 포함한 결과 (화면 응답에는 cheer·help만 쓰면 됨) */
export type ReflectionDetail = ReflectionResult & {
  risk: Risk;
  /** true면 cheer가 기본 문구 (회고 없음, AI 실패, 형식 오류, 금지 표현, 위기 표현) */
  usedFallback: boolean;
  /** 실제 응답한 모델 버전. AI를 부르지 않았거나 실패했으면 null */
  modelVersion: string | null;
};

// AI가 늦거나 실패하면 쓰는 문구 (docs/기획/기능완료기준과_콘텐츠.md)
export const DEFAULT_CHEER: Record<AttemptStatus, string> = {
  bright: "오늘 해낸 일을 이 별에 담았어요.",
  dim: "오늘 손을 뻗어 본 순간을 이 별에 담았어요.",
};

const MAX_REFLECTION_FOR_AI = 300;
const MAX_CHEER = 100;

const STOP_REASON_LABEL: Record<StopReason, string> = {
  crowded: "사람이 많았어요",
  weather: "날씨·상황이 안 맞았어요",
  tired: "몸이나 마음이 힘들었어요",
  no_time: "시간이 없었어요",
  not_for_me: "나랑 안 맞았어요",
  cost: "돈이 들어서요",
  other: "다른 이유가 있어요",
};

const SYSTEM = `너는 사회적 고립을 겪는 청년을 위한 앱의 짧은 동반자다. 사용자가 작은 활동(별)을 해 본 뒤 남긴 회고 한 줄에 응원을 건넨다.
- cheer: 해요체 한두 문장, 80자 이내. 회고에 나온 구체적인 행동을 짚는다. 회고에 없는 일을 지어내지 않는다.
- 끝까지 하지 못한 시도(dim)도 시도 자체를 인정한다. 실패라고 부르지 않는다.
- 지시·재촉("~해야 해요", "다음엔 꼭"), 과장된 칭찬("최고", "완벽", "대단"), 진단·치료 이야기를 하지 않는다.
- risk: 회고에 자해·자살·삶을 끝내고 싶다는 뜻이 보이면 danger, 애매하게 위험해 보이면 caution, 그 외 normal.
지정된 JSON만 출력한다.`;

type AiOutput = { cheer: string; risk: Risk };

function isAiOutput(v: unknown): v is AiOutput {
  const r = v as AiOutput;
  return !!r && typeof r.cheer === "string" && ["normal", "caution", "danger"].includes(r.risk);
}

/** 회고를 처리해 응원과 위기 안내를 돌려준다. 반환값은 { cheer, help } */
export async function processReflection(
  input: ReflectionInput,
  generate: typeof generateJson = generateJson, // 테스트에서 AI 응답을 바꿔 끼우기 위함
): Promise<ReflectionResult> {
  const { cheer, help } = await inspectReflection(input, generate);
  return { cheer, help };
}

/** processReflection과 같은 처리. 검증 스크립트·로그용으로 risk·usedFallback·modelVersion을 함께 돌려준다 */
export async function inspectReflection(
  input: ReflectionInput,
  generate: typeof generateJson = generateJson,
): Promise<ReflectionDetail> {
  const status: AttemptStatus = input.status === "bright" ? "bright" : "dim";
  const defaultCheer = DEFAULT_CHEER[status];
  const text = typeof input.reflection === "string" ? input.reflection.trim() : "";

  // 회고가 없으면 AI를 부르지 않는다 (호출 수 절약). 위험 판단할 문장도 없음
  if (!text) return { cheer: defaultCheer, help: null, risk: "normal", usedFallback: true, modelVersion: null };

  const stopReason = input.stopReason && input.stopReason in STOP_REASON_LABEL ? input.stopReason : null;
  let aiRisk: Risk | null = null;
  let aiCheer: string | null = null;
  let modelVersion: string | null = null;
  try {
    const ai = await generate<AiOutput>({
      system: SYSTEM,
      prompt: JSON.stringify({
        별: input.starTitle?.trim() || "작은 활동",
        결과: status === "bright" ? "해냈어요(하늘의 별 따기)" : "시도했어요(손 뻗어 보기)",
        멈춘_이유: stopReason ? STOP_REASON_LABEL[stopReason] : null,
        회고: text.slice(0, MAX_REFLECTION_FOR_AI),
      }),
      schema: {
        type: "object",
        properties: {
          cheer: { type: "string" },
          risk: { type: "string", enum: ["normal", "caution", "danger"] },
        },
        required: ["cheer", "risk"],
      },
      validate: isAiOutput,
      fallback: { cheer: defaultCheer, risk: "normal" },
    });
    if (!ai.usedFallback) {
      aiRisk = ai.data.risk;
      aiCheer = ai.data.cheer;
      modelVersion = ai.modelVersion;
    }
  } catch (error) {
    // generateJson은 예외를 던지지 않지만, 바꿔 끼운 함수가 던져도 기본값으로 진행
    console.warn("[reflection] AI 처리 실패, 기본값 사용", error instanceof Error ? error.message : error);
  }

  // 규칙과 AI 중 더 위험한 쪽. AI가 실패했으면(aiRisk = null) 규칙 + 부정 감정 표현으로 최소 caution
  const risk = assessRisk(text, aiRisk);
  // 위기 표현이 있으면 밝은 응원 대신 기본 문구 + 안내. 금지 표현·길이 초과도 기본 문구
  if (risk === "normal" && isSafeAiText(aiCheer, MAX_CHEER)) {
    return { cheer: aiCheer.trim(), help: null, risk, usedFallback: false, modelVersion };
  }
  return { cheer: defaultCheer, help: helpFor(risk), risk, usedFallback: true, modelVersion };
}
