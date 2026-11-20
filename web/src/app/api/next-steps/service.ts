import { db as pool } from '@/lib/db';
import { generateJson } from '@/lib/gemini';
import { assessRisk, helpFor, isSafeAiText } from '@/lib/safety';
import { catalogQuest } from '@/lib/quest-catalog';
import {
  defaultNextKey, nextOptions, type ActivityScope, type AvailableQuest,
  type NextPlan, type NextSource,
} from '@/lib/next-step';
import { fail, ok, toId, type ApiResult, type Db } from '../_lib/http';

type SourceRow = NextSource & { risk: string | null };
const SOURCE_SQL = `SELECT id AS "attemptId", star_id AS "starId", status,
  stop_reason AS "stopReason", reflection, sub_quest_id AS "subQuestId", risk
  FROM star_attempts WHERE id = $1 AND user_id = $2`;

async function context(userId: number, attemptId: number, db: Db) {
  const source = (await db.query<SourceRow>(SOURCE_SQL, [attemptId, userId])).rows[0];
  if (!source) return null;
  const quests = (await db.query<AvailableQuest>(`SELECT s.id, s.title, c.stage,
    s.constellation_id AS "constellationId", s.is_outside AS outside,
    COALESCE(v.status, 'untried') AS status,
    COALESCE((SELECT json_agg(json_build_object('id', q.id, 'title', q.title) ORDER BY q.position)
      FROM sub_quests q WHERE q.star_id = s.id), '[]'::json) AS "subQuests"
    FROM stars s JOIN constellations c ON c.id = s.constellation_id
    LEFT JOIN v_user_star_status v ON v.star_id = s.id AND v.user_id = $1`, [userId])).rows
    // Never silently assign new catalog metadata to an old DB's reused ID.
    .filter(q => catalogQuest(q.id)?.title === q.title);
  const user = (await db.query<{ choice: string | null; range: string | null }>(`SELECT
    (SELECT today_choice FROM checkins WHERE user_id = $1
      AND (created_at AT TIME ZONE 'Asia/Seoul')::date = (now() AT TIME ZONE 'Asia/Seoul')::date
      ORDER BY created_at DESC, id DESC LIMIT 1) AS choice,
    start_answers->>'range' AS range FROM users WHERE id = $1`, [userId])).rows[0];
  const scope: ActivityScope = ['rest', 'home', 'near', 'out'].includes(user?.choice ?? '')
    ? user!.choice as ActivityScope : user?.range === 'home' ? 'home' : user?.range === 'near' ? 'near' : 'out';
  const help = helpFor(source.risk === 'danger' ? 'danger' : source.risk === 'caution' ? 'caution'
    : assessRisk(source.reflection ?? '', 'normal'));
  return { source, quests, help, options: nextOptions(source, quests, scope) };
}

type AiChoice = { key: string; reason: string };
const isChoice = (v: unknown): v is AiChoice => !!v && typeof v === 'object'
  && typeof (v as AiChoice).key === 'string' && typeof (v as AiChoice).reason === 'string';

/** Explicit request only: no daily recommendation cache, no new missions, no automatic selection. */
export async function suggestNext(userId: number, body: unknown, db: Db = pool, generate = generateJson): Promise<ApiResult> {
  const attemptId = toId((body as { attemptId?: unknown } | null)?.attemptId);
  if (attemptId === null) return fail(400, 'INVALID', '시도 기록을 골라 주세요.');
  try {
    const ctx = await context(userId, attemptId, db);
    if (!ctx) return fail(404, 'NOT_FOUND', '시도 기록을 찾을 수 없어요.');
    const { source, quests, help } = ctx;
    if (help) return ok({ attemptId, options: ctx.options.filter(o => o.action === 'stop'), recommendedKey: 'stop', usedFallback: true, help });
    if (!quests.some(q => q.id === source.starId)) {
      return fail(503, 'LOAD_FAILED', '퀘스트 목록과 서버 콘텐츠가 달라요. 콘텐츠 동기화 후 다시 확인해 주세요.');
    }
    const options = ctx.options.map(o => ({ ...o }));
    const fallbackKey = defaultNextKey(source, options);
    // Send no IDs identifying the user, no profile, and no free-text reflection.
    // The selected stop reason is explicit, not a diagnosis inferred by the model.
    let ai;
    try {
      ai = options.length > 1 ? await generate<AiChoice>({
        system: '사용자가 직접 고른 활동 결과와 멈춘 이유를 참고해 주어진 다음 행동 중 하나만 제안한다. key는 후보에서만 고른다. reason은 해요체 80자 이내. 새로운 활동, 장소, 운영정보, 진단, 재촉, 과장, 자동 난이도 상승은 금지한다. 선택은 사용자가 하며 쉬어 가기도 동등한 선택이다. JSON만 출력한다.',
        prompt: JSON.stringify({ 결과: source.status, 멈춘_이유: source.stopReason,
          후보: options.map(o => ({ key: o.key, 행동: o.action, 제목: o.title, 설명: o.reason })) }),
        schema: { type: 'object', properties: { key: { type: 'string', enum: options.map(o => o.key) }, reason: { type: 'string' } }, required: ['key', 'reason'] },
        validate: isChoice, fallback: { key: fallbackKey, reason: '' },
      }) : null;
    } catch { ai = null; }
    const valid = ai && !ai.usedFallback && isChoice(ai.data)
      && options.some(o => o.key === ai!.data.key) && isSafeAiText(ai.data.reason, 100);
    const recommendedKey = valid ? ai!.data.key : fallbackKey;
    if (valid) options.find(o => o.key === recommendedKey)!.reason = ai!.data.reason.trim();
    await db.query(`UPDATE star_attempts SET suggested_action = $3
      WHERE id = $1 AND user_id = $2 AND next_action IS NULL`,
    [attemptId, userId, options.find(o => o.key === recommendedKey)!.action]);
    return ok({ attemptId, options, recommendedKey, usedFallback: !valid, help: null });
  } catch {
    return fail(500, 'LOAD_FAILED', '기록은 그대로 있어요. 다음 행동을 불러오지 못했어요.');
  }
}

/** Recompute allowed candidates on the server; never trust a client-provided target/title. */
export async function chooseNext(userId: number, body: unknown, db: Db = pool): Promise<ApiResult> {
  const b = body as { attemptId?: unknown; key?: unknown } | null;
  const attemptId = toId(b?.attemptId);
  if (attemptId === null || typeof b?.key !== 'string') return fail(400, 'INVALID', '다음 행동을 골라 주세요.');
  try {
    const ctx = await context(userId, attemptId, db);
    if (!ctx) return fail(404, 'NOT_FOUND', '시도 기록을 찾을 수 없어요.');
    const option = ctx.options.find(o => o.key === b.key);
    if (!option || (ctx.help && option.action !== 'stop')) return fail(400, 'INVALID', '지금 선택할 수 있는 행동이 아니에요.', { help: ctx.help });
    const updated = await db.query(`UPDATE star_attempts a SET next_action = $3,
      next_sub_quest_id = $4, next_star_id = $5
      WHERE a.id = $1 AND a.user_id = $2
      AND NOT EXISTS (SELECT 1 FROM star_attempts child WHERE child.parent_attempt_id = a.id AND child.user_id = $2)
      RETURNING a.id`, [attemptId, userId, option.action,
      option.action === 'smaller' ? option.subQuestId : null, option.action === 'swap' ? option.starId : null]);
    if (!updated.rowCount) return fail(400, 'INVALID', '이미 이어서 기록한 행동이에요. 새 기록에서 골라 주세요.');
    return ok({ plan: option.action === 'stop' ? null : { ...option, attemptId }, stopped: option.action === 'stop' });
  } catch {
    return fail(500, 'SAVE_FAILED', '다음 행동을 저장하지 못했어요. 다시 골라 주세요.');
  }
}

/** Latest selected plan only: completed/stopped plans must not resurrect older choices. */
export async function pendingNext(userId: number, db: Db = pool): Promise<ApiResult> {
  try {
    const row = (await db.query<{ attemptId: number; action: string; starId: number; subQuestId: number | null; title: string; done: boolean }>(`SELECT
      a.id AS "attemptId", a.next_action AS action,
      COALESCE(a.next_star_id, a.star_id) AS "starId",
      CASE WHEN a.next_action = 'smaller' THEN a.next_sub_quest_id
        WHEN a.next_action = 'retry' THEN a.sub_quest_id ELSE NULL END AS "subQuestId",
      COALESCE(q.title, s.title) AS title,
      EXISTS (SELECT 1 FROM star_attempts child WHERE child.parent_attempt_id = a.id AND child.user_id = $1) AS done
      FROM star_attempts a JOIN stars s ON s.id = COALESCE(a.next_star_id, a.star_id)
      LEFT JOIN sub_quests q ON q.star_id = s.id AND q.id = CASE
        WHEN a.next_action = 'smaller' THEN a.next_sub_quest_id WHEN a.next_action = 'retry' THEN a.sub_quest_id END
      WHERE a.user_id = $1 AND a.next_action IS NOT NULL
      ORDER BY a.created_at DESC, a.id DESC LIMIT 1`, [userId])).rows[0];
    if (!row || row.done || row.action === 'stop') return ok({ plan: null });
    const plan: NextPlan = { attemptId: row.attemptId, action: row.action as NextPlan['action'],
      key: row.action === 'smaller' ? `smaller:${row.subQuestId}` : row.action === 'swap' ? `swap:${row.starId}` : 'retry',
      starId: row.starId, subQuestId: row.subQuestId, title: row.title, reason: '지난번에 직접 골라 둔 한 걸음이에요. 오늘 바꿔도 괜찮아요.',
      ...(catalogQuest(row.starId)?.category === 'center' && /문의 문장/.test(row.title) ? { preparationHref: '/centers' } : {}),
    };
    return ok({ plan });
  } catch {
    return fail(500, 'LOAD_FAILED', '이어갈 행동을 불러오지 못했어요.');
  }
}
