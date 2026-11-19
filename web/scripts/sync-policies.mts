// 온통청년 청년정책 수집 + AI ⑤ 분류 (기획: docs/기획/정책추천.md)
// 새 정책·원문이 바뀐 정책만 분류하므로 두 번째 실행부터는 AI 호출이 거의 없다
// 실행 (web/에서). 앞에 붙인 DATABASE_URL이 .env.local 값보다 우선한다 → 로컬 DB에 먼저 넣어 확인
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/sync-policies.mts --no-classify   저장만 (AI 호출 없음)
//   DATABASE_URL=postgres://app:app@localhost:55440/starquest node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/sync-policies.mts                 저장 + 분류
//   --classify-only : 수집 없이 분류 안 된 정책만 분류
//   --region=11440  : 수집 지역 (기본 서울 마포구)
//   --limit=8       : (--classify-only와 함께) 이만큼만 분류
//   --apply-rules   : 이미 분류된 정책에 "개인이 신청·이용 가능한지" 이름 규칙만 다시 적용 (AI 호출 없음)
//   --reclassify    : 분류 기준·입력을 바꿨을 때. 대상 DB의 모든 정책 분류를 지우고 다시 분류 (정책 59개 기준 AI 8회)
// 시작할 때 대상 DB 종류(로컬 / 공용 Neon)를 출력한다. 공용 Neon에는 로컬 확인이 끝난 뒤 한 번만
const noClassify = process.argv.includes("--no-classify");
const classifyOnly = process.argv.includes("--classify-only");
const applyRules = process.argv.includes("--apply-rules");
const reclassify = process.argv.includes("--reclassify");
const region = process.argv.find((a) => a.startsWith("--region="))?.slice(9) ?? undefined;
const limitArg = Number(process.argv.find((a) => a.startsWith("--limit="))?.slice(8));
const limit = Number.isInteger(limitArg) && limitArg > 0 ? limitArg : undefined; // --classify-only와 함께: 이만큼만 분류 (품질 먼저 확인할 때)

const { db } = await import("@/lib/db");
const { GEMINI_MODEL } = await import("@/lib/gemini");
const { syncPolicies, DEMO_REGION } = await import("@/lib/policy-sync");
const { classifyPending, applyActionableRules } = await import("@/lib/policy-classify");
const { todayKst } = await import("@/app/api/_lib/http");

// 접속 정보는 출력하지 않는다 (호스트 종류만)
const host = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname;
  } catch {
    return "";
  }
})();
const target = /localhost|127\.0\.0\.1/.test(host) ? "로컬 DB" : host.endsWith("neon.tech") ? "공용 Neon" : "알 수 없는 DB";
const apiKey = process.env.YOUTH_POLICY_API_KEY ?? "";
if (reclassify && target !== "로컬 DB") console.log("※ 공용 DB 재분류입니다. 로컬에서 확인한 뒤에만 실행하세요.");
console.log(`== 정책 수집 · 대상 ${target} · 지역 ${region ?? DEMO_REGION} · AI ${noClassify || applyRules ? "사용 안 함" : process.env.GEMINI_API_KEY ? GEMINI_MODEL : "키 없음"} ==`);

try {
  if (applyRules) {
    const r = await applyActionableRules(db);
    for (const c of r.changed) console.log(`  ${c.actionable ? "이용 가능" : "사업"} ← ${c.title}`);
    console.log(`규칙으로 바뀐 정책 ${r.changed.length}개`);
  } else if (reclassify) {
    const reset = await db.query("UPDATE policies SET classified_at = NULL WHERE classified_at IS NOT NULL");
    console.log(`분류 초기화 ${reset.rowCount}개 → 다시 분류`);
    const r = await classifyPending(db, { log: console.log, limit });
    console.log(`분류 ${r.classified}, 남은 분류 전 ${r.pending}, 응답 모델 ${r.modelVersion ?? "-"}`);
  } else if (classifyOnly) {
    const r = await classifyPending(db, { log: console.log, limit });
    console.log(`분류 ${r.classified}, 남은 분류 전 ${r.pending}, 응답 모델 ${r.modelVersion ?? "-"}`);
  } else {
    if (!apiKey) throw new Error("YOUTH_POLICY_API_KEY가 비어 있어요 (web/.env.local)");
    const r = await syncPolicies({ db, apiKey, region, today: todayKst(), classify: !noClassify, log: console.log });
    console.log(`완료: 받음 ${r.fetched}, 저장 대상 ${r.kept}, 새 ${r.inserted}, 바뀜 ${r.updated}, 분류 ${r.classified}, 분류 전 ${r.pending}`);
  }
  const s = (
    await db.query<{ total: string; classified: string; local: string; national: string }>(
      `SELECT count(*) AS total, count(classified_at) AS classified,
              count(*) FILTER (WHERE region_code IS NOT NULL) AS local, count(*) FILTER (WHERE region_code IS NULL) AS national
       FROM policies`,
    )
  ).rows[0];
  console.log(`DB 정책: 전체 ${s.total} (지역 ${s.local}, 전국 ${s.national}), 분류됨 ${s.classified}`);
} catch (error) {
  console.error("실패:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.end();
}
