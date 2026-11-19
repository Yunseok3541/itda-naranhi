// AI ① 오늘의 별 추천 (담당 고은비, 명세: docs/API명세.md "2. 오늘의 별 추천")
// 입력 검증 → 체크인 소유 확인 → 쉬어 가기면 빈 추천 → 오늘 추천 재사용 → 후보 계산 → generateJson
// → 후보 밖 ID 제거(남는 게 없으면 기본 후보) → 저장(실패해도 응답)
import { db as pool } from "@/lib/db";
import { generateJson } from "@/lib/gemini";
import { isSafeAiText } from "@/lib/safety";
import { type ApiResult, type Db, fail, ok, todayKst, toId } from "../_lib/http";

type TodayChoice = "rest" | "home" | "near" | "out";
type ActiveChoice = Exclude<TodayChoice, "rest">;
type Scope = "home" | "near" | "out";

type StarRow = {
  id: number;
  title: string;
  description: string | null;
  verify_type: "self" | "photo" | "gps";
  stage: number;
  constellation_name: string;
  status: "untried" | "dim" | "bright";
};

export type RecommendationItem = {
  starId: number;
  title: string;
  reason: string;
  // 아래는 별 수행 화면용 추가 정보 (계약 필드는 starId·title·reason)
  description: string | null;
  constellationName: string;
  verifyType: StarRow["verify_type"];
};

export const MAX_ITEMS = 3;

// 오늘 선택별 후보 범위 순서 (임시 규칙, 콘텐츠 정의서 확정 시 교체). 쉬어 가기(rest)는 추천하지 않음
const SCOPE_ORDER: Record<ActiveChoice, Scope[]> = {
  home: ["home"],
  near: ["near", "home"],
  out: ["out", "near", "home"],
};

// AI 실패 시 쓰는 기본 이유 (별이 속한 범위 기준)
const DEFAULT_REASON: Record<Scope, string> = {
  home: "오늘 고른 활동 범위에 맞춰 집 안에서 해 볼 수 있는 별이에요.",
  near: "집 근처가 괜찮다고 해서 현관 가까이에서 해 볼 수 있는 별이에요.",
  out: "바깥이 괜찮다고 해서 골라 본 바깥 별이에요.",
};

const MAX_CANDIDATES = 8;
const MAX_REASON = 80;

function scopeOf(star: Pick<StarRow, "verify_type" | "stage">): Scope {
  if (star.verify_type === "gps") return "out";
  return star.stage >= 2 ? "near" : "home";
}

function defaultReason(star: StarRow) {
  return DEFAULT_REASON[scopeOf(star)];
}

function toItem(star: StarRow, reason: string): RecommendationItem {
  return {
    starId: star.id,
    title: star.title,
    reason,
    description: star.description,
    constellationName: star.constellation_name,
    verifyType: star.verify_type,
  };
}

/** 오늘 선택에 맞는 후보 (범위 순서대로, 이미 딴 별은 제외. 다 땄으면 다시 포함) */
export function pickCandidates(stars: StarRow[], choice: ActiveChoice): StarRow[] {
  const order = SCOPE_ORDER[choice];
  const inScope = stars.filter((s) => order.includes(scopeOf(s)));
  const notBright = inScope.filter((s) => s.status !== "bright");
  const candidates = notBright.length > 0 ? notBright : inScope;
  return [...candidates]
    .sort((a, b) => order.indexOf(scopeOf(a)) - order.indexOf(scopeOf(b)))
    .slice(0, MAX_CANDIDATES);
}

const STOP_REASON_LABEL: Record<string, string> = {
  crowded: "사람이 많았음",
  weather: "날씨·상황이 안 맞았음",
  tired: "몸이나 마음이 힘들었음",
  no_time: "시간이 없었음",
  not_for_me: "나랑 안 맞았음",
  cost: "돈이 들었음",
  other: "기타",
};

const CHOICE_LABEL: Record<ActiveChoice, string> = { home: "집 안", near: "집 근처", out: "바깥" };

const SYSTEM = `너는 사회적 고립을 겪는 청년을 위한 앱에서 오늘 해 볼 작은 활동(별)을 골라 주는 동반자다.
- 반드시 주어진 후보 목록의 starId 중에서만 1~3개를 고른다. 목록에 없는 활동을 만들지 않는다.
- 사용자가 고른 오늘의 활동 범위를 가장 먼저 따른다. 부담스러워하는 상황은 피한다.
- 최근에 멈춘 이유가 있으면 그 부담이 적은 별을 고른다.
- reason은 해요체 한 문장, 60자 이내. 왜 이 별인지 사용자의 선택을 짚어 말한다.
- 지시·재촉·평가·과장·진단을 하지 않는다. 지정된 JSON만 출력한다.`;

type AiOutput = { items: { starId: number; reason: string }[] };

function isAiOutput(v: unknown): v is AiOutput {
  const r = v as AiOutput;
  return (
    !!r &&
    Array.isArray(r.items) &&
    r.items.every((i) => !!i && typeof i.starId === "number" && typeof i.reason === "string")
  );
}

// daily_recommendations.reason(TEXT)에 JSON으로 저장 (별마다 이유가 달라서. DB 변경 요청: items JSONB 칸)
type StoredRec = { v: 1; items: { starId: number; reason: string }[]; usedFallback: boolean; todayChoice?: ActiveChoice };

function parseStored(reason: string | null, starIds: number[]): StoredRec {
  try {
    const parsed = JSON.parse(reason ?? "") as StoredRec;
    if (parsed?.v === 1 && Array.isArray(parsed.items)) return parsed;
  } catch {
    // 예전 형식(이유 한 줄) → 모든 별에 같은 이유
  }
  return { v: 1, items: starIds.map((starId) => ({ starId, reason: reason ?? "" })), usedFallback: false };
}

const STAR_SQL = `
  SELECT s.id, s.title, s.description, s.verify_type, c.stage, c.name AS constellation_name,
         COALESCE(v.status, 'untried') AS status
  FROM stars s
  JOIN constellations c ON c.id = s.constellation_id
  LEFT JOIN v_user_star_status v ON v.star_id = s.id AND v.user_id = $1
  WHERE c.stage <= $2
  ORDER BY c.stage, s.constellation_id, s.position`;

const errorCode = (error: unknown) => (error as { code?: string }).code ?? (error instanceof Error ? error.message : "unknown");

/**
 * 오늘의 별 추천. userId는 반드시 세션(getDemoUserId)에서 구한 값을 넣는다.
 * 응답 200 { items: [{ starId, title, reason, ... }], usedFallback, reused, todayChoice }
 */
export async function recommend(
  userId: number,
  body: unknown,
  db: Db = pool,
  generate: typeof generateJson = generateJson, // 테스트에서 AI 응답을 바꿔 끼우기 위함
): Promise<ApiResult> {
  const checkinId = toId((body as { checkinId?: unknown } | null)?.checkinId);
  if (checkinId === null) return fail(400, "INVALID", "checkinId가 필요해요.");

  const today = todayKst();
  let checkin: { text: string; weather: string; user_weather: string | null; today_choice: TodayChoice | null } | undefined;
  let user: { current_stage: number; start_answers: { burden?: unknown } | null } | undefined;
  let stars: StarRow[];
  try {
    // 현재 세션 사용자의 체크인만 (남의 체크인은 없는 것처럼 404)
    checkin = (
      await db.query<NonNullable<typeof checkin>>(
        "SELECT text, weather, user_weather, today_choice FROM checkins WHERE id = $1 AND user_id = $2",
        [checkinId, userId],
      )
    ).rows[0];
    if (!checkin) return fail(404, "NOT_FOUND", "체크인을 찾을 수 없어요.");

    // 쉬어 가기: 빈 추천 (AI를 부르지 않고 저장하지 않음 → 같은 날 다른 범위를 고르면 그때 추천을 만든다)
    if (checkin.today_choice === "rest") return ok({ items: [], usedFallback: false, reused: false, todayChoice: "rest" });

    // 하루 한 번: 오늘 추천이 있으면 그대로 돌려준다 (체크인이 달라도, 날씨를 고쳐도)
    const reused = await loadToday(userId, today, db);
    if (reused) return ok({ ...reused, reused: true });

    user = (
      await db.query<NonNullable<typeof user>>("SELECT current_stage, start_answers FROM users WHERE id = $1", [userId])
    ).rows[0];
    // 시작 단계 + 바로 위 단계까지
    stars = (await db.query<StarRow>(STAR_SQL, [userId, (user?.current_stage ?? 1) + 1])).rows;
  } catch (error) {
    console.error("[recommendations] 조회 실패", errorCode(error));
    return fail(500, "LOAD_FAILED", "지금은 추천을 불러오지 못했어요.");
  }

  // 선택을 안 했으면 집 안 (rest는 위에서 이미 빈 추천으로 끝남)
  const choice: ActiveChoice = checkin.today_choice ?? "home";
  const candidates = pickCandidates(stars, choice);
  if (candidates.length === 0) return ok({ items: [], usedFallback: true, reused: false, todayChoice: choice });

  const recent = await recentAttempts(userId, db);
  const burden = Array.isArray(user?.start_answers?.burden) ? (user.start_answers.burden as string[]) : [];
  // 모델에는 식별 정보 없이 오늘 선택·부담 상황·날씨·한 줄·최근 시도(제목·결과·이유)·후보만 보낸다
  const prompt = JSON.stringify({
    오늘_활동_범위: CHOICE_LABEL[choice],
    부담스러운_상황: burden,
    마음_날씨: checkin.user_weather ?? checkin.weather,
    오늘의_한_줄: checkin.text,
    최근_시도: recent,
    후보: candidates.map((s) => ({ starId: s.id, 제목: s.title, 설명: s.description, 범위: CHOICE_LABEL[scopeOf(s)] })),
  });

  const byId = new Map(candidates.map((s) => [s.id, s]));
  const ai = await generate<AiOutput>({
    system: SYSTEM,
    prompt,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { starId: { type: "integer" }, reason: { type: "string" } },
            required: ["starId", "reason"],
          },
        },
      },
      required: ["items"],
    },
    validate: isAiOutput,
    fallback: { items: [] },
  });

  // 후보에 없는 ID·중복 제거, 최대 3개. 이유가 부적절하면 그 별만 기본 이유
  const seen = new Set<number>();
  let items: RecommendationItem[] = [];
  for (const i of ai.data.items) {
    const star = byId.get(i.starId);
    if (!star || seen.has(star.id) || items.length >= MAX_ITEMS) continue;
    seen.add(star.id);
    items.push(toItem(star, isSafeAiText(i.reason, MAX_REASON) ? i.reason.trim() : defaultReason(star)));
  }
  // AI 실패·빈 응답·형식 오류·모두 후보 밖 → 실제 후보 앞에서 3개 + 기본 이유
  const usedFallback = items.length === 0;
  if (usedFallback) items = candidates.slice(0, MAX_ITEMS).map((s) => toItem(s, defaultReason(s)));

  // 저장 실패해도 추천은 돌려준다. 동시에 두 번 요청되면 먼저 저장된 쪽을 돌려준다
  try {
    const stored: StoredRec = {
      v: 1,
      items: items.map(({ starId, reason }) => ({ starId, reason })),
      usedFallback,
      todayChoice: choice,
    };
    const inserted = await db.query(
      `INSERT INTO daily_recommendations (user_id, rec_date, star_ids, reason, checkin_id)
       VALUES ($1, $2::date, $3, $4, $5) ON CONFLICT (user_id, rec_date) DO NOTHING`,
      [userId, today, items.map((i) => i.starId), JSON.stringify(stored), checkinId],
    );
    if (inserted.rowCount === 0) {
      const first = await loadToday(userId, today, db);
      if (first) return ok({ ...first, reused: true });
    }
  } catch (error) {
    console.error("[recommendations] 저장 실패, 응답은 계속 진행", errorCode(error));
  }

  return ok({ items, usedFallback, reused: false, todayChoice: choice, modelVersion: ai.modelVersion });
}

async function loadToday(userId: number, today: string, db: Db) {
  const row = (
    await db.query<{ star_ids: number[]; reason: string | null }>(
      "SELECT star_ids, reason FROM daily_recommendations WHERE user_id = $1 AND rec_date = $2::date",
      [userId, today],
    )
  ).rows[0];
  if (!row) return null;
  const stored = parseStored(row.reason, row.star_ids);
  const rows = (
    await db.query<StarRow>(
      `SELECT s.id, s.title, s.description, s.verify_type, c.stage, c.name AS constellation_name, 'untried' AS status
       FROM stars s JOIN constellations c ON c.id = s.constellation_id WHERE s.id = ANY($1)`,
      [row.star_ids],
    )
  ).rows;
  const byId = new Map(rows.map((s) => [s.id, s]));
  const items = stored.items.flatMap((i) => {
    const star = byId.get(i.starId);
    return star ? [toItem(star, i.reason || defaultReason(star))] : [];
  });
  return { items, usedFallback: stored.usedFallback, todayChoice: stored.todayChoice ?? null };
}

/** 최근 시도 5개 (별 제목·결과·멈춘 이유만. 회고 원문은 보내지 않음) */
async function recentAttempts(userId: number, db: Db) {
  try {
    const { rows } = await db.query<{ title: string; status: string; stop_reason: string | null }>(
      `SELECT s.title, a.status, a.stop_reason FROM star_attempts a JOIN stars s ON s.id = a.star_id
       WHERE a.user_id = $1 ORDER BY a.created_at DESC LIMIT 5`,
      [userId],
    );
    return rows.map((r) => ({
      별: r.title,
      결과: r.status === "bright" ? "해냈음" : "시도함",
      멈춘_이유: r.stop_reason ? STOP_REASON_LABEL[r.stop_reason] : null,
    }));
  } catch {
    return [];
  }
}
