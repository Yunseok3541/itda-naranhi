// 데모 세션: 로그인 없이 "브라우저 1개 = 가상 사용자 1명"
//
// - POST /api/demo/session 이 처음 호출되면 users 에 새 사용자를 만들고,
//   무작위 토큰을 HttpOnly 쿠키로 내려준다. DB(demo_sessions)에는 토큰의 SHA-256 해시만 저장한다.
// - 같은 브라우저가 다시 호출하면 같은 사용자를 그대로 쓴다.
// - 사용자별 API는 요청 본문의 userId를 믿지 않고 반드시 getDemoUserId()로 현재 사용자를 구한다.
//
// 사용 예 (Route Handler):
//   import { getDemoUserId, demoSessionRequired } from "@/lib/demo-session";
//   const userId = await getDemoUserId();
//   if (userId === null) return demoSessionRequired();   // 401
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const DEMO_SESSION_COOKIE = "naranhi_demo";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30일 (사용할 때마다 연장)
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // randomBytes(32)의 base64url

// 새 데모 사용자의 초기값. 체크인·시도·회고 같은 기록은 비어 있는 상태로 시작한다
const NEW_USER = { nickname: "데모 사용자", currentStage: 1, regionCode: "11440" } as const;

export type DemoSessionLookup =
  | { status: "ok"; userId: number }
  | { status: "none" } // 쿠키가 없거나, 형식이 틀리거나, DB에 없는 토큰
  | { status: "error" }; // DB 장애로 확인하지 못함

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 현재 요청의 데모 세션을 확인한다. DB 장애와 "세션 없음"을 구분해야 할 때 사용
 * (예: 체크인은 DB가 죽어도 위험 안내를 응답해야 하므로 error 와 none 을 다르게 처리).
 */
export async function lookupDemoSession(): Promise<DemoSessionLookup> {
  const token = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
  if (!token || !TOKEN_PATTERN.test(token)) return { status: "none" };
  try {
    const { rows } = await db.query<{ user_id: number }>(
      "UPDATE demo_sessions SET last_seen_at = now() WHERE token_hash = $1 RETURNING user_id",
      [hashToken(token)],
    );
    return rows[0] ? { status: "ok", userId: rows[0].user_id } : { status: "none" };
  } catch (error) {
    console.error("[demo-session] 세션 확인 실패", (error as { code?: string }).code ?? "unknown");
    return { status: "error" };
  }
}

/** 현재 데모 사용자 id. 세션이 없거나 확인할 수 없으면 null */
export async function getDemoUserId(): Promise<number | null> {
  const session = await lookupDemoSession();
  return session.status === "ok" ? session.userId : null;
}

/** 세션이 없을 때 사용자별 API가 돌려줄 401 응답 (extra 로 필드를 덧붙일 수 있음) */
export function demoSessionRequired(extra?: Record<string, unknown>): Response {
  return Response.json(
    {
      error: "데모 세션이 없어요. 데모 시작 화면에서 다시 시작해 주세요.",
      code: "DEMO_SESSION_REQUIRED",
      ...extra,
    },
    { status: 401 },
  );
}

/**
 * 데모 세션을 시작하거나 이어간다 (POST /api/demo/session 전용).
 * - 유효한 쿠키가 있으면 같은 사용자를 유지하고 쿠키 만료만 연장
 * - 없으면 새 사용자 + 새 세션을 만들고 쿠키를 설정
 * DB 장애면 예외를 던진다.
 */
export async function startDemoSession(options: { secure: boolean }): Promise<{ created: boolean }> {
  const cookieStore = await cookies();
  const cookieOptions = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: options.secure,
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };

  const existing = await lookupDemoSession();
  if (existing.status === "error") throw new Error("demo session lookup failed");
  if (existing.status === "ok") {
    const token = cookieStore.get(DEMO_SESSION_COOKIE)!.value;
    cookieStore.set(DEMO_SESSION_COOKIE, token, cookieOptions);
    return { created: false };
  }

  const token = randomBytes(32).toString("base64url");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>(
      "INSERT INTO users (nickname, current_stage, region_code) VALUES ($1, $2, $3) RETURNING id",
      [NEW_USER.nickname, NEW_USER.currentStage, NEW_USER.regionCode],
    );
    await client.query("INSERT INTO demo_sessions (token_hash, user_id) VALUES ($1, $2)", [
      hashToken(token),
      rows[0].id,
    ]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  cookieStore.set(DEMO_SESSION_COOKIE, token, cookieOptions);
  return { created: true };
}
