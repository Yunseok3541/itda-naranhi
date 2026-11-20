// 프로필 이미지: 획득한 별자리의 도감 캐릭터 중에서 고른다 (docs/API명세.md "8-1. 프로필 이미지", 고민기록 #33)
// 획득 = 그 별자리의 별을 모두 한 번 이상 땄음 (뷰 v_user_acquired_constellations, 도감 화면과 같은 기준)
// 저장값은 별자리 ID (users.avatar_constellation_id). NULL = 기본 캐릭터. 캐릭터 그림은 화면이 catalog/characters.ts의 constellationId로 찾는다
import { db as pool } from "@/lib/db";
import { type ApiResult, type Db, fail, KST_DATE, ok, toId } from "../../_lib/http";

const errorCode = (error: unknown) => (error as { code?: string }).code ?? (error instanceof Error ? error.message : "unknown");

/** 별자리 목록 + 획득 여부 + 지금 프로필 이미지. 사용자가 없으면 null */
async function load(userId: number, db: Db) {
  const user = (await db.query<{ avatar_constellation_id: number | null }>(
    "SELECT avatar_constellation_id FROM users WHERE id = $1", [userId],
  )).rows[0];
  if (!user) return null;
  const rows = (await db.query<{ id: number; name: string; acquired_date: string | null }>(
    `SELECT c.id, c.name, ${KST_DATE("a.acquired_at")} AS acquired_date
     FROM constellations c
     LEFT JOIN v_user_acquired_constellations a ON a.constellation_id = c.id AND a.user_id = $1
     ORDER BY c.id`,
    [userId],
  )).rows;
  const constellations = rows.map((r) => ({
    constellationId: r.id,
    name: r.name,
    acquired: r.acquired_date !== null,
    acquiredDate: r.acquired_date, // 한국 날짜 'YYYY-MM-DD' (마지막 별을 처음 딴 날), 미획득이면 null
  }));
  // 저장된 별자리를 더는 획득한 상태가 아니면(콘텐츠 변경으로 별이 늘어난 경우 등) 기본 캐릭터로 보여 준다
  const stored = user.avatar_constellation_id;
  const avatarConstellationId = stored !== null && constellations.some((c) => c.constellationId === stored && c.acquired) ? stored : null;
  return { avatarConstellationId, constellations };
}

/** GET /api/profile/avatar — 200 { avatarConstellationId, constellations: [{ constellationId, name, acquired, acquiredDate }] } */
export async function getAvatar(userId: number, db: Db = pool): Promise<ApiResult> {
  try {
    const body = await load(userId, db);
    return body ? ok(body) : fail(404, "NOT_FOUND", "사용자를 찾을 수 없어요.");
  } catch (error) {
    console.error("[avatar] 조회 실패", errorCode(error));
    return fail(500, "LOAD_FAILED", "지금은 별자리 목록을 불러오지 못했어요.");
  }
}

/**
 * PUT /api/profile/avatar — body { constellationId: number | null } (null = 기본 캐릭터)
 * 획득하지 않은 별자리는 403 NOT_ACQUIRED, 없는 별자리는 404. 성공하면 GET과 같은 모양
 */
export async function saveAvatar(userId: number, body: unknown, db: Db = pool): Promise<ApiResult> {
  if (!body || typeof body !== "object" || Array.isArray(body) || !("constellationId" in body)) {
    return fail(400, "INVALID", "고를 별자리가 필요해요.", { field: "constellationId" });
  }
  const raw = (body as { constellationId: unknown }).constellationId;
  const constellationId = raw === null ? null : toId(raw);
  if (raw !== null && constellationId === null) return fail(400, "INVALID", "별자리 번호를 확인해 주세요.", { field: "constellationId" });

  try {
    if (constellationId !== null) {
      const check = (await db.query<{ known: boolean; acquired: boolean }>(
        `SELECT EXISTS (SELECT 1 FROM constellations WHERE id = $2) AS known,
                EXISTS (SELECT 1 FROM v_user_acquired_constellations WHERE user_id = $1 AND constellation_id = $2) AS acquired`,
        [userId, constellationId],
      )).rows[0];
      if (!check.known) return fail(404, "NOT_FOUND", "별자리를 찾을 수 없어요.");
      if (!check.acquired) return fail(403, "NOT_ACQUIRED", "아직 별을 모두 따지 않은 별자리예요. 별을 모두 따면 고를 수 있어요.");
    }
  } catch (error) {
    console.error("[avatar] 획득 확인 실패", errorCode(error));
    return fail(500, "LOAD_FAILED", "지금은 별자리를 확인하지 못했어요.");
  }

  try {
    // 저장 문장에서도 획득 여부를 한 번 더 확인 (위 확인과 저장 사이에 상태가 바뀌어도 미획득 별자리는 저장되지 않음)
    const updated = (await db.query(
      `UPDATE users SET avatar_constellation_id = $2::int
       WHERE id = $1
         AND ($2::int IS NULL OR EXISTS (
           SELECT 1 FROM v_user_acquired_constellations WHERE user_id = $1 AND constellation_id = $2::int))
       RETURNING id`,
      [userId, constellationId],
    )).rowCount;
    if (!updated) {
      const exists = (await db.query("SELECT 1 FROM users WHERE id = $1", [userId])).rowCount;
      return exists
        ? fail(403, "NOT_ACQUIRED", "아직 별을 모두 따지 않은 별자리예요. 별을 모두 따면 고를 수 있어요.")
        : fail(404, "NOT_FOUND", "사용자를 찾을 수 없어요.");
    }
  } catch (error) {
    console.error("[avatar] 저장 실패", errorCode(error));
    return fail(500, "SAVE_FAILED", "지금은 프로필 이미지를 바꾸지 못했어요.");
  }

  try {
    const body = await load(userId, db);
    return body ? ok(body) : fail(404, "NOT_FOUND", "사용자를 찾을 수 없어요.");
  } catch (error) {
    // 저장은 됐으므로 실패로 보내지 않고 고른 값만 돌려준다
    console.error("[avatar] 저장 후 조회 실패", errorCode(error));
    return ok({ avatarConstellationId: constellationId, constellations: null });
  }
}
