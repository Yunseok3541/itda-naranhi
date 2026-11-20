// AI 제공자 전환 검증 (고민기록 #41) — 실제 OpenAI·GMS·Gemini를 부르지 않는다
// 로컬에 가짜 OpenAI 호환 서버를 띄우고 AI_PROVIDER=openai로 generateJson을 부른다
// 실행 (web/에서): node node_modules/tsx/dist/cli.mjs scripts/verify-ai-provider.mts
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";

let pass = 0;
let failCount = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) pass++;
  else failCount++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${!cond && detail !== undefined ? `  → ${JSON.stringify(detail)}` : ""}`);
}

// 키 없음은 모듈을 읽을 때 정해지므로 따로 실행
if (process.argv.includes("--nokey")) {
  process.env.AI_PROVIDER = "openai";
  delete process.env.OPENAI_API_KEY;
  const { generateJson } = await import("@/lib/gemini");
  const r = await generateJson({ system: "s", prompt: "p", schema: {}, validate: (v): v is unknown => true, fallback: { ok: false } });
  console.log(JSON.stringify(r));
  process.exit(0);
}

type Seen = { auth?: string; body?: Record<string, unknown> };
const seen: Seen = {};
let mode: "ok" | "500" | "bad" | "slow" = "ok";
const server = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    seen.auth = req.headers.authorization;
    seen.body = JSON.parse(raw);
    if (req.url !== "/v1/chat/completions") { res.writeHead(404).end(); return; }
    if (mode === "500") { res.writeHead(500).end("{}"); return; }
    if (mode === "slow") { setTimeout(() => res.writeHead(200).end("{}"), 1500); return; }
    const content = mode === "bad" ? "JSON 아님" : JSON.stringify({ answer: "네", risk: "normal" });
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ model: "gpt-4o-mini-2024-07-18", choices: [{ message: { content } }] }));
  });
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as { port: number }).port;

process.env.AI_PROVIDER = "openai";
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1/`; // 끝 / 도 허용
process.env.OPENAI_MODEL = "";
process.env.GEMINI_API_KEY = "";
const { generateJson, AI_PROVIDER, ACTIVE_MODEL } = await import("@/lib/gemini");

type Out = { answer: string; risk: string };
const isOut = (v: unknown): v is Out => !!v && typeof (v as Out).answer === "string";
const base = { system: "너는 도우미", prompt: "질문", schema: { type: "object", properties: { answer: { type: "string" } } }, validate: isOut, fallback: { answer: "기본", risk: "normal" } };

try {
  check("제공자 openai, 모델 비우면 gpt-4o-mini", AI_PROVIDER === "openai" && ACTIVE_MODEL === "gpt-4o-mini", { AI_PROVIDER, ACTIVE_MODEL });

  const r1 = await generateJson<Out>({ ...base, temperature: 0, model: "gemini-3.5-flash-lite" });
  check("성공: AI 답 사용, 응답 모델 기록", !r1.usedFallback && r1.data.answer === "네" && r1.modelVersion === "gpt-4o-mini-2024-07-18", r1);
  check("요청: Bearer 키, JSON 모드, 온도 전달", seen.auth === "Bearer test-key" && (seen.body?.response_format as { type: string })?.type === "json_object" && seen.body?.temperature === 0, { auth: !!seen.auth, body: seen.body?.response_format });
  check("요청: Gemini 모델 이름은 gpt-4o-mini로 바꿔 보냄", seen.body?.model === "gpt-4o-mini", seen.body?.model);
  const sys = (seen.body?.messages as { role: string; content: string }[])[0];
  check("요청: 지시문에 JSON Schema를 붙임 (JSON 모드 조건)", sys.role === "system" && sys.content.includes("JSON Schema") && sys.content.includes('"answer"'), sys.content.slice(-80));

  await generateJson<Out>({ ...base, model: "gpt-4.1-mini" });
  check("요청: gpt- 모델 이름은 그대로", seen.body?.model === "gpt-4.1-mini", seen.body?.model);

  mode = "500";
  const r2 = await generateJson<Out>(base);
  check("서버 오류 500 → error, 기본값", r2.usedFallback && r2.fallbackReason === "error" && r2.data.answer === "기본", r2);

  mode = "bad";
  const r3 = await generateJson<Out>(base);
  check("JSON이 아닌 답 → invalid, 기본값", r3.usedFallback && r3.fallbackReason === "invalid", r3);

  mode = "slow";
  const t = Date.now();
  const r4 = await generateJson<Out>({ ...base, timeoutMs: 300 });
  check("시간 초과 → error, 기다리지 않음", r4.fallbackReason === "error" && Date.now() - t < 1200, { r4, ms: Date.now() - t });

  const nokey = JSON.parse(execFileSync(process.execPath, [process.argv[1].endsWith(".mts") ? "node_modules/tsx/dist/cli.mjs" : "", process.argv[1], "--nokey"].filter(Boolean), { encoding: "utf8", env: { ...process.env, OPENAI_API_KEY: "" } }).trim().split("\n").pop()!);
  check("키 없음 → no_key, 호출 안 함", nokey.usedFallback && nokey.fallbackReason === "no_key", nokey);
} finally {
  server.close();
}
console.log(`\n${failCount ? "FAIL" : "PASS"} ${pass}/${pass + failCount}`);
if (failCount) process.exitCode = 1;
