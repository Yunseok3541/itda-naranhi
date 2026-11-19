// AI 기능 실호출 기록: 새 가상 세션으로 체크인 → 추천(최초) → 추천(재사용) → 회고 응원 → 문의 초안을 한 번씩 부른다.
// 기능별로 요청 모델(서버 설정값), 응답에 실제로 담긴 modelVersion, usedFallback, 확인 시각을 표로 남긴다.
// - /api/health의 geminiModel은 "설정값"일 뿐이다. AI 호출 성공은 각 응답의 usedFallback·modelVersion으로만 판정한다.
// - 같은 날 다시 받은 추천(reused=true)은 모델을 부르지 않은 응답이라 따로 표시한다.
// ⚠ 공개 주소에서는 운영 키의 한도를 쓰므로 한 번만 실행한다. 반복 회귀는 로컬·모의 응답(verify-star-api.mts)으로.
// ⚠ 공용 DB에 데모 사용자 1명이 생긴다. 끝나면 이 쿠키의 사용자만 지운다(--keep이면 남김, 배포 DB가 .env.local과 같을 때만 정리됨).
// 실행 (web/에서):
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-ai-live.mts --base=http://localhost:3107
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-ai-live.mts --base=https://itda-naranhi.vercel.app
import { createHash } from "node:crypto";

const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3107";
const keep = process.argv.includes("--keep");
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let cookie = "";
async function call(method: string, path: string, body?: unknown) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie()) {
    const m = c.match(/^naranhi_demo=([^;]+)/);
    if (m) cookie = `naranhi_demo=${m[1]}`;
  }
  const data = ((await res.json().catch(() => null)) ?? {}) as Json;
  return { status: res.status, data, ms: Date.now() - started };
}

const kst = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).replace(" ", "T") + "+09:00";
type Row = { 기능: string; HTTP: number; 요청모델: string; 응답modelVersion: string; usedFallback: string; 비고: string; 시각: string; ms: number };
const rows: Row[] = [];
let requested = "확인 못 함";
const version = (d: Json) => ("modelVersion" in d ? String(d.modelVersion ?? "null (모델 응답 없음)") : "응답에 칸 없음");

try {
  const health = await call("GET", "health");
  requested = String(health.data.geminiModel ?? "응답에 칸 없음");
  console.log(`\n== ${BASE} · ${kst()} · /api/health 설정값 geminiModel=${requested}, gemini=${health.data.gemini} ==\n`);

  const s = await call("POST", "demo/session", {});
  if (!s.data.ready) throw new Error(`데모 시작 실패: ${JSON.stringify(s.data)}`);

  const ck = await call("POST", "checkin", { text: "오늘은 집 근처까지는 나갈 수 있을 것 같아요.", todayChoice: "near" });
  rows.push({ 기능: "② 체크인 마음 날씨", HTTP: ck.status, 요청모델: requested, 응답modelVersion: version(ck.data), usedFallback: String(ck.data.usedFallback), 비고: `weather=${ck.data.weather}`, 시각: kst(), ms: ck.ms });

  const r1 = await call("POST", "recommendations", { checkinId: ck.data.checkinId });
  rows.push({ 기능: "① 추천 (최초 호출)", HTTP: r1.status, 요청모델: requested, 응답modelVersion: version(r1.data), usedFallback: String(r1.data.usedFallback), 비고: `reused=${r1.data.reused}, 별 ${(r1.data.items ?? []).map((i: Json) => i.starId).join(",")}`, 시각: kst(), ms: r1.ms });

  const r2 = await call("POST", "recommendations", { checkinId: ck.data.checkinId });
  rows.push({ 기능: "① 추천 (같은 날 재요청)", HTTP: r2.status, 요청모델: "모델 호출 없음", 응답modelVersion: version(r2.data), usedFallback: String(r2.data.usedFallback), 비고: `reused=${r2.data.reused}, 최초와 같은 별=${JSON.stringify(r2.data.items) === JSON.stringify(r1.data.items)}`, 시각: kst(), ms: r2.ms });

  const starId = r1.data.items?.[0]?.starId ?? 12;
  const at = await call("POST", "attempts", { starId, status: "dim", reflection: "현관문을 열고 잠깐 서 봤어요", verifyMethod: "self", stopReason: "tired" });
  rows.push({ 기능: "④ 회고 응원", HTTP: at.status, 요청모델: requested, 응답modelVersion: version(at.data), usedFallback: String(at.data.usedFallback), 비고: `help=${at.data.help ? "있음" : "null"}`, 시각: kst(), ms: at.ms });

  const dr = await call("POST", "inquiries", { centerId: 9001, question: "처음인데 예약 없이 들러도 되나요?" });
  rows.push({ 기능: "⑥ 문의 초안 (가상 센터)", HTTP: dr.status, 요청모델: requested, 응답modelVersion: version(dr.data), usedFallback: String(dr.data.usedFallback), 비고: `sent=${dr.data.sent}`, 시각: kst(), ms: dr.ms });

  console.log("응답 원문");
  for (const [label, r] of [["체크인", ck], ["추천1", r1], ["추천2", r2], ["회고", at], ["초안", dr]] as const) {
    console.log(`- ${label}: ${JSON.stringify(r.data)}`);
  }
} finally {
  console.log("\n| 기능 | HTTP | 요청 모델(서버 설정) | 응답 modelVersion | usedFallback | 비고 | 확인 시각 | 응답 ms |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) console.log(`| ${r.기능} | ${r.HTTP} | ${r.요청모델} | ${r.응답modelVersion} | ${r.usedFallback} | ${r.비고} | ${r.시각} | ${r.ms} |`);

  const token = cookie.split("=")[1];
  if (!keep && token && process.env.DATABASE_URL) {
    const pg = (await import("pg")).default;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const hash = createHash("sha256").update(token).digest("hex");
    const ids = (await client.query<{ user_id: number }>("SELECT user_id FROM demo_sessions WHERE token_hash = $1", [hash])).rows.map((r) => r.user_id);
    const del = ids.length ? await client.query("DELETE FROM users WHERE id = ANY($1)", [ids]) : { rowCount: 0 };
    console.log(`\n정리: 데모 사용자 ${ids.join(", ") || "없음 (배포 DB가 다르면 남아 있음)"} 삭제 (${del.rowCount}명)`);
    await client.end();
  }
}
