// AI ② 체크인 → 마음 날씨 + AI ③ 위험 신호 + 오늘 필요한 것 (한 번의 호출, 고민기록 #47)
// api/checkin/route.ts에 있던 지시문·형식을 그대로 옮기고 needs만 더함. 위험 감지 평가(scripts/eval-risk.mts)도 이 지시문을 그대로 쓴다
// needs는 정책 추천의 시작 질문 ⑥과 같은 말(money_job·health·family·people)이라 점수 계산을 새로 만들지 않음
import { generateJson } from "@/lib/gemini";
import type { Risk } from "@/lib/safety";
import { WEATHERS, isWeather, type Weather } from "@/lib/weather";

export const CHECKIN_NEEDS = ["money_job", "health", "family", "people"] as const;
export type CheckinNeed = (typeof CHECKIN_NEEDS)[number];
export const NEED_LABEL: Record<CheckinNeed, string> = { money_job: "돈·일", health: "몸·마음 건강", family: "가족", people: "사람" };

export type CheckinAi = { weather: Weather; risk: Risk; needs: CheckinNeed[] };

export const CHECKIN_SYSTEM = `너는 사회적 고립을 겪는 청년을 위한 앱의 체크인 분석기다.
사용자의 한 줄 일기를 읽고 오늘의 마음 상태에 가까운 날씨 하나를 제안한다. 사용자가 언제든 고칠 수 있는 참고값이다.
- sunny: 기운 있음 / partly_cloudy: 보통 / cloudy: 지침·무기력 / rainy: 우울·슬픔 / foggy: 혼란·불안
- 자해, 자살, 삶을 끝내고 싶다는 뜻이 보이면 risk=danger, 애매하게 위험해 보이면 caution, 그 외 normal.
- needs: 한 줄에 **분명히 드러난** 현실적인 걱정만 고른다. money_job(돈·월세·일자리·생활비) health(몸이나 마음 건강) family(가족 관계·돌봄) people(외로움·사람과 이어지기). 짐작하지 않는다. 없으면 빈 배열.
진단하거나 조언하지 말고, 지정된 JSON만 출력한다.`;

export const checkinSchema = {
  type: "object",
  properties: {
    weather: { type: "string", enum: [...WEATHERS] },
    risk: { type: "string", enum: ["normal", "caution", "danger"] },
    needs: { type: "array", items: { type: "string", enum: [...CHECKIN_NEEDS] } },
  },
  required: ["weather", "risk", "needs"],
};

function isCheckinAi(v: unknown): v is CheckinAi {
  const r = v as CheckinAi;
  return !!r && isWeather(r.weather) && ["normal", "caution", "danger"].includes(r.risk) && (r.needs === undefined || Array.isArray(r.needs));
}

/**
 * 한 줄 체크인을 AI에 한 번 보낸다. 실패하면 기본값(보통 날씨, normal, 필요 없음)과 usedFallback=true.
 * 위험은 여기서 정하지 않는다 (부르는 쪽이 규칙과 합쳐 assessRisk). needs는 AI가 danger로 봤으면 비운다 (위기에 정책을 내밀지 않음)
 */
export async function analyzeCheckin(text: string, generate: typeof generateJson = generateJson) {
  const r = await generate<CheckinAi>({
    system: CHECKIN_SYSTEM,
    prompt: `오늘의 한 줄: ${text}`,
    schema: checkinSchema,
    validate: isCheckinAi,
    fallback: { weather: "partly_cloudy", risk: "normal", needs: [] },
  });
  const needs = r.usedFallback || r.data.risk === "danger"
    ? []
    : [...new Set(r.data.needs ?? [])].filter((n): n is CheckinNeed => (CHECKIN_NEEDS as readonly string[]).includes(n));
  return { weather: r.data.weather, aiRisk: r.data.risk, needs, usedFallback: r.usedFallback, modelVersion: r.modelVersion };
}
