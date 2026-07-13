// 환경변수 접근 + "키가 설정되어 있는가" 판별 헬퍼.
// 모든 외부 API 어댑터는 이 모듈을 통해서만 키를 읽는다 (설계서 2.2 원칙: 키는 서버에서만 보관).

export const env = {
  kmaAuthKey: process.env.KMA_AUTH_KEY || "",
  safetydataServiceKey: process.env.SAFETYDATA_SERVICE_KEY || "",
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY || "",
  kakaoJsKey: process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "",
  bizrouterBaseUrl: process.env.BIZROUTER_BASE_URL || "",
  bizrouterApiKey: process.env.BIZROUTER_API_KEY || "",
  bizrouterChatModel: process.env.BIZROUTER_CHAT_MODEL || "gpt-4o-mini",
  bizrouterEmbeddingModel: process.env.BIZROUTER_EMBEDDING_MODEL || "text-embedding-3-small",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || "dev-only-insecure-secret-change-me",
};

export const hasKma = () => Boolean(env.kmaAuthKey);
export const hasSafetydata = () => Boolean(env.safetydataServiceKey);
export const hasKakaoRest = () => Boolean(env.kakaoRestApiKey);
export const hasKakaoJs = () => Boolean(env.kakaoJsKey);
export const hasBizrouter = () => Boolean(env.bizrouterBaseUrl && env.bizrouterApiKey);
export const hasAdminPassword = () => Boolean(env.adminPassword);

export interface ProviderStatus {
  provider: "kma" | "safetydata" | "kakao" | "bizrouter";
  label: string;
  configured: boolean;
  detail: string;
}

export function providerStatuses(): ProviderStatus[] {
  return [
    {
      provider: "kma",
      label: "기상청 API 허브",
      configured: hasKma(),
      detail: hasKma() ? "KMA_AUTH_KEY 설정됨" : "KMA_AUTH_KEY 미설정 — 날씨/특보 데이터를 가져올 수 없습니다",
    },
    {
      provider: "safetydata",
      label: "재난안전데이터포털",
      configured: hasSafetydata(),
      detail: hasSafetydata()
        ? "SAFETYDATA_SERVICE_KEY 설정됨"
        : "SAFETYDATA_SERVICE_KEY 미설정 — 재난문자/대피소 데이터를 가져올 수 없습니다",
    },
    {
      provider: "kakao",
      label: "카카오맵",
      configured: hasKakaoRest() && hasKakaoJs(),
      detail:
        hasKakaoRest() && hasKakaoJs()
          ? "REST/JS 키 모두 설정됨"
          : `${hasKakaoJs() ? "" : "NEXT_PUBLIC_KAKAO_JS_KEY 미설정(지도 렌더링 불가) "}${
              hasKakaoRest() ? "" : "KAKAO_REST_API_KEY 미설정(병원·약국 검색/좌표변환 불가)"
            }`.trim(),
    },
    {
      provider: "bizrouter",
      label: "bizrouter (LLM)",
      configured: hasBizrouter(),
      detail: hasBizrouter()
        ? "BIZROUTER_BASE_URL / BIZROUTER_API_KEY 설정됨"
        : "미설정 — 규칙기반/키워드 검색으로 자동 대체됩니다",
    },
  ];
}
