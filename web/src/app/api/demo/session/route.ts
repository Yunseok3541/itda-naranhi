// 데모 시작: 브라우저마다 가상 사용자 1명을 만들거나 이어간다
// 데모 시작 화면에서 한 번 호출하면, 이후 같은 출처의 fetch('/api/...') 요청에 세션 쿠키가 자동으로 따라간다.
import { startDemoSession } from "@/lib/demo-session";

export async function POST(request: Request) {
  // Vercel(HTTPS)에서는 Secure 쿠키, 로컬 http://localhost 에서는 일반 쿠키
  const secure =
    new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

  try {
    await startDemoSession({ secure });
    return Response.json({ ready: true });
  } catch (error) {
    console.error("[demo/session] 시작 실패", (error as { code?: string }).code ?? "unknown");
    return Response.json(
      { ready: false, error: "지금은 데모를 시작할 수 없어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}
