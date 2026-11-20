// 배지(마일스톤) 판정에 쓰는 사실들 — 프로필 화면용 (규칙: lib/milestones.ts)
// 모두 "한 번이라도 했는지"만 본다 (횟수·연속 기록 없음). 새 테이블 없이 지금 쌓이는 기록으로 계산
import { db as pool } from "@/lib/db";
import { type ApiResult, type Db, fail, ok } from "../_lib/http";

const SQL = `
  SELECT
    EXISTS (SELECT 1 FROM star_attempts WHERE user_id = $1) AS "firstAttempt",
    EXISTS (SELECT 1 FROM checkins WHERE user_id = $1) AS "checkin",
    EXISTS (SELECT 1 FROM star_attempts WHERE user_id = $1 AND coalesce(trim(reflection), '') <> '') AS "reflection",
    EXISTS (SELECT 1 FROM star_attempts WHERE user_id = $1 AND status = 'dim') AS "dim",
    EXISTS (
      SELECT 1 FROM star_attempts d JOIN star_attempts b
        ON b.user_id = d.user_id AND b.star_id = d.star_id AND b.status = 'bright' AND b.created_at > d.created_at
      WHERE d.user_id = $1 AND d.status = 'dim'
    ) AS "retried",
    EXISTS (SELECT 1 FROM checkins WHERE user_id = $1 AND today_choice = 'rest') AS "rested",
    EXISTS (
      SELECT 1 FROM star_attempts a JOIN stars s ON s.id = a.star_id JOIN constellations c ON c.id = s.constellation_id
      WHERE a.user_id = $1 AND c.stage >= 2
    ) AS "nearTried",
    EXISTS (SELECT 1 FROM star_attempts a JOIN stars s ON s.id = a.star_id WHERE a.user_id = $1 AND s.is_outside) AS "outsideTried",
    EXISTS (
      SELECT 1 FROM star_attempts a JOIN stars s ON s.id = a.star_id
      WHERE a.user_id = $1 AND s.category = 'center' AND s.is_outside AND a.status = 'bright'
    ) AS "centerBright",
    EXISTS (SELECT 1 FROM policy_events WHERE user_id = $1 AND event = 'clicked') AS "policyClicked",
    EXISTS (SELECT 1 FROM inquiry_drafts WHERE user_id = $1) AS "inquiryDrafted",
    EXISTS (SELECT 1 FROM inquiry_drafts WHERE user_id = $1 AND sent_at IS NOT NULL) AS "inquirySent",
    EXISTS (SELECT 1 FROM center_events WHERE user_id = $1 AND event = 'joined') AS "joined"`;

/** 200 { facts: MilestoneFacts } */
export async function getMilestoneFacts(userId: number, db: Db = pool): Promise<ApiResult> {
  try {
    const facts = (await db.query<Record<string, boolean>>(SQL, [userId])).rows[0] ?? {};
    return ok({ facts });
  } catch (error) {
    console.error("[milestones] 조회 실패", (error as { code?: string }).code ?? (error instanceof Error ? error.message : "unknown"));
    return fail(500, "LOAD_FAILED", "지금은 배지를 불러오지 못했어요.");
  }
}
