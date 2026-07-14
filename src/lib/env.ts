// 환경변수 접근 + "키가 설정되어 있는가" 판별 헬퍼.
// 모든 외부 API 어댑터는 이 모듈을 통해서만 키를 읽는다 (설계서 2.2 원칙: 키는 서버에서만 보관).

// 재난안전데이터포털은 서비스(API)별로 키가 따로 발급된다.
// - SAFETYDATA_SERVICE10748_KEY: DSSP-IF-10748 재난문자(속보)
// - SAFETYDATA_SERVICE00247_KEY: DSSP-IF-00247 긴급재난문자
// - SAFETYDATA_SERVICE_KEY:      (레거시/공용) 위 키가 없을 때의 폴백 + 대피소 등 기타 서비스
const legacySafetydataKey = process.env.SAFETYDATA_SERVICE_KEY || "";

export const env = {
  kmaAuthKey: process.env.KMA_AUTH_KEY || "",
  safetydataService10748Key: process.env.SAFETYDATA_SERVICE10748_KEY || legacySafetydataKey,
  safetydataService00247Key: process.env.SAFETYDATA_SERVICE00247_KEY || legacySafetydataKey,
  safetydataServiceKey:
    legacySafetydataKey || process.env.SAFETYDATA_SERVICE00247_KEY || process.env.SAFETYDATA_SERVICE10748_KEY || "",
  kakaoRestApiKey: process.env.KAKAO_REST_API_KEY || "",
  kakaoJsKey: process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "",
  bizrouterBaseUrl: process.env.BIZROUTER_BASE_URL || "",
  bizrouterApiKey: process.env.BIZROUTER_API_KEY || "",
  bizrouterChatModel: process.env.BIZROUTER_CHAT_MODEL || "gpt-4o-mini",
  bizrouterEmbeddingModel: process.env.BIZROUTER_EMBEDDING_MODEL || "text-embedding-3-small",
  adminPassword: process.env.ADMIN_PASSWORD || "21002100",
  adminSessionSecret: process.env.ADMIN_SESSION_SECRET || "dev-only-insecure-secret-change-me",
};

export const hasKma = () => Boolean(env.kmaAuthKey);
export const hasSafetydata10748 = () => Boolean(env.safetydataService10748Key);
export const hasSafetydata00247 = () => Boolean(env.safetydataService00247Key);
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
  const safetydataMissing = [
    hasSafetydata10748() ? "" : "SAFETYDATA_SERVICE10748_KEY(재난문자 속보) 미설정",
    hasSafetydata00247() ? "" : "SAFETYDATA_SERVICE00247_KEY(긴급재난문자) 미설정",
    hasSafetydata() ? "" : "SAFETYDATA_SERVICE_KEY(대피소 등 공용) 미설정",
  ].filter(Boolean);

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
      configured: hasSafetydata10748() && hasSafetydata00247(),
      detail:
        safetydataMissing.length === 0
          ? "재난문자(속보)·긴급재난문자·공용 키 모두 설정됨"
          : safetydataMissing.join(" / "),
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
