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
// 무료 등급은 일일 한도와 별개로 분당 요청 한도가 있음 (flash-lite 15회/분, 11/21 수집 중 429로 확인)
// 미리 돌리는 일괄 작업이라 호출 사이에 간격을 둔다 (4.5초 → 분당 약 13회)
const PACE_MS = 4_500;

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

/**
 * AI를 부르기 전에 걸러 내는 정부 사업 (개인이 신청·이용할 수 없음)
 * - 이름 규칙이 사업(false)이면
 * - 원문 중분류가 "정책인프라구축"인데 이름에 대출·상담 같은 서비스 말이 없으면
 */
export function projectBeforeAi(title: string, raw: Record<string, string>): boolean {
  const rule = actionableByRule(title);
  if (rule === false) return true;
  return rule !== true && (raw.mclsfNm ?? "").includes("정책인프라구축");
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

type AiItem = Classification & { id: number; applyMode?: Burden; useMode?: Burden };
type AiOutput = { items: AiItem[] };

const SYSTEM = `너는 사회적으로 고립된 청년을 돕는 앱에서 청년정책 설명을 정리하는 분류기다.
정책마다 입력된 원문 항목을 모두 보고 판단한다. 입력에 없는 항목은 원문에 정보가 없다는 뜻이다.
가장 중요한 구분: "신청하는 방법"과 "신청한 뒤 실제로 지원을 받거나 참여하는 방법"은 다르다. 온라인으로 신청해도 이용은 상담이나 모임일 수 있다.
정책마다 아래를 정한다.
- actionable: 청년 개인이 이 정책으로 신청·가입·이용·상담·방문 중 하나라도 할 수 있으면 true. 실태조사, 시스템·플랫폼 개발, 시범 설치, 제도 개선, 모니터링, 홍보, 기업·기관 대상 지원처럼 개인이 할 수 있는 게 없으면 false.
- summary: 쉬운 말 요약 1~2문장, 100자 이내. 원문에 있는 사실만 쓰고, 원문에 없는 금액·날짜·숫자는 쓰지 않는다. 권유·과장 표현 금지.
- applyEvidence: 신청 방식을 판단한 원문 구절을 그대로 옮김 (40자 이내, 없으면 "원문에 없음"). 이 구절을 먼저 쓰고 applyMode를 정한다.
- applyMode: 신청 단계에서 해야 하는 것 중 가장 부담 큰 것. online(온라인·앱), visit(기관 직접 방문·서류 제출), phone(전화·상담·면접), group(설명회 등 여럿이 모이는 자리).
- useEvidence: 이용 방식을 판단한 원문 구절을 그대로 옮김 (40자 이내, 없으면 "원문에 없음"). 이 구절을 먼저 쓰고 useMode를 정한다.
- useMode: 신청 뒤 지원을 받거나 참여할 때 해야 하는 것 중 가장 부담 큰 것. online(현금·바우처·카드 지급, 온라인 이용만), visit(기관·장소에 직접 가서 이용), phone(상담·코칭·사례관리·동행처럼 사람과 1:1 대화), group(강좌·특강·교육 과정·캠프·워크숍·모임·팀 활동). 예: 재무상담 → phone, 찾아가는 특강·교육생 모집 → group, 수당 지급 → online.
- difficulty: 참여 난이도 1~6 (신청과 이용 중 더 어려운 쪽 기준). 1 집에서 온라인으로 끝 / 2 온라인 + 문자·메일 연락 / 3 혼자 한 번 방문 / 4 기관 이용·여러 번 방문 / 5 전화·상담·면접 등 사람과 대화 / 6 집단 프로그램·정기 참여. 애매하면 더 높은 쪽.
- difficultyNote: 난이도를 그렇게 정한 이유 한 줄, 40자 이내 (신청과 이용 중 어느 단계 때문인지).
- relevance: 집 밖에 나가기 어렵거나 사람을 만나기 부담스러운 청년에게 도움이 되는 정도 0~3. 마음건강만이 아니라 생활비·주거·일자리처럼 실제로 막히는 문제를 덜어 주면 높게.
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
          applyEvidence: { type: "string" },
          applyMode: { type: "string", enum: [...BURDENS] },
          useEvidence: { type: "string" },
          useMode: { type: "string", enum: [...BURDENS] },
          difficulty: { type: "integer" },
          difficultyNote: { type: "string" },
          relevance: { type: "integer" },
          tags: { type: "array", items: { type: "string", enum: [...TAGS] } },
        },
        required: ["id", "actionable", "summary", "applyEvidence", "applyMode", "useEvidence", "useMode", "difficulty", "difficultyNote", "relevance", "tags"],
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
  // 신청 방식·이용 방식을 따로 받아 더 부담 큰 쪽을 최종 방식으로 (예전 형식 burden 하나도 받음)
  const modes = [i.applyMode, i.useMode].filter((m): m is Burden => BURDENS.includes(m as Burden));
  if (modes.length === 0 && BURDENS.includes(i.burden as Burden)) modes.push(i.burden as Burden);
  if (modes.length === 0) return null;
  const burden = modes.reduce((a, b) => (MIN_DIFFICULTY[b] > MIN_DIFFICULTY[a] ? b : a));
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

export type Row = { id: number; title: string; raw: Record<string, string> };

// 온통청년 원본 칸 → AI에 보낼 이름 (판단에 중요한 순서). 신청 방식·이용 방식·자격을 판단할 단서가 되는 칸만
// 11/21 정답 세트 평가: 주소(URL)·기관명·날짜·지원 규모까지 넣었더니 AI가 "온라인 신청"에 끌려 이용 단계(상담·모임)를 놓침
//   → 그런 칸은 빼고, 지원 내용·신청·심사 방법을 앞에 둠 (고민기록 #36)
const FIELD_LABELS: Record<string, string> = {
  plcyNm: "이름",
  plcyExplnCn: "설명",
  plcySprtCn: "지원_내용",
  plcyAplyMthdCn: "신청_방법",
  srngMthdCn: "심사_방법",
  sbmsnDcmntCn: "제출_서류",
  plcyKywdNm: "키워드",
  lclsfNm: "대분류",
  mclsfNm: "중분류",
  addAplyQlfcCndCn: "추가_자격_조건",
  ptcpPrpTrgtCn: "참여_대상_관련",
  etcMttrCn: "기타",
};
// 넘기지 않는 칸: 숫자 코드, 지역 코드, 조회수, 기관·담당자 이름, 주소(URL), 날짜, 지원 규모, 소득 조건(자격은 규칙으로 판단)
const SKIP_FIELDS = /(Cd|No|Yn|Cycl|Nm|Addr\d?|Ymd|Dt|Cnt|Amt)$|^(zipCd|inqCnt|rgtr|sprt|bizPrd|earn|aply)/;
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
  for (const [key, raw] of Object.entries(r.raw)) {
    if (key in FIELD_LABELS || SKIP_FIELDS.test(key)) continue;
    const value = typeof raw === "string" ? raw.trim() : "";
    if (/[가-힣]/.test(value)) out[key] = value.slice(0, MAX_FIELD);
  }
  return out;
}

/**
 * 정책 묶음을 AI로 분류만 한다 (DB에 쓰지 않음). 이름 규칙으로 actionable을 보정한 결과를 돌려준다
 * classifyPending(저장)과 평가 스크립트(정답 세트 비교)가 같이 쓴다
 */
export async function classifyRows(
  rows: Row[],
  opts: { generate?: typeof generateJson; log?: (msg: string) => void; paceMs?: number } = {},
): Promise<{ results: Map<number, Classification | null>; modelVersion: string | null }> {
  const generate = opts.generate ?? generateJson;
  const log = opts.log ?? (() => {});
  const results = new Map<number, Classification | null>();
  let modelVersion: string | null = null;
  const pace = opts.paceMs ?? (opts.generate ? 0 : PACE_MS); // 가짜 AI를 넣은 검증에서는 기다리지 않음
  for (let start = 0; start < rows.length; start += BATCH) {
    if (start > 0 && pace > 0) await new Promise((r) => setTimeout(r, pace));
    const batch = rows.slice(start, start + BATCH);
    const result = await generate<AiOutput>({
      system: SYSTEM,
      prompt: JSON.stringify(batch.map((r) => ({ id: r.id, ...sourceFields(r) }))),
      schema,
      validate: isOutput,
      fallback: { items: [] },
      timeoutMs: 60_000, // 화면이 기다리지 않는 일괄 작업
      temperature: 0, // 같은 정책이면 같은 분류 (실행마다 흔들리지 않게)
    });
    if (result.modelVersion) modelVersion = result.modelVersion;
    const byId = new Map(result.data.items.map((i) => [i.id, i]));
    let ok = 0;
    for (const r of batch) {
      const c = checkClassification(byId.get(r.id), Object.values(sourceFields(r)).join(" "));
      results.set(r.id, c ? { ...c, actionable: actionableByRule(r.title) ?? c.actionable } : null);
      if (c) ok++;
    }
    log(`분류 ${start + 1}~${start + batch.length}: ${ok}/${batch.length}${result.usedFallback ? ` (AI 실패: ${result.fallbackReason})` : ""}`);
  }
  return { results, modelVersion };
}

/** 분류 안 된 정책을 BATCH개씩 묶어 분류·저장한다 */
export async function classifyPending(
  db: Db,
  opts: { generate?: typeof generateJson; limit?: number; log?: (msg: string) => void; paceMs?: number } = {},
): Promise<{ classified: number; skipped: number; pending: number; modelVersion: string | null }> {
  const log = opts.log ?? (() => {});
  const all = (
    await db.query<Row>(
      `SELECT id, title, raw FROM policies WHERE classified_at IS NULL ORDER BY id LIMIT $1`,
      [opts.limit ?? 1000],
    )
  ).rows;
  // 정부 사업은 AI 없이 "개인 신청 불가"로 저장 (호출 수 절약)
  const rows: Row[] = [];
  let skipped = 0;
  for (const r of all) {
    if (!projectBeforeAi(r.title, r.raw)) { rows.push(r); continue; }
    await db.query(
      `UPDATE policies SET actionable = false, difficulty_note = '규칙: 개인이 신청하는 정책이 아님 (AI 분류 생략)', classified_at = now() WHERE id = $1`,
      [r.id],
    );
    skipped++;
  }
  if (skipped) log(`정부 사업으로 보고 AI 없이 정리: ${skipped}개`);
  const { results, modelVersion } = await classifyRows(rows, opts);
  let classified = 0;
  for (const r of rows) {
    const c = results.get(r.id);
    if (!c) continue;
    await db.query(
      `UPDATE policies SET summary = $2, burden = $3, stage = $4, difficulty_note = $5, relevance = $6, tags = $7, actionable = $8,
              classified_at = now()
       WHERE id = $1`,
      [r.id, c.summary, c.burden, c.difficulty, c.difficultyNote, c.relevance, c.tags, c.actionable],
    );
    classified++;
  }
  return { classified, skipped, pending: rows.length - classified, modelVersion };
}
