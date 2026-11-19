// 새 API들이 함께 쓰는 응답 형식 (docs/API명세.md "공통 규칙")
// _lib 폴더는 밑줄로 시작해 라우트가 되지 않는다 (Next.js private folder)
import type { QueryResult, QueryResultRow } from "pg";
import { HELP_MESSAGE } from "@/lib/safety";

export type Help = typeof HELP_MESSAGE | null;

// 세션 없음(401)은 윤석 담당 @/lib/demo-session 의 demoSessionRequired() → code "DEMO_SESSION_REQUIRED"
export type ErrorCode = "INVALID" | "NOT_FOUND" | "SAVE_FAILED" | "LOAD_FAILED";

/** 서비스 함수의 결과. 라우트에서 toResponse로 그대로 응답한다 (테스트에서는 값만 확인) */
export type ApiResult = { status: number; body: Record<string, unknown> };

export function ok(body: Record<string, unknown>, status = 200): ApiResult {
  return { status, body };
}

export function fail(
  status: number,
  code: ErrorCode,
  error: string,
  extra: { help?: Help } & Record<string, unknown> = {},
): ApiResult {
  return { status, body: { error, code, help: null, ...extra } };
}

export function toResponse(result: ApiResult): Response {
  return Response.json(result.body, { status: result.status });
}

/** DB 접근 (Pool 또는 트랜잭션 중인 PoolClient). 테스트에서 롤백용 클라이언트를 넣을 수 있게 인자로 받는다 */
export type Db = {
  query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
};

/** 양의 정수 ID인지 (문자열 숫자도 허용: URL 경로 값) */
export function toId(v: unknown): number | null {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

/** 한국 시간 기준 오늘 날짜 (YYYY-MM-DD). DB 서버 시간대가 GMT라 CURRENT_DATE를 쓰지 않는다 */
export function todayKst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);
}

/** SQL에서 timestamptz → 한국 날짜 문자열 */
export const KST_DATE = (column: string) => `to_char(${column} AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD')`;
