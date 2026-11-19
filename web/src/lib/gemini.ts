import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.5-flash";

// 응답이 늦으면 기다리지 않고 기본값으로 넘어간다 (시연 중 화면이 멈추지 않게)
const TIMEOUT_MS = 10_000;

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export type GenerateResult<T> = {
  data: T;
  usedFallback: boolean;
  /** 실제로 응답한 모델 버전 (응답의 modelVersion). 기본값을 썼으면 null */
  modelVersion: string | null;
  /** 기본값을 쓴 이유 (로그·검증 기록용) */
  fallbackReason: "no_key" | "error" | "invalid" | null;
};

/**
 * Gemini에 JSON 형식으로 답하게 하고 결과를 돌려준다.
 * 키가 없거나, 호출이 실패하거나, 결과가 검증을 통과하지 못하면 fallback을 돌려준다.
 * → 무료 등급 호출 제한·네트워크 장애가 있어도 앱 흐름이 끊기지 않게 하기 위함.
 * 프롬프트에는 이름·사용자 ID·지역 같은 식별 정보를 넣지 않는다 (호출하는 쪽 책임).
 */
export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  validate: (value: unknown) => value is T;
  fallback: T;
  /** 응답을 기다리는 시간. 기본 10초 (화면 요청). 미리 돌리는 일괄 분류처럼 화면이 기다리지 않는 작업만 늘린다 */
  timeoutMs?: number;
}): Promise<GenerateResult<T>> {
  if (!ai) return { data: opts.fallback, usedFallback: true, modelVersion: null, fallbackReason: "no_key" };

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
        abortSignal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      },
    });
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(response.text ?? "");
    } catch {
      // 빈 응답이나 JSON이 아닌 응답 → 아래 검증에서 걸러져 invalid로 처리
    }
    if (opts.validate(parsed)) {
      return {
        data: parsed,
        usedFallback: false,
        modelVersion: response.modelVersion ?? GEMINI_MODEL,
        fallbackReason: null,
      };
    }
    console.warn("[gemini] 응답이 형식에 맞지 않아 기본값 사용", parsed);
    return { data: opts.fallback, usedFallback: true, modelVersion: null, fallbackReason: "invalid" };
  } catch (error) {
    console.warn("[gemini] 호출 실패, 기본값 사용", error instanceof Error ? error.message : error);
    return { data: opts.fallback, usedFallback: true, modelVersion: null, fallbackReason: "error" };
  }
}
