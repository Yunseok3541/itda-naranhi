// AI ⑥ 문의 문장 초안 (docs/API명세.md "6. 문의 문장 초안")
// 센터 정보 + 사용자 질문만으로 초안을 만든다. 입력에 없는 숫자(전화번호·시간 등)가 들어가면 버리고 기본 틀
import { db as pool } from "@/lib/db";
import { generateJson } from "@/lib/gemini";
import { assessRisk, helpFor, isSafeAiText, ruleHelp, type Risk } from "@/lib/safety";
import { findCenter } from "./centers";
import { type ApiResult, type Db, fail, KST_DATE, ok, toId } from "./http";

const MAX_DRAFT = 400;

const SYSTEM = `너는 청년이 청년센터에 보낼 문의 메시지 초안을 함께 쓰는 도우미다.
- 사용자가 적은 궁금한 점을 정중한 해요체 문의 문장 2~4문장으로 정리한다. "안녕하세요."로 시작한다.
- 센터 이름과 프로그램 정보, 사용자가 적은 내용만 쓴다. 운영시간·전화번호·날짜·가격·예약 규칙 같은 사실을 지어내지 않는다.
- 사용자가 쓰지 않은 개인 사정(건강, 상태, 이름, 나이)을 덧붙이지 않는다.
- 프로그램 설명 문장을 따옴표로 그대로 옮겨 적지 않는다. 필요하면 프로그램 이름만 쓴다.
- risk: 질문에 자해·자살·삶을 끝내고 싶다는 뜻이 보이면 danger, 애매하게 위험해 보이면 caution, 그 외 normal.
지정된 JSON만 출력한다.`;

type AiOutput = { draft: string; risk: Risk };

function isAiOutput(v: unknown): v is AiOutput {
  const r = v as AiOutput;
  return !!r && typeof r.draft === "string" && ["normal", "caution", "danger"].includes(r.risk);
}

/** 입력에 없던 숫자가 초안에 들어갔는지 (지어낸 사실 방지) */
function hasNewNumbers(draft: string, source: string) {
  return (draft.match(/\d+/g) ?? []).some((n) => !source.includes(n));
}

export function fallbackDraft(centerName: string, question: string) {
  const q = /[.?!요]$/.test(question) ? question : `${question}?`;
  return `안녕하세요. ${centerName}에 처음 문의드려요. ${q} 알려주시면 감사하겠습니다.`;
}

// sent: false = 초안만 저장한 상태 / true = 사용자가 "문의해 봤어요"로 직접 기록한 상태 (앱은 문의를 보내지 않음)
type DraftRow = {
  draftId: number;
  centerId: number;
  question: string | null;
  draft: string;
  sent: boolean;
  sentAt: string | null;
  date: string;
};

const DRAFT_COLUMNS = `id AS "draftId", center_id AS "centerId", question, draft,
  (sent_at IS NOT NULL) AS sent, ${KST_DATE("sent_at")} AS "sentAt", ${KST_DATE("created_at")} AS date`;

/** 규칙만으로 본 안내 (AI를 부르지 않는 응답에도 help를 담기 위함) */
export const ruleHelpFromText = ruleHelp;

export async function createDraft(userId: number, body: unknown, db: Db = pool): Promise<ApiResult> {
  const b = (body ?? {}) as { centerId?: unknown; question?: unknown };
  const inputHelp = ruleHelpFromText(b.question);
  const centerId = toId(b.centerId);
  if (centerId === null) return fail(400, "INVALID", "centerId가 필요해요.", { help: inputHelp });
  const question = typeof b.question === "string" ? b.question.trim() : "";
  if (!question || question.length > 300) {
    return fail(400, "INVALID", "궁금한 점을 300자 이하로 적어 주세요.", { help: inputHelp });
  }
  const center = findCenter(centerId);
  if (!center) return fail(404, "NOT_FOUND", "센터를 찾을 수 없어요.", { help: inputHelp });

  const centerInfo = { 센터: center.name, 프로그램: center.programs.map((p) => `${p.title}: ${p.summary}`) };
  const fallback = fallbackDraft(center.name, question);
  const ai = await generateJson<AiOutput>({
    system: SYSTEM,
    prompt: JSON.stringify({ ...centerInfo, 궁금한_점: question }),
    schema: {
      type: "object",
      properties: { draft: { type: "string" }, risk: { type: "string", enum: ["normal", "caution", "danger"] } },
      required: ["draft", "risk"],
    },
    validate: isAiOutput,
    fallback: { draft: fallback, risk: "normal" },
  });

  const risk = assessRisk(question, ai.usedFallback ? null : ai.data.risk);
  const sourceText = JSON.stringify(centerInfo) + question;
  const aiDraftOk =
    !ai.usedFallback && isSafeAiText(ai.data.draft, MAX_DRAFT) && !hasNewNumbers(ai.data.draft, sourceText);
  const draft = aiDraftOk ? ai.data.draft.trim() : fallback;
  const help = helpFor(risk);

  try {
    const { rows } = await db.query<DraftRow>(
      `INSERT INTO inquiry_drafts (user_id, center_id, question, draft) VALUES ($1, $2, $3, $4)
       RETURNING ${DRAFT_COLUMNS}`,
      [userId, centerId, question, draft],
    );
    return ok({ ...rows[0], usedFallback: !aiDraftOk, risk, help, modelVersion: ai.modelVersion }, 201);
  } catch (error) {
    console.error("[inquiries] 저장 실패", error);
    return fail(500, "SAVE_FAILED", "지금은 초안을 저장하지 못했어요.", { draft, help });
  }
}

export async function listDrafts(userId: number, rawCenterId: string | null, db: Db = pool): Promise<ApiResult> {
  const centerId = rawCenterId === null ? null : toId(rawCenterId);
  if (rawCenterId !== null && centerId === null) return fail(400, "INVALID", "centerId가 올바르지 않아요.");
  try {
    const { rows } = await db.query<DraftRow>(
      `SELECT ${DRAFT_COLUMNS} FROM inquiry_drafts
       WHERE user_id = $1 AND ($2::int IS NULL OR center_id = $2)
       ORDER BY created_at DESC, id DESC`,
      [userId, centerId],
    );
    return ok({ drafts: rows });
  } catch (error) {
    console.error("[inquiries] 조회 실패", error);
    return fail(500, "LOAD_FAILED", "지금은 초안을 불러오지 못했어요.");
  }
}

export async function updateDraft(userId: number, rawId: string, body: unknown, db: Db = pool): Promise<ApiResult> {
  const b = (body ?? {}) as { draft?: unknown; sent?: unknown };
  const inputHelp = ruleHelpFromText(b.draft);
  const id = toId(rawId);
  if (id === null) return fail(400, "INVALID", "draftId가 올바르지 않아요.", { help: inputHelp });
  const draft = b.draft === undefined ? null : typeof b.draft === "string" ? b.draft.trim() : "";
  if (draft !== null && (!draft || draft.length > 1000)) {
    return fail(400, "INVALID", "초안은 1000자 이하로 적어 주세요.", { help: inputHelp });
  }
  if (b.sent !== undefined && b.sent !== true) return fail(400, "INVALID", "sent는 true만 보낼 수 있어요.", { help: inputHelp });
  if (draft === null && b.sent !== true) return fail(400, "INVALID", "draft나 sent 중 하나가 필요해요.");

  try {
    const { rows } = await db.query<DraftRow>(
      `UPDATE inquiry_drafts
       SET draft = COALESCE($3, draft),
           sent_at = CASE WHEN $4 THEN COALESCE(sent_at, now()) ELSE sent_at END
       WHERE id = $1 AND user_id = $2
       RETURNING ${DRAFT_COLUMNS}`,
      [id, userId, draft, b.sent === true],
    );
    if (!rows[0]) return fail(404, "NOT_FOUND", "초안을 찾을 수 없어요.", { help: inputHelp });
    return ok({ ...rows[0], help: inputHelp });
  } catch (error) {
    console.error("[inquiries] 수정 실패", error);
    return fail(500, "SAVE_FAILED", "지금은 저장하지 못했어요. 적어 둔 글은 그대로 있어요.", { help: inputHelp });
  }
}
