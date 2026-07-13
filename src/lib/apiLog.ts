// 인스턴스 내 임시 API 호출 로그 (DB 없음 — 서버리스 인스턴스 재시작 시 초기화됨을 관리자 화면에 명시)

export interface ApiLogEntry {
  id: string;
  timestamp: string;
  provider: "kma" | "safetydata" | "kakao" | "bizrouter";
  endpoint: string;
  ok: boolean;
  detail?: string;
  durationMs?: number;
}

const MAX_ENTRIES = 200;
// Next.js 개발 모드의 모듈 재평가를 피하기 위해 globalThis에 저장
const globalForLog = globalThis as unknown as { __apiLog?: ApiLogEntry[] };
const store: ApiLogEntry[] = globalForLog.__apiLog ?? (globalForLog.__apiLog = []);

export function logApiCall(entry: Omit<ApiLogEntry, "id" | "timestamp">) {
  store.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
  if (store.length > MAX_ENTRIES) store.length = MAX_ENTRIES;
}

export function getApiLog(): ApiLogEntry[] {
  return store;
}
