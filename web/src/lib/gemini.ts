// AI 호출 공통 (모든 AI 기능이 generateJson 하나만 거친다). 제공자는 AI_PROVIDER로 고른다 (고민기록 #42)
//   gemini (기본) — 배포용. 무료 등급 Gemini
//   openai        — 개발·시연용. OpenAI 호환 주소(예: SSAFY GMS, 기간 제한 있는 키)로 gpt-4o-mini
// 호출하는 쪽은 제공자를 몰라도 된다. 키가 없거나 실패하면 언제나 fallback (앱 흐름이 끊기지 않게)
import { GoogleGenAI } from "@google/genai";

const geminiKey = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

export const AI_PROVIDER: "gemini" | "openai" = process.env.AI_PROVIDER === "openai" ? "openai" : "gemini";
const openaiKey = process.env.OPENAI_API_KEY;
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
export const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

/** 지금 쓰는 기본 모델 이름 (/api/health·검증 스크립트 표시용) */
export const ACTIVE_MODEL = AI_PROVIDER === "openai" ? OPENAI_MODEL : GEMINI_MODEL;

// 응답이 늦으면 기다리지 않고 기본값으로 넘어간다 (시연 중 화면이 멈추지 않게)
const TIMEOUT_MS = 10_000;

const ai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;

export type GenerateResult<T> = {
  data: T;
  usedFallback: boolean;
  /** 실제로 응답한 모델 버전 (응답의 modelVersion). 기본값을 썼으면 null */
  modelVersion: string | null;
  /** 기본값을 쓴 이유 (로그·검증 기록용) */
  fallbackReason: "no_key" | "error" | "invalid" | null;
};

type Opts<T> = {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  validate: (value: unknown) => value is T;
  fallback: T;
  /** 응답을 기다리는 시간. 기본 10초 (화면 요청). 미리 돌리는 일괄 분류처럼 화면이 기다리지 않는 작업만 늘린다 */
  timeoutMs?: number;
  /** 무작위성. 분류처럼 매번 같은 답이 나와야 하는 작업은 0 (지정하지 않으면 모델 기본값) */
  temperature?: number;
  /**
   * 이 호출에만 다른 모델 (예: 수정 승인은 판정과 다른 모델로). 지정하지 않으면 제공자의 기본 모델.
   * Gemini 모델 이름(gemini-…)은 openai 제공자에서는 무시하고 OPENAI_MODEL을 쓴다 (gpt-…만 그대로)
   */
  model?: string;
};

/**
 * AI에 JSON 형식으로 답하게 하고 결과를 돌려준다.
 * 키가 없거나, 호출이 실패하거나, 결과가 검증을 통과하지 못하면 fallback을 돌려준다.
 * → 무료 등급 호출 제한·네트워크 장애가 있어도 앱 흐름이 끊기지 않게 하기 위함.
 * 프롬프트에는 이름·사용자 ID·지역 같은 식별 정보를 넣지 않는다 (호출하는 쪽 책임).
 */
export async function generateJson<T>(opts: Opts<T>): Promise<GenerateResult<T>> {
  const fail = (reason: "no_key" | "error" | "invalid"): GenerateResult<T> =>
    ({ data: opts.fallback, usedFallback: true, modelVersion: null, fallbackReason: reason });
  const call = AI_PROVIDER === "openai" ? callOpenAi : callGemini;
  try {
    const out = await call(opts);
    if (!out) return fail("no_key");
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(out.text);
    } catch {
      // 빈 응답이나 JSON이 아닌 응답 → 아래 검증에서 걸러져 invalid로 처리
    }
    if (opts.validate(parsed)) return { data: parsed, usedFallback: false, modelVersion: out.model, fallbackReason: null };
    console.warn(`[ai:${AI_PROVIDER}] 응답이 형식에 맞지 않아 기본값 사용`, parsed);
    return fail("invalid");
  } catch (error) {
    console.warn(`[ai:${AI_PROVIDER}] 호출 실패, 기본값 사용`, error instanceof Error ? error.message : error);
    return fail("error");
  }
}

type Raw = { text: string; model: string } | null;

async function callGemini(opts: Opts<unknown>): Promise<Raw> {
  if (!ai) return null;
  const model = opts.model ?? GEMINI_MODEL;
  const response = await ai.models.generateContent({
    model,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      responseJsonSchema: opts.schema,
      abortSignal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
    },
  });
  return { text: response.text ?? "", model: response.modelVersion ?? model };
}

/** OpenAI 호환 Chat Completions (GMS 포함). 응답 형식은 JSON 모드 + 지시문에 스키마를 붙여 맞춘다 */
async function callOpenAi(opts: Opts<unknown>): Promise<Raw> {
  if (!openaiKey) return null;
  const model = opts.model?.startsWith("gpt") ? opts.model : OPENAI_MODEL;
  const res = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: `${opts.system}\n\n응답은 아래 JSON Schema를 따르는 JSON 객체 하나만 출력한다.\n${JSON.stringify(opts.schema)}` },
        { role: "user", content: opts.prompt },
      ],
      response_format: { type: "json_object" },
      ...(opts.temperature === undefined ? {} : { temperature: opts.temperature }),
    }),
    signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
  });
  // 오류 본문에는 요청 정보가 섞일 수 있어 상태 코드만 남긴다
  if (!res.ok) throw new Error(`OpenAI 호환 API ${res.status}`);
  const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
  return { text: data.choices?.[0]?.message?.content ?? "", model: data.model ?? model };
}
