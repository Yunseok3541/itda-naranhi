// 신청 도우미 대화 이어 보기 (고민기록 #44)
// - 브라우저 탭의 sessionStorage에만, 정책별로 저장 → 창을 실수로 닫아도 다시 열면 이어짐. 탭을 닫으면 브라우저가 지움
// - 서버·DB에는 저장하지 않음 (대화에 민감한 마음이 담길 수 있음). [대화 지우기]로 바로 지울 수 있음
// - 저장소를 못 쓰는 환경(사생활 보호 모드·차단)이나 망가진 값이어도 화면은 새 대화로 정상 동작
// 화면(apply-helper.tsx)이 쓰고, scripts/verify-helper-store.mts가 가짜 저장소로 검증한다

/** 저장하는 대화 (화면 상태 그대로가 아니라 필요한 것만) */
export type StoredChat<M, T> = { v: 1; savedAt: number; messages: M[]; chatLog: T[]; lastQuestion: string };

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;

/** 오래 쌓이지 않게: 말풍선 40개, 대화 기록 40줄까지 (보낼 때는 화면이 최근 20줄만) */
export const MAX_MESSAGES = 40;
export const MAX_LOG = 40;
/** 탭을 오래 열어 둔 채 두면 6시간 뒤에는 새로 시작 */
export const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const chatKey = (mode: string, policyId: number) => `naranhi-helper-chat:${mode}:${policyId}`;

/** 기본은 브라우저 탭 저장소. 접근 자체가 막히면 null (화면은 저장 없이 동작) */
export function tabStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadChat<M, T>(key: string, store: Storage | null = tabStorage(), now = Date.now()): StoredChat<M, T> | null {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredChat<M, T>>;
    const ok = v && v.v === 1 && typeof v.savedAt === "number" && Array.isArray(v.messages) && Array.isArray(v.chatLog) && typeof v.lastQuestion === "string";
    if (!ok || now - v.savedAt! > MAX_AGE_MS) {
      store.removeItem(key);
      return null;
    }
    return v as StoredChat<M, T>;
  } catch {
    // 망가진 값이면 지우고 새로 (지우기도 실패하면 그냥 새로)
    try { store.removeItem(key); } catch { /* 무시 */ }
    return null;
  }
}

/** 저장 실패(용량 초과 등)는 조용히 넘긴다 → 대화는 화면에서 계속됨. 저장했으면 true */
export function saveChat<M, T>(key: string, data: { messages: M[]; chatLog: T[]; lastQuestion: string }, store: Storage | null = tabStorage(), now = Date.now()): boolean {
  if (!store) return false;
  if (!data.messages.length) { clearChat(key, store); return true; }
  const value: StoredChat<M, T> = {
    v: 1, savedAt: now,
    messages: data.messages.slice(-MAX_MESSAGES), chatLog: data.chatLog.slice(-MAX_LOG), lastQuestion: data.lastQuestion.slice(0, 200),
  };
  try {
    store.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearChat(key: string, store: Storage | null = tabStorage()) {
  try { store?.removeItem(key); } catch { /* 무시 */ }
}
