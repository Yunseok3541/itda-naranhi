import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * Gemini에 JSON 형식으로 답하게 하고 결과를 돌려준다.
 * 키가 없거나, 호출이 실패하거나, 결과가 검증을 통과하지 못하면 fallback을 돌려준다.
 * → 무료 등급 호출 제한·네트워크 장애가 있어도 앱 흐름이 끊기지 않게 하기 위함.
 */
export async function generateJson<T>(opts: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  validate: (value: unknown) => value is T;
  fallback: T;
}): Promise<{ data: T; usedFallback: boolean }> {
  if (!ai) return { data: opts.fallback, usedFallback: true };

  try {
    const response = await ai.models.generateContent({
      model,
      contents: opts.prompt,
      config: {
        systemInstruction: opts.system,
        responseMimeType: "application/json",
        responseJsonSchema: opts.schema,
      },
    });
    const parsed: unknown = JSON.parse(response.text ?? "");
    if (opts.validate(parsed)) return { data: parsed, usedFallback: false };
    console.warn("[gemini] 응답이 형식에 맞지 않아 기본값 사용", parsed);
  } catch (error) {
    console.warn("[gemini] 호출 실패, 기본값 사용", error);
  }
  return { data: opts.fallback, usedFallback: true };
}
