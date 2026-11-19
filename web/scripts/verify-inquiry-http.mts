// 청년센터·문의 초안 HTTP 검증 (가상 센터): 센터 목록·상세 → 초안 생성 → 수정 → 재조회 → "문의해 봤어요" 기록
// 브라우저 두 개(A, B)와 세션 없는 요청(N)으로 다른 세션에서 초안이 보이지 않는지 본다. AI 호출은 초안 생성 1번뿐.
// ⚠ 공용 DB에 데모 사용자 2명이 생긴다. 끝나면 이 스크립트가 받은 쿠키에 묶인 사용자만 지운다(--keep이면 남김).
// 실행 (web/에서, 서버를 먼저 띄운 뒤):
//   node --env-file=.env.local node_modules/tsx/dist/cli.mjs scripts/verify-inquiry-http.mts [--base=http://localhost:3107] [--keep]
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
const show = (label: string, r: { status: number; data: Json }) => console.log(`${label}: [${r.status}] ${JSON.stringify(r.data)}`);

const A = new Browser("A");
const B = new Browser("B");
const N = new Browser("N"); // 세션 없음
console.log(`\n== ${BASE} · ${new Date().toISOString()} ==\n`);

try {
  // ---------- 센터 (세션 불필요) ----------
  const list = await N.call("GET", "centers?region=11440");
  show("센터 목록", list);
  const center = (list.data.centers ?? [])[0] as Json | undefined;
  check("센터 목록 200 + centerId·isSample·source 칸", list.status === 200 && Number.isInteger(center?.centerId) && "isSample" in (center ?? {}) && "source" in (center ?? {}));
  const centerId = center?.centerId as number;
  const detail = await N.call("GET", `centers/${centerId}`);
  show("센터 상세", detail);
  const c = detail.data.center as Json;
  check("가상 센터: isSample=true, source=null", c?.isSample === true && c?.source === null);
  check("가상 센터: 전화·운영시간·홈페이지·좌표는 null (꾸며내지 않음)", c?.phone === null && c?.hours === null && c?.url === null && c?.lat === null && c?.lng === null);
  check("없는 센터 → 404 NOT_FOUND", (await N.call("GET", "centers/1")).data.code === "NOT_FOUND");
  check("centerId 숫자 아님 → 400 INVALID", (await N.call("GET", "centers/abc")).data.code === "INVALID");
  check("region 형식 오류 → 400", (await N.call("GET", "centers?region=abc")).status === 400);
  const empty = await N.call("GET", "centers?region=26110");
  check("다른 지역 → 200 빈 목록", empty.status === 200 && empty.data.centers?.length === 0);

  // ---------- 세션 없음 ----------
  const n1 = await N.call("POST", "inquiries", { centerId, question: "처음인데 괜찮을까요?" });
  show("세션 없이 초안 생성", n1);
  check("세션 없이 초안 생성 → 401 NO_SESSION", n1.status === 401 && n1.data.code === "NO_SESSION");
  const n2 = await N.call("POST", "inquiries", { centerId, question: "다 끝내고 싶어서요" });
  check("세션 없이 위기 표현 질문 → 401 + help", n2.status === 401 && n2.data.help?.title !== undefined, n2.data);
  check("세션 없이 초안 목록 → 401", (await N.call("GET", "inquiries")).status === 401);

  for (const b of [A, B]) {
    const s = await b.call("POST", "demo/session", {});
    check(`${b.name} 데모 시작 → ready + 쿠키`, s.status === 200 && s.data.ready === true && !!b.token(), s);
  }

  // ---------- 초안 생성 → 수정 → 재조회 ----------
  const created = await A.call("POST", "inquiries", { centerId, question: "처음인데 예약 없이 들러도 되나요?" });
  show("A 초안 생성", created);
  const d = created.data;
  check("초안 생성 → 201, 저장만 한 상태(sent=false, sentAt=null)", created.status === 201 && Number.isInteger(d.draftId) && d.sent === false && d.sentAt === null);
  check("초안에 입력에 없는 숫자 없음", typeof d.draft === "string" && !/\d/.test(d.draft));
  const draftId = d.draftId as number;

  const edited = "안녕하세요. 처음 방문하려고 하는데 예약 없이 잠깐 둘러봐도 괜찮을까요?";
  const patched = await A.call("PATCH", `inquiries/${draftId}`, { draft: edited });
  show("A 초안 수정", patched);
  check("초안 수정 → 200, 고친 문장, 여전히 sent=false", patched.status === 200 && patched.data.draft === edited && patched.data.sent === false);

  const relist = await A.call("GET", `inquiries?centerId=${centerId}`);
  show("A 재조회", relist);
  const mine = (relist.data.drafts as Json[] | undefined)?.find((x) => x.draftId === draftId);
  check("재조회 → 고친 문장 그대로, sent=false", mine?.draft === edited && mine?.sent === false && mine?.question === "처음인데 예약 없이 들러도 되나요?");

  // ---------- 다른 세션 ----------
  const bAll = await B.call("GET", "inquiries");
  const bCenter = await B.call("GET", `inquiries?centerId=${centerId}`);
  check("다른 세션 목록에 A의 초안 없음", bAll.status === 200 && !(bAll.data.drafts as Json[]).some((x) => x.draftId === draftId) && (bCenter.data.drafts as Json[]).length === 0);
  const bPatch = await B.call("PATCH", `inquiries/${draftId}`, { draft: "남의 초안 고치기" });
  check("다른 세션이 A의 초안 수정 → 404", bPatch.status === 404 && bPatch.data.code === "NOT_FOUND", bPatch);
  const bSent = await B.call("PATCH", `inquiries/${draftId}`, { sent: true });
  check("다른 세션이 A의 초안을 보냄 기록 → 404", bSent.status === 404);

  // ---------- 저장 상태 vs 보냈다고 기록한 상태 ----------
  const sent = await A.call("PATCH", `inquiries/${draftId}`, { sent: true });
  show("A 문의해 봤어요", sent);
  check("보냄 기록 → sent=true, sentAt 날짜, 문장은 그대로", sent.status === 200 && sent.data.sent === true && /^\d{4}-\d{2}-\d{2}$/.test(sent.data.sentAt) && sent.data.draft === edited);
  const after = await A.call("GET", "inquiries");
  check("재조회에도 sent=true 유지", (after.data.drafts as Json[]).find((x) => x.draftId === draftId)?.sent === true);

  // ---------- 입력 오류 ----------
  check("질문 비어 있음 → 400 INVALID", (await A.call("POST", "inquiries", { centerId, question: "" })).data.code === "INVALID");
  check("없는 센터로 초안 → 404", (await A.call("POST", "inquiries", { centerId: 1, question: "처음인데 괜찮을까요?" })).status === 404);
  check("sent=false → 400 (보냄 기록은 되돌리지 않음)", (await A.call("PATCH", `inquiries/${draftId}`, { sent: false })).status === 400);
  check("draft·sent 둘 다 없음 → 400", (await A.call("PATCH", `inquiries/${draftId}`, {})).status === 400);
} finally {
  const tokens = [A.token(), B.token()].filter((t): t is string => !!t);
  if (!keep && tokens.length && process.env.DATABASE_URL) {
    const pg = (await import("pg")).default;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const hashes = tokens.map((t) => createHash("sha256").update(t).digest("hex"));
    const ids = (await client.query<{ user_id: number }>("SELECT user_id FROM demo_sessions WHERE token_hash = ANY($1)", [hashes])).rows.map((r) => r.user_id);
    const del = ids.length ? await client.query("DELETE FROM users WHERE id = ANY($1)", [ids]) : { rowCount: 0 };
    console.log(`\n정리: 이 스크립트의 데모 사용자 ${ids.join(", ") || "없음"} 삭제 (${del.rowCount}명)`);
    await client.end();
  }
}
console.log(`\n결과: PASS ${pass} / FAIL ${failCount}`);
process.exit(failCount ? 1 : 0);
