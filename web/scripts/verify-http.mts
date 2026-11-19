// 실제 쿠키 세션으로 HTTP 흐름 검증: 데모 시작 → 체크인 → 추천 → 시도 저장 → 밤하늘 재조회
// 브라우저 세 개(A, B, C)와 세션 없는 요청(N)을 흉내 내 다른 세션의 기록 접근이 거절되는지 본다.
// C는 같은 세션에서 바깥 → 집 안으로 바꿨을 때 집 안 별만 추천되는지 본다. DB 장애 응답은 --expect-db-down (아래)
// 권장: 로컬 서버 + 로컬 Docker DB + GEMINI_API_KEY 비움 (무료 한도 보호)
// ⚠ 공용 DB에 데모 사용자 2명과 기록이 생긴다. 끝나면 이 스크립트가 받은 쿠키에 묶인 사용자만 지운다(--keep이면 남김).
// 실행 (web/에서, 서버를 먼저 띄운 뒤):
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-http.mts [--base=http://localhost:3107] [--keep]
// 배포 주소에 쓸 때: --base=https://<배포 주소> (정리하려면 그 배포가 쓰는 DATABASE_URL이 .env.local과 같아야 함)
import { createHash } from "node:crypto";

const BASE = process.argv.find((a) => a.startsWith("--base="))?.slice(7) ?? "http://localhost:3107";
const keep = process.argv.includes("--keep");
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

class Browser {
  cookie = "";
  constructor(readonly name: string) {}
  async call(method: string, path: string, body?: unknown): Promise<{ status: number; data: Json }> {
    const res = await fetch(`${BASE}/api/${path}`, {
      method,
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) {
      const m = c.match(/^naranhi_demo=([^;]+)/);
      if (m) this.cookie = `naranhi_demo=${m[1]}`;
    }
    return { status: res.status, data: ((await res.json().catch(() => null)) ?? {}) as Json };
  }
  token() {
    return this.cookie.split("=")[1] ?? null;
  }
}

let pass = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else failCount++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail).slice(0, 400)}` : ""}`);
}
const show = (label: string, r: { status: number; data: Json }) => console.log(`${label}: [${r.status}] ${JSON.stringify(r.data).slice(0, 500)}`);

/** 집 안 범위 별 ID (1단계 + GPS 아님). 검증용 DB에서 직접 읽는다 */
async function homeStarIds(): Promise<Set<number>> {
  const pg = (await import("pg")).default;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query<{ id: number }>(
      "SELECT s.id FROM stars s JOIN constellations c ON c.id = s.constellation_id WHERE c.stage = 1 AND s.verify_type <> 'gps'",
    );
    return new Set(rows.map((r) => r.id));
  } finally {
    await c.end();
  }
}

// --expect-db-down: 서버를 닿지 않는 DATABASE_URL로 띄운 뒤 장애 응답만 확인 (로컬 전용, DB를 건드리지 않음)
//   DATABASE_URL=postgres://app:app@localhost:59999/x GEMINI_API_KEY= npx next start -p 3108
//   node node_modules/tsx/dist/cli.mjs scripts/verify-http.mts --base=http://localhost:3108 --expect-db-down
if (process.argv.includes("--expect-db-down")) {
  console.log(`\n== DB 장애 모드 · ${BASE} · ${new Date().toISOString()} ==\n`);
  const X = new Browser("X");
  X.cookie = "naranhi_demo=" + "A".repeat(43); // 형식만 맞는 가짜 쿠키 (DB 조회 단계에서 장애가 나게)
  const s = await new Browser("Y").call("POST", "demo/session", {});
  check("데모 시작 → 503 ready:false", s.status === 503 && s.data.ready === false, s);
  const ck = await X.call("POST", "checkin", { text: "그냥 다 끝내고 싶어요", todayChoice: "home" });
  check("체크인 → 200, checkinId null, 위기 안내 help 유지", ck.status === 200 && ck.data.checkinId === null && !!ck.data.help?.title, ck);
  const rec = await X.call("POST", "recommendations", { checkinId: 1 });
  check("추천 → 500 LOAD_FAILED (401 아님)", rec.status === 500 && rec.data.code === "LOAD_FAILED", rec);
  const at = await X.call("POST", "attempts", { starId: 1, status: "dim", reflection: "그냥 다 끝내고 싶어요" });
  check("시도 저장 → 503 SAVE_FAILED + help", at.status === 503 && at.data.code === "SAVE_FAILED" && !!at.data.help?.title, at);
  const sky = await X.call("GET", "sky");
  check("밤하늘 → 503 LOAD_FAILED", sky.status === 503 && sky.data.code === "LOAD_FAILED", sky);
  const wx = await X.call("PATCH", "checkin/weather", { checkinId: 1, weather: "sunny" });
  check("날씨 수정 → 500", wx.status === 500, wx);
  const health = await (await fetch(`${BASE}/api/health`)).json();
  check("health → db 오류 코드만 (주소 노출 없음)", /^error: /.test(health.db) && !/postgres|@|:\/\//.test(JSON.stringify(health)), health);
  console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
  process.exit(failCount ? 1 : 0);
}

const A = new Browser("A");
const B = new Browser("B");
const N = new Browser("N"); // 세션 없음
const cleanupTokens: (string | null)[] = []; // A·B 외에 이번 실행에서 만든 세션 (정리 대상)
console.log(`\n== ${BASE} · ${new Date().toISOString()} ==\n`);

try {
  // 세션 없음
  const n1 = await N.call("POST", "recommendations", { checkinId: 1 });
  show("세션 없이 추천", n1);
  check("세션 없이 추천 → 401 NO_SESSION", n1.status === 401 && n1.data.code === "NO_SESSION");
  const n2 = await N.call("POST", "attempts", { starId: 1, status: "dim", reflection: "그냥 다 끝내고 싶어요" });
  check("세션 없이 위기 표현 회고 → 401 + help", n2.status === 401 && n2.data.help?.title !== undefined, n2.data);

  // 데모 시작 (브라우저 A, B)
  for (const b of [A, B]) {
    const s = await b.call("POST", "demo/session", {});
    check(`${b.name} 데모 시작 → ready + 쿠키`, s.status === 200 && s.data.ready === true && !!b.token(), s);
  }

  // 체크인 → 추천
  const ck = await A.call("POST", "checkin", { text: "오늘은 집 근처까지는 나갈 수 있을 것 같아요.", todayChoice: "near" });
  show("A 체크인", ck);
  check("A 체크인 저장 (checkinId 숫자)", ck.status === 200 && Number.isInteger(ck.data.checkinId));
  const checkinA = ck.data.checkinId as number;

  const rec1 = await A.call("POST", "recommendations", { checkinId: checkinA });
  show("A 추천", rec1);
  const items = (rec1.data.items ?? []) as Json[];
  check("정상 추천 → 200, 1~3개, starId·title·reason", rec1.status === 200 && items.length >= 1 && items.length <= 3 && items.every((i) => Number.isInteger(i.starId) && i.title && i.reason));
  const rec2 = await A.call("POST", "recommendations", { checkinId: checkinA });
  const rec3 = await A.call("POST", "recommendations", { checkinId: checkinA });
  check("같은 요청 반복 → 같은 결과 (reused=true)", [rec2, rec3].every((r) => r.status === 200 && r.data.reused === true && JSON.stringify(r.data.items) === JSON.stringify(items)));

  const other = await B.call("POST", "recommendations", { checkinId: checkinA });
  show("B가 A의 체크인으로 추천", other);
  check("다른 세션의 체크인 → 404", other.status === 404 && other.data.code === "NOT_FOUND");

  // 쉬어 가기
  const ckRest = await B.call("POST", "checkin", { text: "오늘은 조금 쉬고 싶어요.", todayChoice: "rest" });
  const recRest = await B.call("POST", "recommendations", { checkinId: ckRest.data.checkinId });
  show("B 쉬어 가기 추천", recRest);
  check("쉬어 가기 → 200 빈 추천", recRest.status === 200 && Array.isArray(recRest.data.items) && recRest.data.items.length === 0);

  // 시도 저장 → 밤하늘 재조회
  const starId = items[0]?.starId as number;
  const at = await A.call("POST", "attempts", { starId, status: "dim", reflection: "현관문을 열고 잠깐 서 봤어요", verifyMethod: "self", stopReason: "tired" });
  show("A 시도 저장", at);
  check("시도 저장 → 201 + cheer, help null", at.status === 201 && typeof at.data.cheer === "string" && at.data.help === null);

  const skyA1 = await A.call("GET", "sky");
  const skyA2 = await A.call("GET", "sky"); // 새로고침
  const starA = (skyA2.data.stars as Json[]).find((s) => s.starId === starId);
  check("새로고침 후 같은 별에 날짜·회고", starA?.status === "dim" && starA.memories[0]?.reflection === "현관문을 열고 잠깐 서 봤어요" && /^\d{4}-\d{2}-\d{2}$/.test(starA.memories[0]?.date), starA);
  check("재조회 결과 동일", JSON.stringify(skyA1.data) === JSON.stringify(skyA2.data));
  const skyB = await B.call("GET", "sky");
  const starB = (skyB.data.stars as Json[]).find((s) => s.starId === starId);
  check("다른 세션의 밤하늘에는 A의 기록 없음", starB?.status === "untried" && starB.memories.length === 0, starB);

  // 같은 브라우저로 데모 시작을 다시 눌러도 같은 사용자
  await A.call("POST", "demo/session", {});
  const skyA3 = await A.call("GET", "sky");
  check("데모 시작 재호출 → 같은 사용자(기록 유지)", JSON.stringify(skyA3.data) === JSON.stringify(skyA2.data));

  // 같은 세션에서 바깥 → 집 안: 하루 한 번 저장된 추천을 재사용할 때도 집 안 범위만 나와야 한다
  // 집 안 = 1단계 별 중 GPS가 아닌 별 (recommendations/service.ts scopeOf)
  const C = new Browser("C");
  const sc = await C.call("POST", "demo/session", {});
  check("C 데모 시작", sc.status === 200 && sc.data.ready === true && !!C.token(), sc);
  cleanupTokens.push(C.token()); // 중간에 실패해도 정리되도록 바로 등록
  const homeIds = await homeStarIds();
  const ckOut = await C.call("POST", "checkin", { text: "오늘은 바깥에도 나가 볼 수 있을 것 같아요.", todayChoice: "out" });
  const recOut = await C.call("POST", "recommendations", { checkinId: ckOut.data.checkinId });
  show("C 바깥 추천", recOut);
  const outItems = (recOut.data.items ?? []) as Json[];
  check("바깥 추천 → 200, 집 안이 아닌 별 포함", recOut.status === 200 && outItems.some((i) => !homeIds.has(i.starId)), outItems);
  const ckHome = await C.call("POST", "checkin", { text: "역시 오늘은 집 안에서만 해 볼래요.", todayChoice: "home" });
  const recHome = await C.call("POST", "recommendations", { checkinId: ckHome.data.checkinId });
  show("C 집 안 추천", recHome);
  const homeItems = (recHome.data.items ?? []) as Json[];
  check(
    "같은 세션 바깥 → 집 안 → 집 안 별만 (GPS·바깥 별 없음)",
    recHome.status === 200 && recHome.data.todayChoice === "home" && homeItems.length >= 1 &&
      homeItems.every((i) => homeIds.has(i.starId) && i.verifyType !== "gps"),
    homeItems,
  );
} finally {
  const tokens = [A.token(), B.token(), ...cleanupTokens].filter((t): t is string => !!t);
  if (!keep && tokens.length && process.env.DATABASE_URL) {
    const pg = (await import("pg")).default;
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const hashes = tokens.map((t) => createHash("sha256").update(t).digest("hex"));
    const ids = (await c.query<{ user_id: number }>("SELECT user_id FROM demo_sessions WHERE token_hash = ANY($1)", [hashes])).rows.map((r) => r.user_id);
    // ON DELETE CASCADE로 세션·체크인·시도·추천·초안이 함께 지워진다
    const del = ids.length ? await c.query("DELETE FROM users WHERE id = ANY($1)", [ids]) : { rowCount: 0 };
    console.log(`\n정리: 이 스크립트의 데모 사용자 ${ids.join(", ") || "없음"} 삭제 (${del.rowCount}명)`);
    await c.end();
  } else if (tokens.length) {
    console.log("\n정리 안 함 (--keep 또는 DATABASE_URL 없음). 쿠키 토큰 수:", tokens.length);
  }
}
console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
process.exit(failCount ? 1 : 0);
