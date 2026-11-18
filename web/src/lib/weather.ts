// 마음 날씨 종류 (체크인 API, 날씨 직접 고치기 API에서 함께 사용)
export const WEATHERS = ["sunny", "partly_cloudy", "cloudy", "rainy", "foggy"] as const;
export type Weather = (typeof WEATHERS)[number];

export function isWeather(v: unknown): v is Weather {
  return typeof v === "string" && (WEATHERS as readonly string[]).includes(v);
}
