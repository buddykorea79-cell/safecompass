// 환경변수 접근 + "키가 설정되어 있는가" 판별 헬퍼.
// 모든 외부 API 어댑터는 이 모듈을 통해서만 키를 읽는다 (설계서 2.2 원칙: 키는 서버에서만 보관).

// 환경변수 값 정리:
// - 복사/붙여넣기 과정에서 섞이는 앞뒤 공백·개행은 인증 403의 흔한 원인이라 항상 제거한다.
// - 포털이 "URL 인코딩된 키"(%2B, %3D 포함)를 제공하는 경우가 있는데, 이 값을 그대로 넣으면
//   요청 시 이중 인코딩되어 인증에 실패하므로 원본으로 복원해 보관한다.
function cleanKey(raw: string | undefined): string {
  const key = (raw ?? "").trim();
  if (/%[0-9A-Fa-f]{2}/.test(key)) {
    try {
      return decodeURIComponent(key);
    } catch {
      return key;
    }
  }
  return key;
}

// 재난안전데이터공유플랫폼은 활용 신청한 서비스별 키를 서로 교차 사용하지 않는다.
// - SAFETYDATA_SERVICE10748_KEY: DSSP-IF-10748 재난문자(속보)
// - SAFETYDATA_SERVICE00247_KEY: DSSP-IF-00247 긴급재난문자
// - SAFETYDATA_SERVICE10941_KEY: DSSP-IF-10941 통합대피소

export const env = {
  kmaApiHubAuthKey: cleanKey(process.env.KMA_AUTH_KEY),
  safetydataService10748Key: cleanKey(process.env.SAFETYDATA_SERVICE10748_KEY),
  safetydataService00247Key: cleanKey(process.env.SAFETYDATA_SERVICE00247_KEY),
  safetydataService10941Key: cleanKey(process.env.SAFETYDATA_SERVICE10941_KEY),
  blobReadWriteToken: cleanKey(process.env.BLOB_READ_WRITE_TOKEN),
  kakaoRestApiKey: cleanKey(process.env.KAKAO_REST_API_KEY),
  kakaoJsKey: (process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "").trim(),
  bizrouterBaseUrl: (process.env.BIZROUTER_BASE_URL ?? "").trim(),
  bizrouterApiKey: (process.env.BIZROUTER_API_KEY ?? "").trim(),
  bizrouterChatModel: process.env.BIZROUTER_CHAT_MODEL || "gpt-4o-mini",
  bizrouterEmbeddingModel: process.env.BIZROUTER_EMBEDDING_MODEL || "text-embedding-3-small",
};

export const hasKmaApiHub = () => Boolean(env.kmaApiHubAuthKey);
export const hasKma = () => hasKmaApiHub();
export const hasSafetydata10748 = () => Boolean(env.safetydataService10748Key);
export const hasSafetydata00247 = () => Boolean(env.safetydataService00247Key);
export const hasSafetydata10941 = () => Boolean(env.safetydataService10941Key);
export const hasShelterSnapshotStorage = () =>
  Boolean(env.blobReadWriteToken) || process.env.NODE_ENV !== "production";
export const hasKakaoRest = () => Boolean(env.kakaoRestApiKey);
export const hasKakaoJs = () => Boolean(env.kakaoJsKey);
export const hasBizrouter = () => Boolean(env.bizrouterBaseUrl && env.bizrouterApiKey);

export interface ProviderStatus {
  provider: "kma" | "safetydata" | "kakao" | "bizrouter";
  label: string;
  configured: boolean;
  detail: string;
}

export function providerStatuses(): ProviderStatus[] {
  const kmaDetail = hasKmaApiHub()
    ? "KMA_AUTH_KEY 설정됨 · API허브 단기예보 격자자료/기상특보 전용"
    : "KMA_AUTH_KEY 미설정 — API허브 단기예보/특보 데이터를 가져올 수 없습니다";
  const safetydataMissing = [
    hasSafetydata10748() ? "" : "SAFETYDATA_SERVICE10748_KEY(재난문자 속보) 미설정",
    hasSafetydata00247() ? "" : "SAFETYDATA_SERVICE00247_KEY(긴급재난문자) 미설정",
    hasSafetydata10941() ? "" : "SAFETYDATA_SERVICE10941_KEY(통합대피소 DSSP-IF-10941) 미설정",
    hasShelterSnapshotStorage() ? "" : "BLOB_READ_WRITE_TOKEN(통합대피소 JSON 저장소) 미설정",
  ].filter(Boolean);

  return [
    {
      provider: "kma",
      label: "기상청 날씨 API",
      configured: hasKma(),
      detail: kmaDetail,
    },
    {
      provider: "safetydata",
      label: "재난안전데이터공유플랫폼",
      configured: hasSafetydata10941() && hasShelterSnapshotStorage(),
      detail:
        safetydataMissing.length === 0
          ? "재난문자 2종·통합대피소 전용 키·JSON 저장소 모두 설정됨"
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
