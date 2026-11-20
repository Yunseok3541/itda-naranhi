// 신청 도우미 대화 이어 보기 저장 검증 (고민기록 #44) — 브라우저 없이 가짜 저장소로
// 실행 (web/에서): node node_modules/tsx/dist/cli.mjs scripts/verify-helper-store.mts
const { chatKey, loadChat, saveChat, clearChat, MAX_MESSAGES, MAX_LOG, MAX_AGE_MS } = await import("@/lib/apply-helper-store");

let pass = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else failCount++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
}

/** 브라우저 sessionStorage 흉내 (옵션으로 실패를 일부러 냄) */
function fakeStore(opts: { failSet?: boolean; failGet?: boolean } = {}) {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => { if (opts.failGet) throw new Error("blocked"); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (opts.failSet) throw new Error("QuotaExceededError"); m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

type Msg = { id: number; from: string; text: string };
type Turn = { role: string; text: string };
const msgs = (n: number): Msg[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, from: i % 2 ? "bot" : "me", text: `말 ${i}` }));
const log = (n: number): Turn[] => Array.from({ length: n }, (_, i) => ({ role: i % 2 ? "bot" : "user", text: `기록 ${i}` }));
const now = 1_000_000_000;

const s = fakeStore();
const k161 = chatKey("api", 161);
check("저장 → 다시 열면 그대로 이어짐", saveChat(k161, { messages: msgs(3), chatLog: log(2), lastQuestion: "혼자 사는데 돼?" }, s, now)
  && loadChat<Msg, Turn>(k161, s, now + 1000)?.messages.length === 3 && loadChat<Msg, Turn>(k161, s, now)?.lastQuestion === "혼자 사는데 돼?");
check("정책별로 따로 (161 대화가 156에 안 보임)", loadChat(chatKey("api", 156), s, now) === null);
check("예시 모드와 실제 모드도 따로", chatKey("example", 161) !== k161 && loadChat(chatKey("example", 161), s, now) === null);

saveChat(k161, { messages: msgs(60), chatLog: log(70), lastQuestion: "가".repeat(300) }, s, now);
const big = loadChat<Msg, Turn>(k161, s, now)!;
check(`오래 쌓이지 않게: 말풍선 ${MAX_MESSAGES}개·기록 ${MAX_LOG}줄·질문 200자까지 (최근 것 남김)`,
  big.messages.length === MAX_MESSAGES && big.messages.at(-1)!.text === "말 59" && big.chatLog.length === MAX_LOG && big.lastQuestion.length === 200,
  { m: big.messages.length, l: big.chatLog.length });

check(`${MAX_AGE_MS / 3_600_000}시간이 지나면 새로 시작하고 지움`, loadChat(k161, s, now + MAX_AGE_MS + 1) === null && !s.m.has(k161));

s.m.set(k161, "{망가진 값");
check("망가진 값 → 새 대화, 값은 지움", loadChat(k161, s, now) === null && !s.m.has(k161));
s.m.set(k161, JSON.stringify({ v: 2, savedAt: now, messages: [], chatLog: [], lastQuestion: "" }));
check("모르는 형식(버전 다름) → 새 대화", loadChat(k161, s, now) === null);
s.m.set(k161, JSON.stringify({ v: 1, savedAt: now, messages: "x", chatLog: [], lastQuestion: "" }));
check("칸 모양이 틀림 → 새 대화", loadChat(k161, s, now) === null);

saveChat(k161, { messages: msgs(2), chatLog: [], lastQuestion: "" }, s, now);
clearChat(k161, s);
check("[대화 지우기] → 다시 열면 처음부터", loadChat(k161, s, now) === null && !s.m.has(k161));
saveChat(k161, { messages: msgs(2), chatLog: [], lastQuestion: "" }, s, now);
saveChat(k161, { messages: [], chatLog: [], lastQuestion: "" }, s, now);
check("빈 대화를 저장하면 값을 남기지 않음", !s.m.has(k161));

check("저장소가 없는 환경(사생활 보호 모드 등) → 오류 없이 저장 안 함", loadChat(k161, null, now) === null && saveChat(k161, { messages: msgs(1), chatLog: [], lastQuestion: "" }, null, now) === false);
check("용량 초과로 저장 실패 → 오류 없이 false (대화는 화면에서 계속)", saveChat(k161, { messages: msgs(1), chatLog: [], lastQuestion: "" }, fakeStore({ failSet: true }), now) === false);
check("읽기가 막힘 → 오류 없이 새 대화", loadChat(k161, fakeStore({ failGet: true }), now) === null);
let threw = false;
try { clearChat(k161, null); } catch { threw = true; }
check("저장소 없이 지우기 → 오류 없음", !threw);

console.log(`\n${failCount ? "FAIL" : "PASS"} ${pass}/${pass + failCount}`);
if (failCount) process.exitCode = 1;
