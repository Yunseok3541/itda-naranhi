// 별 시도 저장 + AI ④ 회고 응원 + AI ③ 위기 표현 (docs/API명세.md "3. 별 시도 저장")
// 입력 검증 → 별 확인 → generateJson(응원 + 위험) → 규칙과 합친 위험도 → 저장 → 응답
// 저장이 실패해도 help는 전달하고, 실패를 성공으로 보내지 않는다
import { db as pool } from "@/lib/db";
import { generateJson } from "@/lib/gemini";
import { assessRisk, helpFor, isSafeAiText, type Risk } from "@/lib/safety";
import { type ApiResult, type Db, fail, KST_DATE, ok, toId } from "./http";

const STATUSES = ["bright", "dim"] as const;
const VERIFY_METHODS = ["self", "photo", "gps"] as const;
export const STOP_REASONS = ["crowded", "weather", "tired", "no_time", "not_for_me", "cost", "other"] as const;
type Status = (typeof STATUSES)[number];

// AI가 늦거나 실패하면 쓰는 문구 (docs/기획/기능완료기준과_콘텐츠.md)
export const DEFAULT_CHEER: Record<Status, string> = {
  bright: "오늘 해낸 일을 이 별에 담았어요.",
  dim: "오늘 손을 뻗어 본 순간을 이 별에 담았어요.",
};

const MAX_CHEER = 100;

const STOP_REASON_LABEL: Record<string, string> = {
  crowded: "사람이 많았어요",
  weather: "날씨·상황이 안 맞았어요",
  tired: "몸이나 마음이 힘들었어요",
  no_time: "시간이 없었어요",
  not_for_me: "나랑 안 맞았어요",
  cost: "돈이 들어서요",
  other: "다른 이유가 있어요",
};

const SYSTEM = `너는 사회적 고립을 겪는 청년을 위한 앱의 짧은 동반자다. 사용자가 작은 활동(별)을 해 본 뒤 남긴 회고 한 줄에 응원을 건넨다.
- cheer: 해요체 한두 문장, 80자 이내. 회고에 나온 구체적인 행동을 짚는다.
- 끝까지 하지 못한 시도(dim)도 시도 자체를 인정한다. 실패라고 부르지 않는다.
- 지시·재촉("~해야 해요", "다음엔 꼭"), 과장된 칭찬("최고", "완벽"), 진단·치료 이야기를 하지 않는다.
- risk: 회고에 자해·자살·삶을 끝내고 싶다는 뜻이 보이면 danger, 애매하게 위험해 보이면 caution, 그 외 normal.
지정된 JSON만 출력한다.`;

type AiOutput = { cheer: string; risk: Risk };

function isAiOutput(v: unknown): v is AiOutput {
  const r = v as AiOutput;
  return !!r && typeof r.cheer === "string" && ["normal", "caution", "danger"].includes(r.risk);
}

function optionalString(v: unknown, max: number): string | null | false {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string" || v.trim().length > max) return false;
  return v.trim() || null;
}

/** 규칙만으로 본 안내 (검증 실패·저장 실패처럼 AI를 부르지 않는 응답에도 help를 담기 위함) */
export function ruleHelpFromBody(body: unknown) {
  const text = (body as { reflection?: unknown } | null)?.reflection;
  return typeof text === "string" && text.trim() ? helpFor(assessRisk(text, null)) : null;
}

export async function createAttempt(
  userId: number,
  body: unknown,
  db: Db = pool,
  generate: typeof generateJson = generateJson, // 테스트에서 AI 응답을 바꿔 끼우기 위함
): Promise<ApiResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const ruleHelp = ruleHelpFromBody(body);
  const invalid = (msg: string) => fail(400, "INVALID", msg, { help: ruleHelp });

  const starId = toId(b.starId);
  if (starId === null) return invalid("starId가 필요해요.");
  if (!STATUSES.includes(b.status as Status)) return invalid("status는 bright 또는 dim이어야 해요.");
  const status = b.status as Status;

  const reflection = optionalString(b.reflection, 300);
  if (reflection === false) return invalid("회고는 300자 이하로 적어 주세요.");

  const verifyMethod = b.verifyMethod ?? "self";
  if (!VERIFY_METHODS.includes(verifyMethod as (typeof VERIFY_METHODS)[number])) {
    return invalid("verifyMethod는 self, photo, gps 중 하나예요.");
  }

  const stopReason = b.stopReason ?? null;
  if (stopReason !== null) {
    if (!STOP_REASONS.includes(stopReason as (typeof STOP_REASONS)[number])) return invalid("stopReason이 올바르지 않아요.");
    if (status !== "dim") return invalid("stopReason은 손 뻗어 보기(dim)일 때만 보낼 수 있어요.");
  }

  const placeId = optionalString(b.placeId, 30);
  const placeName = optionalString(b.placeName, 100);
  if (placeId === false || placeName === false) return invalid("장소 정보가 너무 길어요.");
  if ((placeId || placeName) && verifyMethod !== "gps") return invalid("장소 정보는 gps 확인일 때만 보낼 수 있어요.");

  // 별 확인. DB가 안 되면 제목 없이 진행하고 저장 단계에서 실패로 응답한다 (help는 유지)
  let title: string | null = null;
  try {
    const star = (await db.query<{ title: string }>("SELECT title FROM stars WHERE id = $1", [starId])).rows[0];
    if (!star) return fail(404, "NOT_FOUND", "별을 찾을 수 없어요.", { help: ruleHelp });
    title = star.title;
  } catch (error) {
    console.error("[attempts] 별 조회 실패", error);
  }

  // 회고가 있을 때만 AI 호출 (응원 + 위험 판단 한 번에). 회고가 없으면 기본 문구
  let cheer = DEFAULT_CHEER[status];
  let usedFallback = true;
  let risk: Risk = "normal";
  let modelVersion: string | null = null;
  if (reflection) {
    const ai = await generate<AiOutput>({
      system: SYSTEM,
      prompt: JSON.stringify({
        별: title ?? "작은 활동",
        결과: status === "bright" ? "해냈어요(하늘의 별 따기)" : "시도했어요(손 뻗어 보기)",
        멈춘_이유: stopReason ? STOP_REASON_LABEL[stopReason as string] : null,
        회고: reflection,
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
      fallback: { cheer: DEFAULT_CHEER[status], risk: "normal" },
    });
    // AI가 실패했으면 기본값(normal)을 믿지 않고 규칙 + 부정 표현으로 판단
    risk = assessRisk(reflection, ai.usedFallback ? null : ai.data.risk);
    modelVersion = ai.modelVersion;
    // 위험 신호가 있으면 밝은 응원 대신 기본 문구 + 안내
    if (!ai.usedFallback && risk === "normal" && isSafeAiText(ai.data.cheer, MAX_CHEER)) {
      cheer = ai.data.cheer.trim();
      usedFallback = false;
    }
  }
  const help = helpFor(risk);

  try {
    const { rows } = await db.query<{ id: number; date: string }>(
      `INSERT INTO star_attempts (user_id, star_id, status, verify_method, place_id, place_name, reflection, stop_reason, cheer)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, ${KST_DATE("created_at")} AS date`,
      [userId, starId, status, verifyMethod, placeId, placeName, reflection, stopReason, cheer],
    );
    return ok(
      { attemptId: rows[0].id, starId, status, date: rows[0].date, reflection, cheer, usedFallback, risk, help, modelVersion },
      201,
    );
  } catch (error) {
    console.error("[attempts] 저장 실패", error);
    return fail(500, "SAVE_FAILED", "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.", { help });
  }
}
