// 루트 quests.json(별 원본) → db/init/02_seed.sql(새 DB) + db/migrations/20261121_quests_sync.sql(Neon 동기화, 기록 유지) 생성 (고민기록 #31)
// 실행 (web/에서):
//   node node_modules/tsx/dist/cli.mjs scripts/gen-quest-seed.mts           두 SQL 파일을 다시 씀
//   node node_modules/tsx/dist/cli.mjs scripts/gen-quest-seed.mts --check   쓰지 않고, 파일이 JSON과 다르면 실패 (커밋 전 확인용)
// JSON의 quest id = DB 별 ID (문구를 고쳐도 ID가 그대로라 기록·화면 링크가 어긋나지 않음). 하위 퀘스트 ID도 같은 번호
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const check = process.argv.includes("--check");

type Quest = {
  id: number;
  stage: number;
  focus: string;
  title: string;
  description: string;
  easier_title: string;
  tags: string[];
  verify_type?: "self" | "photo" | "gps";
  place_type?: string;
  category?: "daily" | "center" | "volunteer";
  is_outside: boolean;
};
type Constellation = { id: number; stage: number; name: string; theme: string; quests: number[] };
type QuestFile = {
  stages: Record<string, string>;
  focuses: Record<string, unknown>;
  tags: Record<string, unknown>;
  constellations: Constellation[];
  quests: Quest[];
};

const data = JSON.parse(readFileSync(`${root}quests.json`, "utf8")) as QuestFile;

// ---------- 검사 (하나라도 틀리면 아무 파일도 쓰지 않음) ----------
const errors: string[] = [];
const err = (msg: string) => errors.push(msg);
const PLACE_TYPES = ["park", "library", "convenience", "cafe", "youth_center"];
const byId = new Map<number, Quest>();
for (const q of data.quests) {
  if (!Number.isInteger(q.id) || q.id <= 0) err(`quest id가 양의 정수가 아님: ${q.id}`);
  if (byId.has(q.id)) err(`quest id 중복: ${q.id}`);
  byId.set(q.id, q);
  const at = `quest ${q.id}`;
  if (!(String(q.stage) in data.stages)) err(`${at}: stages에 없는 단계 ${q.stage}`);
  if (!(q.focus in data.focuses)) err(`${at}: focuses에 없는 focus ${q.focus}`);
  if (!Array.isArray(q.tags) || q.tags.length === 0 || q.tags.some((t) => !(t in data.tags))) err(`${at}: tags가 비었거나 tags에 없는 값`);
  for (const k of ["title", "description", "easier_title"] as const) {
    if (typeof q[k] !== "string" || !q[k].trim()) err(`${at}: ${k} 없음`);
    else if (q[k].length > (k === "description" ? 200 : 100)) err(`${at}: ${k}가 너무 김`);
  }
  const verify = q.verify_type ?? "self";
  if (!["self", "photo", "gps"].includes(verify)) err(`${at}: verify_type ${verify}`);
  if ((verify === "gps") !== (q.place_type !== undefined)) err(`${at}: gps 별에만 place_type`);
  if (q.place_type !== undefined && !PLACE_TYPES.includes(q.place_type)) err(`${at}: place_type ${q.place_type}`);
  if (!["daily", "center", "volunteer"].includes(q.category ?? "daily")) err(`${at}: category ${q.category}`);
  if (typeof q.is_outside !== "boolean") err(`${at}: is_outside는 true/false`);
}
const titles = data.quests.map((q) => q.title);
if (new Set(titles).size !== titles.length) err("quest title 중복");
const placed = new Set<number>();
const constIds = new Set<number>();
for (const c of data.constellations) {
  if (constIds.has(c.id)) err(`constellation id 중복: ${c.id}`);
  constIds.add(c.id);
  if (!c.name?.trim() || !c.theme?.trim()) err(`constellation ${c.id}: name·theme 없음`);
  if (c.quests.length === 0) err(`constellation ${c.id}: 별이 없음`);
  for (const id of c.quests) {
    const q = byId.get(id);
    if (!q) err(`constellation ${c.id}: 없는 quest ${id}`);
    else if (q.stage !== c.stage) err(`constellation ${c.id}(단계 ${c.stage})에 단계 ${q.stage} quest ${id}`);
    if (placed.has(id)) err(`quest ${id}가 별자리 두 곳에 들어감`);
    placed.add(id);
  }
}
for (const q of data.quests) if (!placed.has(q.id)) err(`quest ${q.id}가 어느 별자리에도 없음`);
if (errors.length) {
  console.error(`quests.json 오류 ${errors.length}건\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

// ---------- SQL 만들기 ----------
const s = (v: string) => `'${v.replace(/'/g, "''")}'`;
const maxStar = Math.max(...data.quests.map((q) => q.id));
const maxConst = Math.max(...data.constellations.map((c) => c.id));
const stageCount = Object.keys(data.stages)
  .map((st) => `${st}단계 ${data.constellations.filter((c) => c.stage === Number(st)).length}개`)
  .join(", ");

const constRows = data.constellations
  .map((c) => `  (${c.id}, ${c.stage}, ${s(c.name)}, ${s(c.theme)}, ${c.quests.length})`)
  .join(",\n");

const starRows: string[] = [];
for (const st of Object.keys(data.stages).map(Number)) {
  starRows.push(`  -- ${st}단계 · ${data.stages[String(st)]}`);
  for (const c of data.constellations.filter((x) => x.stage === st)) {
    c.quests.forEach((id, i) => {
      const q = byId.get(id)!;
      starRows.push(
        `  (${q.id}, ${c.id}, ${i + 1}, ${s(q.title)}, ${s(q.description)}, '${q.verify_type ?? "self"}', ${q.place_type ? s(q.place_type) : "NULL"}, '${q.category ?? "daily"}', ${q.is_outside}, '${q.focus}', ARRAY[${q.tags.map(s).join(", ")}]::text[]),`,
      );
    });
  }
}
// 마지막 값 줄의 쉼표를 없앤 목록 (새 DB 시드는 뒤에 ";", 동기화 SQL은 뒤에 ON CONFLICT)
const lastRow = starRows.map((r, i) => (r.startsWith("  (") ? i : -1)).filter((i) => i >= 0).pop()!;
const starValues = starRows.map((r, i) => (i === lastRow ? r.replace(/,$/, "") : r)).join("\n");
const constIdList = data.constellations.map((c) => c.id).join(", ");

const subRows = data.quests
  .slice()
  .sort((a, b) => a.id - b.id)
  .map((q) => `  (${q.id}, ${q.id}, 1, ${s(q.easier_title)})`)
  .join(",\n");

const content = `INSERT INTO constellations (id, stage, name, theme, star_count) VALUES
${constRows};

SELECT setval('constellations_id_seq', ${maxConst});

-- 별 ID = quests.json의 quest id. verify_type 기본 self, gps면 place_type(카카오로 가장 가까운 장소 제안)
-- category: 청년센터 단계별 퀘스트 = center, 봉사 = volunteer, 나머지 daily
-- is_outside: 집 문 밖에서 하는 별 (1순위 지표 "앱 밖 활동")
INSERT INTO stars (id, constellation_id, position, title, description, verify_type, place_type, category, is_outside, focus, tags) VALUES
${starValues};

SELECT setval('stars_id_seq', ${maxStar});

-- 더 작게 해 보기용 하위 퀘스트 = quests.json의 easier_title (별마다 1개, 하위 퀘스트 ID = 별 ID)
-- AI ①은 이 목록 안에서만 고름
INSERT INTO sub_quests (id, star_id, position, title) VALUES
${subRows};

SELECT setval('sub_quests_id_seq', ${maxStar});`;

const GENERATED = "-- ⚠ 자동 생성 파일: 직접 고치지 말고 루트 quests.json을 고친 뒤 web/에서 `node node_modules/tsx/dist/cli.mjs scripts/gen-quest-seed.mts`";

const seedSql = `-- 별자리 ${data.constellations.length}개 · 별 ${data.quests.length}개 (원본: 루트 quests.json, 규칙: docs/고민기록.md #31)
${GENERATED}
-- 별자리 = 도감 캐릭터 10명 (id = web/src/app/catalog/characters.ts 순서, 이름·테마도 도감과 같음). 난이도 = constellations.stage (${stageCount})
-- 추천 범위는 기존 규칙: gps 별 = 바깥, stage 1 = 집 안, stage 2 이상 = 집 근처 (api/recommendations/service.ts scopeOf)
-- 포인트: 별을 처음 밝히면 그 별자리 난이도 × 10 (뷰 v_star_points). 별자리 합계 = 난이도 × 10 × 별 수
-- 운영 DB(Neon)는 db/migrations/20261121_quests_sync.sql로 맞춤 (같은 스크립트가 함께 만듦, 기록을 지우지 않음)

${content}

-- 사용자는 시드로 만들지 않음 (users.id = 1 고정 사용 금지)
-- 데모 사용자는 POST /api/demo/session 이 브라우저마다 새로 만든다 (web/src/lib/demo-session.ts)
--   새 사용자 초기값: 닉네임 '데모 사용자', current_stage 1, region_code '11440'(데모 지역 서울 마포구)
--   체크인·별 시도·회고는 비어 있는 상태로 시작 (다른 사람 기록을 복제하지 않음)
-- 별자리·별은 모든 사용자가 함께 쓰는 콘텐츠라 위에서 한 번만 넣는다
`;

// 운영 DB(Neon)용 동기화 SQL: 기록을 지우지 않고 별자리·별·하위 퀘스트를 quests.json 내용으로 덮어씀
// 별 ID·하위 퀘스트 ID가 그대로라 star_attempts(시도·회고)·sub_quest 참조가 깨지지 않음
// (20261120_points.sql은 이미 Neon에 적용된 파일이라 더 이상 만들지 않음)
const syncSql = `-- 동기화 SQL: 루트 quests.json → 별자리 ${data.constellations.length}개·별 ${data.quests.length}개·하위 퀘스트 ${data.quests.length}개 (feat/points, 고민기록 #31)
${GENERATED}
-- 대상: 이미 운영 중인 DB (팀 공용 Neon). 새로 만드는 DB는 db/init/02_seed.sql에 같은 내용이 있음
-- 순서: 20261120_points.sql 다음 (포인트 뷰·stars.focus·tags가 필요). 없으면 처음에 멈추고 아무것도 바꾸지 않음
-- ✅ 기록을 지우지 않음: 별 ID(= quest id)가 그대로라 시도·회고·오늘의 추천·설문은 그대로 남음
--   바뀌는 것: 별자리 이름·테마·단계·별 수, 별의 소속 별자리·순서·문구·확인 방식·바깥 여부·focus·tags, 하위 퀘스트 문구
--   지우는 것: quests.json에 없는 별자리 (별이 하나도 없을 때만)와 그 별자리를 가리키는 user_constellations 줄
-- quests.json을 고칠 때마다 다시 생성되고, Neon에서 다시 실행하면 됨. 여러 번 실행해도 결과가 같음 (한 트랜잭션)
-- 적용: Neon 콘솔 → SQL Editor에 이 파일 내용을 붙여넣고 Run
--       또는 psql "$DATABASE_URL" -f db/migrations/20261121_quests_sync.sql
-- 확인: SELECT id, stage, name, star_count FROM constellations ORDER BY id;   → ${data.constellations.map((c) => `${c.id} ${c.name}`).join(", ")}
--       SELECT count(*) FROM stars;  → ${data.quests.length}      SELECT count(*) FROM sub_quests;  → ${data.quests.length}

BEGIN;

-- 0. 포인트 변경(20261120_points.sql)이 먼저 들어갔는지 확인
DO $$
BEGIN
  IF to_regclass('public.v_star_points') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stars' AND column_name = 'focus') THEN
    RAISE EXCEPTION '20261120_points.sql을 먼저 적용해 주세요 (v_star_points, stars.focus 없음)';
  END IF;
END $$;

-- 1. 별자리 (id = 도감 캐릭터 순서)
INSERT INTO constellations (id, stage, name, theme, star_count) VALUES
${constRows}
ON CONFLICT (id) DO UPDATE SET stage = EXCLUDED.stage, name = EXCLUDED.name, theme = EXCLUDED.theme, star_count = EXCLUDED.star_count;

-- 2. 별: 별자리 안 순서(constellation_id, position)가 서로 겹치지 않게 잠깐 음수 순서로 비켜 둔 뒤 덮어씀
UPDATE stars SET position = -id;
INSERT INTO stars (id, constellation_id, position, title, description, verify_type, place_type, category, is_outside, focus, tags) VALUES
${starValues}
ON CONFLICT (id) DO UPDATE SET
  constellation_id = EXCLUDED.constellation_id, position = EXCLUDED.position, title = EXCLUDED.title,
  description = EXCLUDED.description, verify_type = EXCLUDED.verify_type, place_type = EXCLUDED.place_type,
  category = EXCLUDED.category, is_outside = EXCLUDED.is_outside, focus = EXCLUDED.focus, tags = EXCLUDED.tags;

-- quests.json에 없는 별이 DB에 남아 있으면 멈춤 (별을 지우면 시도 기록이 깨지므로 자동으로 지우지 않음)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM stars WHERE position < 0) THEN
    RAISE EXCEPTION 'quests.json에 없는 별이 DB에 있어요. 그 별을 quests.json에 다시 넣거나 따로 정리해 주세요';
  END IF;
END $$;

-- 3. 하위 퀘스트 (더 작게 해 보기 = easier_title, 하위 퀘스트 ID = 별 ID)
INSERT INTO sub_quests (id, star_id, position, title) VALUES
${subRows}
ON CONFLICT (id) DO UPDATE SET position = EXCLUDED.position, title = EXCLUDED.title;

-- 4. quests.json에 없는 별자리 지우기 (별이 하나도 없는 것만)
DELETE FROM user_constellations WHERE constellation_id NOT IN (${constIdList});
DELETE FROM constellations c
WHERE c.id NOT IN (${constIdList}) AND NOT EXISTS (SELECT 1 FROM stars s WHERE s.constellation_id = c.id);

-- 5. 번호 이어 붙이기 (새로 만든 DB와 같은 값)
SELECT setval('constellations_id_seq', ${maxConst});
SELECT setval('stars_id_seq', ${maxStar});
SELECT setval('sub_quests_id_seq', ${maxStar});

COMMIT;
`;

const outputs: [string, string][] = [
  ["db/init/02_seed.sql", seedSql],
  ["db/migrations/20261121_quests_sync.sql", syncSql],
];
let stale = 0;
for (const [rel, text] of outputs) {
  const path = `${root}${rel}`;
  const current = (() => {
    try {
      return readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    } catch {
      return null;
    }
  })();
  if (current === text) {
    console.log(`그대로  ${rel}`);
  } else if (check) {
    stale++;
    console.error(`다름    ${rel} (quests.json을 고친 뒤 생성 스크립트를 다시 실행하지 않음)`);
  } else {
    writeFileSync(path, text);
    console.log(`새로 씀 ${rel}`);
  }
}
console.log(`별자리 ${data.constellations.length}개 · 별 ${data.quests.length}개 · 하위 퀘스트 ${data.quests.length}개 (${stageCount})`);
process.exit(stale ? 1 : 0);
