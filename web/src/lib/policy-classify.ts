// AI ⑤ 정책 분류: 쉬운 말 요약 · 신청·참여 방식 · 참여 난이도 · 관련도 · 분야 태그
// 미리 한 번만 (수집할 때 새·바뀐 정책만) 분류해 저장한다. 사용자 요청마다 부르지 않음
// AI에는 공공 정책 문장만 보낸다 (사용자 정보 없음)
import type { Db } from "@/app/api/_lib/http";
import { generateJson } from "@/lib/gemini";

export const BURDENS = ["online", "phone", "visit", "group"] as const;
export type Burden = (typeof BURDENS)[number];
export const BURDEN_LABEL: Record<Burden, string> = {
  online: "온라인으로 신청",
  phone: "전화·상담이 필요해요",
  visit: "직접 방문해야 해요",
  group: "여럿이 함께하는 활동이에요",
};

export const TAGS = ["생활비", "주거", "일자리", "배움", "마음건강", "문화·여가", "사람과 함께", "건강", "금융"] as const;

/**
 * 참여 난이도의 최소값 (AI가 낮게 매겨도 신청 방식에 맞춰 올림 — 애매하면 더 높은 쪽)
 * 난이도는 별 단계와 같은 눈금: 1 집 안 … 6 대화·참여
 */
export const MIN_DIFFICULTY: Record<Burden, number> = { online: 1, visit: 3, phone: 5, group: 6 };

const BATCH = 8;

// "개인이 신청·이용할 수 있는가"를 정책 이름으로 보정하는 규칙 (AI 판단이 양쪽으로 틀린 사례가 있어 규칙을 우선)
// 둘 다 걸리면 사업(false) 우선. 어느 쪽에도 안 걸리면 AI 판단을 그대로 쓴다
const PROJECT_WORDS = /실태\s*조사|고도화|시범\s*설치|모델\s*개발|모의\s*적용|모니터링|위촉|기업\s*육성|강소기업|(시스템|플랫폼)\s*(구축|개발)|제도\s*개선|홍보/;
const SERVICE_WORDS = /대출|보증|할인|수당|지원금|바우처|이용권|공급|상담|사례관리|주거\s*지원|월세|패스/;

/** 이름 규칙으로 본 actionable (규칙에 안 걸리면 null) */
export function actionableByRule(title: string): boolean | null {
  if (PROJECT_WORDS.test(title)) return false;
  if (SERVICE_WORDS.test(title)) return true;
  return null;
}

/** 이미 분류된 정책에 이름 규칙을 다시 적용한다 (AI 호출 없음). 바뀐 수를 돌려준다 */
export async function applyActionableRules(db: Db): Promise<{ changed: { title: string; actionable: boolean }[] }> {
  const rows = (await db.query<{ id: number; title: string; actionable: boolean | null }>(
    "SELECT id, title, actionable FROM policies WHERE classified_at IS NOT NULL",
  )).rows;
  const changed: { title: string; actionable: boolean }[] = [];
  for (const r of rows) {
    const rule = actionableByRule(r.title);
    if (rule === null || rule === r.actionable) continue;
    await db.query("UPDATE policies SET actionable = $2 WHERE id = $1", [r.id, rule]);
    changed.push({ title: r.title, actionable: rule });
  }
  return { changed };
}

export type Classification = {
  actionable: boolean;
  summary: string;
  burden: Burden;
  difficulty: number;
  difficultyNote: string;
  relevance: number;
  tags: string[];
};

type AiItem = Classification & { id: number };
type AiOutput = { items: AiItem[] };

const SYSTEM = `너는 사회적으로 고립된 청년을 돕는 앱에서 청년정책 설명을 정리하는 분류기다.
정책마다 원문의 모든 항목(설명·지원 내용·키워드·분류·신청 방법·자격 조건 등)을 함께 보고 판단한다. 입력에 없는 항목은 원문에 정보가 없다는 뜻이다.
정책마다 아래를 정한다.
- actionable: 청년 개인이 직접 신청하거나 이용할 수 있으면 true. 실태조사, 시스템·플랫폼 구축, 제도 개선, 홍보, 모니터링, 기관 지원처럼 정부·기관이 하는 사업이라 개인이 신청·이용할 수 없으면 false.
- summary: 쉬운 말 요약 1~2문장, 100자 이내. 정책 설명에 있는 사실만 쓰고, 설명에 없는 금액·날짜·숫자는 쓰지 않는다. 권유·과장 표현 금지.
- burden: 신청부터 이용까지 가장 부담이 큰 방식 하나. online(온라인으로 끝남), visit(직접 방문 필요), phone(전화·상담·면접 등 사람과 대화 필요), group(집단 프로그램·모임·팀 활동 참여).
- difficulty: 참여 난이도 1~6. 1 집에서 온라인으로 끝 / 2 온라인 + 문자·메일 연락 / 3 혼자 한 번 방문 / 4 기관 이용·여러 번 방문 / 5 전화·상담·면접 등 짧은 대화 / 6 집단 프로그램·정기 참여. 애매하면 더 높은 쪽.
- difficultyNote: 난이도를 그렇게 정한 이유 한 줄, 40자 이내.
- relevance: 집 밖에 나가기 어렵거나 사람을 만나기 부담스러운 청년에게 도움이 되는 정도 0~3.
- tags: 아래 목록에서 1~3개. ${TAGS.join(", ")}
지정된 JSON만 출력한다.`;

const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer" },
          actionable: { type: "boolean" },
          summary: { type: "string" },
          burden: { type: "string", enum: [...BURDENS] },
          difficulty: { type: "integer" },
          difficultyNote: { type: "string" },
          relevance: { type: "integer" },
          tags: { type: "array", items: { type: "string", enum: [...TAGS] } },
        },
        required: ["id", "actionable", "summary", "burden", "difficulty", "difficultyNote", "relevance", "tags"],
      },
    },
  },
  required: ["items"],
};

const isOutput = (v: unknown): v is AiOutput => !!v && Array.isArray((v as AiOutput).items);

const numbersIn = (s: string) => (s.replace(/,/g, "").match(/\d+(?:\.\d+)?/g) ?? []);

/**
 * AI 결과 1건을 검사·보정한다. 쓸 수 없으면 null (그 정책은 분류 전으로 남아 다음 수집 때 다시 시도)
 * - 요약에 원문에 없는 숫자가 있으면 버림 (사실 왜곡 방지)
 * - 난이도는 신청 방식의 최소값보다 낮으면 올림
 */
export function checkClassification(item: unknown, sourceText: string): Classification | null {
  const i = item as Partial<AiItem> | null;
  if (!i || typeof i !== "object") return null;
  if (typeof i.actionable !== "boolean") return null;
  const summary = typeof i.summary === "string" ? i.summary.trim() : "";
  if (summary.length < 5 || summary.length > 140) return null;
  const source = sourceText.replace(/,/g, "");
  if (numbersIn(summary).some((n) => !source.includes(n))) return null;
  if (!BURDENS.includes(i.burden as Burden)) return null;
  const burden = i.burden as Burden;
  if (!Number.isInteger(i.difficulty) || (i.difficulty as number) < 1 || (i.difficulty as number) > 6) return null;
  if (!Number.isInteger(i.relevance) || (i.relevance as number) < 0 || (i.relevance as number) > 3) return null;
  const note = typeof i.difficultyNote === "string" ? i.difficultyNote.trim().slice(0, 80) : "";
  const tags = Array.isArray(i.tags) ? [...new Set(i.tags.filter((t): t is string => (TAGS as readonly string[]).includes(t as string)))].slice(0, 3) : [];
  return {
    actionable: i.actionable,
    summary,
    burden,
    difficulty: Math.max(i.difficulty as number, MIN_DIFFICULTY[burden]),
    difficultyNote: note || "신청 방법을 보고 정했어요",
    relevance: i.relevance as number,
    tags,
  };
}

type Row = { id: number; title: string; raw: Record<string, string> };

// 온통청년 원본 칸 → AI에 보낼 이름. 사람이 읽을 수 있는 칸은 모두 넘긴다 (특징을 보고 분류하는 작업이라 단서를 빼지 않음)
const FIELD_LABELS: Record<string, string> = {
  plcyNm: "이름",
  plcyExplnCn: "설명",
  plcySprtCn: "지원_내용",
  plcyKywdNm: "키워드",
  lclsfNm: "대분류",
  mclsfNm: "중분류",
  plcyAplyMthdCn: "신청_방법",
  srngMthdCn: "심사_방법",
  sbmsnDcmntCn: "제출_서류",
  addAplyQlfcCndCn: "추가_자격_조건",
  ptcpPrpTrgtCn: "참여_대상_관련",
  earnEtcCn: "소득_조건",
  etcMttrCn: "기타",
  bizPrdEtcCn: "사업_기간_기타",
  aplyYmd: "신청_기간",
  sprvsnInstCdNm: "주관_기관",
  operInstCdNm: "운영_기관",
  aplyUrlAddr: "신청_주소",
  refUrlAddr1: "참고_주소",
  refUrlAddr2: "참고_주소2",
};
// 넘기지 않는 칸: 숫자 코드(코드표 없이는 의미 없음), 지역 코드 목록, 조회수, 등록 기관·담당자, 등록·수정 시각
const SKIP_FIELDS = /(Cd|No|Yn|Cycl)$|^(zipCd|inqCnt|frstRegDt|lastMdfcnDt|rgtr|sprvsnInstPicNm|operInstPicNm)/;
const MAX_FIELD = 600;

/**
 * AI에 보낼 정책 정보 (공공 데이터만). 값이 있는 칸만 넣는다 — 빠진 항목은 "원문에 정보 없음"
 * 목록에 없는 칸도 한글이 들어 있으면 원래 칸 이름으로 넘긴다 (새 칸이 생겨도 빠지지 않게)
 */
export function sourceFields(r: Row): Record<string, string> {
  const out: Record<string, string> = { 이름: r.title };
  const v = (k: string) => (typeof r.raw[k] === "string" ? r.raw[k].trim() : "");
  for (const [key, label] of Object.entries(FIELD_LABELS)) {
    if (key === "plcyNm") continue;
    const value = v(key);
    if (value) out[label] = value.slice(0, MAX_FIELD);
  }
  // 나이·지원 규모·사업 기간은 숫자지만 판단에 쓰이는 값
  if (v("sprtTrgtAgeLmtYn") === "Y" && (v("sprtTrgtMinAge") || v("sprtTrgtMaxAge"))) out["나이"] = `${v("sprtTrgtMinAge") || "?"}~${v("sprtTrgtMaxAge") || "?"}세`;
  if (Number(v("sprtSclCnt")) > 0) out["지원_규모"] = `${v("sprtSclCnt")}명`;
  if (/^\d{8}$/.test(v("bizPrdBgngYmd")) || /^\d{8}$/.test(v("bizPrdEndYmd"))) out["사업_기간"] = `${v("bizPrdBgngYmd")} ~ ${v("bizPrdEndYmd")}`.trim();
  for (const [key, raw] of Object.entries(r.raw)) {
    if (key in FIELD_LABELS || SKIP_FIELDS.test(key) || /^(sprtTrgt|sprtScl|bizPrd)/.test(key)) continue;
    const value = typeof raw === "string" ? raw.trim() : "";
    if (/[가-힣]/.test(value)) out[key] = value.slice(0, MAX_FIELD);
  }
  return out;
}

/** 분류 안 된 정책을 BATCH개씩 묶어 분류·저장한다 */
export async function classifyPending(
  db: Db,
  opts: { generate?: typeof generateJson; limit?: number; log?: (msg: string) => void } = {},
): Promise<{ classified: number; pending: number; modelVersion: string | null }> {
  const generate = opts.generate ?? generateJson;
  const log = opts.log ?? (() => {});
  const rows = (
    await db.query<Row>(
      `SELECT id, title, raw FROM policies WHERE classified_at IS NULL ORDER BY id LIMIT $1`,
      [opts.limit ?? 500],
    )
  ).rows;
  let classified = 0;
  let modelVersion: string | null = null;
  for (let start = 0; start < rows.length; start += BATCH) {
    const batch = rows.slice(start, start + BATCH);
    const result = await generate<AiOutput>({
      system: SYSTEM,
      prompt: JSON.stringify(batch.map((r) => ({ id: r.id, ...sourceFields(r) }))),
      schema,
      validate: isOutput,
      fallback: { items: [] },
      timeoutMs: 60_000, // 화면이 기다리지 않는 일괄 작업
    });
    if (result.modelVersion) modelVersion = result.modelVersion;
    const byId = new Map(result.data.items.map((i) => [i.id, i]));
    let ok = 0;
    for (const r of batch) {
      const c = checkClassification(byId.get(r.id), Object.values(sourceFields(r)).join(" "));
      if (!c) continue;
      await db.query(
        `UPDATE policies SET summary = $2, burden = $3, stage = $4, difficulty_note = $5, relevance = $6, tags = $7, actionable = $8,
                classified_at = now()
         WHERE id = $1`,
        [r.id, c.summary, c.burden, c.difficulty, c.difficultyNote, c.relevance, c.tags, actionableByRule(r.title) ?? c.actionable],
      );
      ok++;
    }
    classified += ok;
    log(`분류 ${start + 1}~${start + batch.length}: ${ok}/${batch.length}${result.usedFallback ? ` (AI 실패: ${result.fallbackReason})` : ""}`);
  }
  return { classified, pending: rows.length - classified, modelVersion };
}
