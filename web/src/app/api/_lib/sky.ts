// 밤하늘 조회 (docs/API명세.md "4. 밤하늘")
// 최종 상태는 v_user_star_status, 개별 기억은 star_attempts. 두 쿼리 모두 user_id로 거른다
import { db as pool } from "@/lib/db";
import { type ApiResult, type Db, fail, KST_DATE, ok } from "./http";

type Memory = { attemptId: number; date: string; status: "bright" | "dim"; reflection: string | null;
  parentAttemptId: number | null; subQuestId: number | null; customTitle: string | null };

export async function getSky(userId: number, db: Db = pool): Promise<ApiResult> {
  try {
    const stars = (
      await db.query<{
        id: number;
        title: string;
        description: string | null;
        constellation_id: number;
        constellation_name: string;
        position: number;
        verify_type: string;
        status: "untried" | "dim" | "bright";
        attempts: string;
        points: number;
      }>(
        // points: 밝힌 별만 그 별의 점수, 나머지는 0 (따기 전에는 점수를 보여주지 않음 → 숨겨진 난이도 유지)
        `SELECT s.id, s.title, s.description, s.constellation_id, c.name AS constellation_name, s.position, s.verify_type,
                COALESCE(v.status, 'untried') AS status, COALESCE(v.attempts, 0) AS attempts,
                CASE WHEN v.status = 'bright' THEN p.points ELSE 0 END AS points
         FROM stars s
         JOIN constellations c ON c.id = s.constellation_id
         JOIN v_star_points p ON p.star_id = s.id
         LEFT JOIN v_user_star_status v ON v.star_id = s.id AND v.user_id = $1
         ORDER BY c.stage, s.constellation_id, s.position`,
        [userId],
      )
    ).rows;

    const attempts = (
      await db.query<Memory & { star_id: number }>(
        `SELECT id AS "attemptId", star_id, ${KST_DATE("created_at")} AS date, status, reflection,
          parent_attempt_id AS "parentAttemptId", sub_quest_id AS "subQuestId", custom_title AS "customTitle"
         FROM star_attempts WHERE user_id = $1
         ORDER BY created_at DESC, id DESC`,
        [userId],
      )
    ).rows;

    const memories = new Map<number, Memory[]>();
    for (const { star_id, ...m } of attempts) {
      memories.set(star_id, [...(memories.get(star_id) ?? []), m]);
    }

    return ok({
      // 총 포인트 = 밝힌 별 점수의 합 (뷰 v_user_points와 같은 계산)
      totalPoints: stars.reduce((sum, s) => sum + Number(s.points), 0),
      stars: stars.map((s) => ({
        starId: s.id,
        title: s.title,
        description: s.description,
        constellationId: s.constellation_id,
        constellationName: s.constellation_name,
        position: s.position,
        verifyType: s.verify_type,
        status: s.status,
        attempts: Number(s.attempts),
        points: Number(s.points),
        memories: memories.get(s.id) ?? [],
      })),
    });
  } catch (error) {
    console.error("[sky] 조회 실패", error);
    return fail(500, "LOAD_FAILED", "지금은 밤하늘을 불러오지 못했어요.");
  }
}
