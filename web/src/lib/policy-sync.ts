// 온통청년 청년정책 수집 (기획: docs/기획/정책추천.md)
// 받기 → 시연 범위로 거르기 → 저장 (원문 수정 시각이 바뀐 정책만 다시 분류 대상) → 분류 안 된 정책만 AI ⑤ 분류
// 지금은 scripts/sync-policies.mts로 직접 실행. 예약 실행(매일 10시·20시)은 추후 과제이며, 붙일 때 syncPolicies()만 부르면 된다
import type { Db } from "@/app/api/_lib/http";
import { classifyPending } from "@/lib/policy-classify";
import type { generateJson } from "@/lib/gemini";

/** 시연 지역: 서울 마포구 (데모 사용자 기본 지역과 같음) */
export const DEMO_REGION = "11440";
export const DEMO_REGION_NAME = "서울 마포구";
// 전국(중앙부처) 정책은 모두 넣는다 (예전 30개 상한은 "고립·마음" 단어 순으로 잘라 주거·일자리·금융 정책을 밀어냈음, 고민기록 #35)
// 관련도는 수집에서 자르지 않고 프로필·추천 점수로 사람마다 고른다

const API = "https://www.youthcenter.go.kr/go/ythip/getPlcy";
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

export type RawPolicy = Record<string, string>;

export type NormalizedPolicy = {
  sourceId: string;
  title: string;
  url: string | null;
  regionCode: string | null; // null 전국, 'NN000' 시도 전체, 그 밖 시군구
  ageMin: number | null;
  ageMax: number | null;
  applyStart: string | null; // YYYY-MM-DD
  applyEnd: string | null;
  applyAlways: boolean;
  /** 신청 기간 코드 0057003(의미 확인 전): 신청 방법은 있지만 기간을 알 수 없음 → 화면에 "원문에서 확인" */
  applyUnclear: boolean;
  category: string | null;
  applyMethod: string | null;
  sourceUpdatedAt: string | null; // ISO (+09:00)
  raw: RawPolicy;
  /** 전국 정책 순서 점수 (저장하지 않음, 상한을 없앤 뒤로는 같은 이름 정리 때만 참고) */
  hint: number;
};

/** 온통청년에서 한 지역 청년이 대상인 정책을 모두 받는다 (지역 코드로 API가 거름) */
export async function fetchYouthPolicies(apiKey: string, zipCd: string, fetchImpl: typeof fetch = fetch): Promise<RawPolicy[]> {
  const all: RawPolicy[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const query = new URLSearchParams({ apiKeyNm: apiKey, pageNum: String(page), pageSize: String(PAGE_SIZE), rtnType: "json", zipCd });
    const response = await fetchImpl(`${API}?${query}`, { signal: AbortSignal.timeout(20_000) });
    if (!response.ok) throw new Error(`온통청년 응답 ${response.status}`);
    const json = (await response.json()) as { result?: { youthPolicyList?: RawPolicy[] } };
    const list = json.result?.youthPolicyList ?? [];
    all.push(...list);
    if (list.length < PAGE_SIZE) break;
  }
  return all;
}

const ymd = (v: string) => (/^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : null);
const text = (v: string | undefined, max = 1000) => {
  const t = (v ?? "").trim();
  return t ? t.slice(0, max) : null;
};
const age = (v: string | undefined) => {
  const n = Number((v ?? "").trim());
  return Number.isInteger(n) && n > 0 && n < 100 ? n : null;
};
const httpUrl = (...vs: (string | undefined)[]) => vs.map((v) => (v ?? "").trim()).find((v) => /^https?:\/\//.test(v)) ?? null;

// 고립·은둔 청년과 관련 있어 보이는 말 (전국 정책 30개를 고르는 순서에만 사용, 추천 판단은 AI ⑤ 관련도)
const HINT_WORDS = /고립|은둔|마음|심리|상담|정신|자립|생활비|생계|월세|주거|교통|일상|관계|소통|커뮤니티|모임|취미|건강|외로|돌봄|문화/g;

/**
 * 원본 1건 → 저장할 형태. 시연 범위가 아니거나 신청할 수 없는 정책은 null
 * - 신청 기간: 0057001 기간 있음(마감 지나면 제외) / 0057002 상시
 *   / 0057003 의미 확인 전 → 신청 방법이 적혀 있고 사업 기간이 끝나지 않은 것만 "기간 불명확"으로 넣음
 * - 지역: 대상 지역 코드가 모두 같은 시도면 그 시도(또는 시군구 하나), 아니면 중앙부처(기관 코드 1·B)만 전국으로
 */
export function normalizePolicy(p: RawPolicy, today: string, region = DEMO_REGION): NormalizedPolicy | null {
  const sourceId = text(p.plcyNo, 100);
  const title = text(p.plcyNm, 300);
  if (!sourceId || !title) return null;

  let applyStart: string | null = null;
  let applyEnd: string | null = null;
  let applyAlways = false;
  let applyUnclear = false;
  if (p.aplyPrdSeCd === "0057002") applyAlways = true;
  else if (p.aplyPrdSeCd === "0057001") {
    const m = /(\d{8})\s*~\s*(\d{8})/.exec(p.aplyYmd ?? "");
    if (!m) return null;
    applyStart = ymd(m[1]);
    applyEnd = ymd(m[2]);
    if (!applyEnd || applyEnd < today) return null;
  } else if (p.aplyPrdSeCd === "0057003") {
    const bizEnd = ymd((p.bizPrdEndYmd ?? "").trim());
    if (!(p.plcyAplyMthdCn ?? "").trim()) return null; // 신청 방법도 없으면 개인이 신청할 길을 알 수 없음
    if (bizEnd && bizEnd < today) return null; // 사업 기간이 끝남
    applyUnclear = true;
  } else return null;

  const zips = (p.zipCd ?? "").split(",").map((z) => z.trim()).filter(Boolean);
  const sido = region.slice(0, 2);
  let regionCode: string | null;
  if (zips.length > 0 && zips.every((z) => z.startsWith(sido))) regionCode = zips.length === 1 ? zips[0] : `${sido}000`;
  else if (/^[1B]/.test(p.rgtrHghrkInstCd ?? "")) regionCode = null;
  else return null; // 다른 지역 기관 정책 (모든 지역 코드를 달고 있어도 실제로는 그 지역 대상인 경우가 많음)

  const limited = (p.sprtTrgtAgeLmtYn ?? "") === "Y";
  const updated = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/.exec((p.lastMdfcnDt ?? "").trim());
  const words = `${p.plcyNm} ${p.plcyExplnCn} ${p.plcyKywdNm} ${p.plcySprtCn}`;

  return {
    sourceId,
    title,
    url: httpUrl(p.aplyUrlAddr, p.refUrlAddr1, p.refUrlAddr2),
    regionCode,
    ageMin: limited ? age(p.sprtTrgtMinAge) : null,
    ageMax: limited ? age(p.sprtTrgtMaxAge) : null,
    applyStart,
    applyEnd,
    applyAlways,
    applyUnclear,
    category: text([...new Set((p.lclsfNm ?? "").split(",").map((c) => c.trim()).filter(Boolean))].join(", "), 30),
    applyMethod: text(p.plcyAplyMthdCn),
    sourceUpdatedAt: updated ? `${updated[1]}T${updated[2]}+09:00` : null,
    raw: p,
    hint: (words.match(HINT_WORDS) ?? []).length + (applyAlways ? 0.5 : 0),
  };
}

/** 시연 데이터: 신청 가능한 지역·전국 정책 모두. 이름이 같은 정책은 최근 수정된 하나만. nationalLimit은 시험용으로만 */
export function pickDemoSet(input: NormalizedPolicy[], nationalLimit = Infinity): NormalizedPolicy[] {
  const byTitle = new Map<string, NormalizedPolicy>();
  for (const p of input) {
    const key = p.title.replace(/\s+/g, "");
    const prev = byTitle.get(key);
    if (!prev || (p.sourceUpdatedAt ?? "") > (prev.sourceUpdatedAt ?? "")) byTitle.set(key, p);
  }
  const items = [...byTitle.values()];
  const local = items.filter((p) => p.regionCode !== null);
  const national = items
    .filter((p) => p.regionCode === null)
    .sort((a, b) => b.hint - a.hint || (b.sourceUpdatedAt ?? "").localeCompare(a.sourceUpdatedAt ?? ""))
    .slice(0, nationalLimit);
  return [...local, ...national];
}

/** 저장. 원문 수정 시각이 바뀐 정책은 분류를 지워 다시 분류되게 한다. 반환: 새로 들어온 수·바뀐 수 */
export async function upsertPolicies(db: Db, items: NormalizedPolicy[]): Promise<{ inserted: number; updated: number }> {
  if (items.length === 0) return { inserted: 0, updated: 0 };
  const known = new Map(
    (
      await db.query<{ source_id: string; updated: string | null }>(
        `SELECT source_id, source_updated_at::text AS updated FROM policies WHERE source = 'youth_policy' AND source_id = ANY($1)`,
        [items.map((p) => p.sourceId)],
      )
    ).rows.map((r) => [r.source_id, r.updated]),
  );
  let inserted = 0;
  let updated = 0;
  for (const p of items) {
    if (!known.has(p.sourceId)) inserted++;
    else {
      const before = known.get(p.sourceId);
      if ((before ? new Date(before).getTime() : null) !== (p.sourceUpdatedAt ? new Date(p.sourceUpdatedAt).getTime() : null)) updated++;
    }
    await db.query(
      `INSERT INTO policies (source, source_id, title, url, region_code, age_min, age_max, apply_start, apply_end, apply_always,
                             category, apply_method, raw, source_updated_at, fetched_at, apply_unclear)
       VALUES ('youth_policy', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(), $14)
       ON CONFLICT (source, source_id) DO UPDATE SET
         title = EXCLUDED.title, url = EXCLUDED.url, region_code = EXCLUDED.region_code,
         age_min = EXCLUDED.age_min, age_max = EXCLUDED.age_max,
         apply_start = EXCLUDED.apply_start, apply_end = EXCLUDED.apply_end, apply_always = EXCLUDED.apply_always,
         apply_unclear = EXCLUDED.apply_unclear,
         category = EXCLUDED.category, apply_method = EXCLUDED.apply_method, raw = EXCLUDED.raw, fetched_at = now(),
         classified_at = CASE WHEN policies.source_updated_at IS DISTINCT FROM EXCLUDED.source_updated_at THEN NULL
                              ELSE policies.classified_at END,
         source_updated_at = EXCLUDED.source_updated_at`,
      [p.sourceId, p.title, p.url, p.regionCode, p.ageMin, p.ageMax, p.applyStart, p.applyEnd, p.applyAlways,
        p.category, p.applyMethod, JSON.stringify(p.raw), p.sourceUpdatedAt, p.applyUnclear],
    );
  }
  return { inserted, updated };
}

export type SyncResult = { syncId: number; fetched: number; kept: number; inserted: number; updated: number; classified: number; skipped: number; pending: number };

/**
 * 한 번 수집. classify=false면 저장까지만 (AI 호출 없음)
 * 예약 실행을 붙일 때도 이 함수만 부르면 된다 (새·바뀐 정책만 분류하므로 평소에는 AI 호출 0~1번)
 */
export async function syncPolicies(opts: {
  db: Db;
  apiKey: string;
  region?: string;
  today: string;
  classify?: boolean;
  generate?: typeof generateJson;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}): Promise<SyncResult> {
  const region = opts.region ?? DEMO_REGION;
  const log = opts.log ?? (() => {});
  const syncId = (
    await opts.db.query<{ id: number }>("INSERT INTO policy_syncs (source, region_code) VALUES ('youth_policy', $1) RETURNING id", [region])
  ).rows[0].id;

  const raw = await fetchYouthPolicies(opts.apiKey, region, opts.fetchImpl);
  const normalized = raw.map((p) => normalizePolicy(p, opts.today, region)).filter((p): p is NormalizedPolicy => p !== null);
  const kept = pickDemoSet(normalized);
  log(`받음 ${raw.length} → 신청 가능·시연 범위 ${normalized.length} → 저장 대상 ${kept.length}`);
  const { inserted, updated } = await upsertPolicies(opts.db, kept);
  log(`새 정책 ${inserted}, 바뀐 정책 ${updated}`);

  let classified = 0;
  let skipped = 0;
  let pending = 0;
  if (opts.classify !== false) {
    const r = await classifyPending(opts.db, { generate: opts.generate, log });
    classified = r.classified;
    skipped = r.skipped;
    pending = r.pending;
  }
  await opts.db.query(
    `UPDATE policy_syncs SET fetched = $2, kept = $3, inserted = $4, updated = $5, classified = $6, finished_at = now() WHERE id = $1`,
    [syncId, raw.length, kept.length, inserted, updated, classified],
  );
  return { syncId, fetched: raw.length, kept: kept.length, inserted, updated, classified, skipped, pending };
}
