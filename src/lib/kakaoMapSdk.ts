export type KakaoMapSdkErrorCode =
  | "MISSING_JAVASCRIPT_KEY"
  | "INVALID_JAVASCRIPT_KEY"
  | "CONFLICTING_SDK"
  | "SDK_REQUEST_FAILED"
  | "SDK_BOOTSTRAP_INVALID"
  | "MAP_CORE_REQUEST_FAILED"
  | "MAP_CORE_TIMEOUT"
  | "MAP_CORE_INVALID"
  | "MAP_CREATE_FAILED";

export class KakaoMapSdkError extends Error {
  readonly code: KakaoMapSdkErrorCode;

  constructor(code: KakaoMapSdkErrorCode, message: string) {
    super(message);
    this.name = "KakaoMapSdkError";
    this.code = code;
  }
}

export interface KakaoMapErrorView {
  code: KakaoMapSdkErrorCode;
  summary: string;
  checks: string[];
}

type KakaoMapsApi = {
  Map?: unknown;
  load?: (callback: () => void) => void;
};

type KakaoSdkWindow = Window & {
  kakao?: { maps?: KakaoMapsApi };
  daum?: { maps?: KakaoMapsApi };
  __safecompassKakaoMapSdkPromise?: Promise<void>;
};

const SDK_SCRIPT_ID = "safecompass-kakao-map-sdk";
const SDK_HOST = "dapi.kakao.com";
const SDK_PATH = "/v2/maps/sdk.js";
const CORE_HOSTS = new Set(["t1.daumcdn.net", "t1.kakaocdn.net"]);
const DEFAULT_TIMEOUT_MS = 20_000;

export function validateKakaoJavascriptKey(rawKey: string): KakaoMapSdkError | null {
  const key = rawKey.trim();
  if (!key) {
    return new KakaoMapSdkError(
      "MISSING_JAVASCRIPT_KEY",
      "NEXT_PUBLIC_KAKAO_JS_KEY가 설정되지 않았습니다."
    );
  }
  if (
    /\s/.test(key) ||
    /^KakaoAK\s+/i.test(key) ||
    /^(?:javascript[_ -]?key|your[_ -]?key|app[_ -]?key)$/i.test(key) ||
    /[{}'"<>]/.test(key)
  ) {
    return new KakaoMapSdkError(
      "INVALID_JAVASCRIPT_KEY",
      "NEXT_PUBLIC_KAKAO_JS_KEY에는 접두사·따옴표 없이 JavaScript 키 값만 입력해야 합니다."
    );
  }
  return null;
}

export function kakaoMapErrorView(
  cause: unknown,
  origin = typeof window === "undefined" ? "현재 사이트" : window.location.origin
): KakaoMapErrorView {
  const error =
    cause instanceof KakaoMapSdkError
      ? cause
      : new KakaoMapSdkError("MAP_CORE_INVALID", "카카오맵 초기화 중 오류가 발생했습니다.");

  switch (error.code) {
    case "MISSING_JAVASCRIPT_KEY":
    case "INVALID_JAVASCRIPT_KEY":
      return {
        code: error.code,
        summary: error.message,
        checks: [
          "Vercel에 카카오 JavaScript 키를 등록한 뒤 새로 배포해 주세요.",
          "REST API 키나 'KakaoAK '가 붙은 값을 사용하면 안 됩니다.",
        ],
      };
    case "CONFLICTING_SDK":
      return {
        code: error.code,
        summary: "페이지에 서로 다른 설정의 카카오맵 SDK가 중복되어 있습니다.",
        checks: ["기존 SDK 태그를 제거하고 페이지를 완전히 새로고침해 주세요."],
      };
    case "SDK_REQUEST_FAILED":
      return {
        code: error.code,
        summary: "카카오맵 SDK 요청이 인증 거부되었거나 브라우저에서 차단되었습니다.",
        checks: [
          `${origin}을 JavaScript 키의 'JavaScript SDK 도메인'에 정확히 등록해 주세요.`,
          "JavaScript 키 사용 여부와 카카오맵 사용 설정이 ON인지 확인해 주세요.",
          "개발자 도구에서 sdk.js가 401이면 키·도메인 설정, 차단됨이면 확장 프로그램·방화벽을 확인해 주세요.",
        ],
      };
    case "SDK_BOOTSTRAP_INVALID":
      return {
        code: error.code,
        summary: "카카오 SDK 시작 파일은 받았지만 지도 초기화 함수를 찾지 못했습니다.",
        checks: ["SDK를 가로채는 캐시·프록시·브라우저 확장 프로그램을 끄고 다시 시도해 주세요."],
      };
    case "MAP_CORE_REQUEST_FAILED":
      return {
        code: error.code,
        summary: "카카오 SDK 시작 파일은 정상이나 지도 본체 파일을 받지 못했습니다.",
        checks: [
          "t1.daumcdn.net 또는 t1.kakaocdn.net 요청을 차단하는 광고 차단기·방화벽을 확인해 주세요.",
          "사내 보안망이라면 dapi.kakao.com과 카카오 지도 CDN을 허용해 주세요.",
        ],
      };
    case "MAP_CORE_TIMEOUT":
      return {
        code: error.code,
        summary: "카카오맵 지도 본체 초기화 시간이 초과되었습니다.",
        checks: [
          `${origin}을 JavaScript 키의 'JavaScript SDK 도메인'에 정확히 등록해 주세요.`,
          "JavaScript 키를 사용했는지와 카카오맵 사용 설정이 ON인지 확인해 주세요.",
          "네트워크에서 t1.daumcdn.net 지도 스크립트가 성공했는지 확인해 주세요.",
          "일시적인 네트워크 문제라면 잠시 후 다시 시도해 주세요.",
        ],
      };
    case "MAP_CREATE_FAILED":
      return {
        code: error.code,
        summary: "카카오맵 SDK는 준비됐지만 지도 화면을 만들지 못했습니다.",
        checks: ["페이지를 새로고침한 뒤에도 반복되면 브라우저 콘솔 오류를 확인해 주세요."],
      };
    case "MAP_CORE_INVALID":
    default:
      return {
        code: error.code,
        summary: error.message,
        checks: ["페이지를 완전히 새로고침한 뒤 다시 시도해 주세요."],
      };
  }
}

function isSdkScript(script: HTMLScriptElement): boolean {
  try {
    const url = new URL(script.src, window.location.href);
    return url.hostname === SDK_HOST && url.pathname === SDK_PATH;
  } catch {
    return false;
  }
}

function isCoreScript(script: HTMLScriptElement): boolean {
  try {
    const url = new URL(script.src, window.location.href);
    return CORE_HOSTS.has(url.hostname) && /\/mapjsapi\/js\/main\//.test(url.pathname);
  } catch {
    return false;
  }
}

function findSdkScript(): HTMLScriptElement | null {
  const byId = document.getElementById(SDK_SCRIPT_ID);
  if (byId instanceof HTMLScriptElement) return byId;
  return Array.from(document.scripts).find(isSdkScript) ?? null;
}

function findCoreScript(): HTMLScriptElement | null {
  return Array.from(document.scripts).find(isCoreScript) ?? null;
}

function mapApiReady(sdkWindow: KakaoSdkWindow): boolean {
  return typeof sdkWindow.kakao?.maps?.Map === "function";
}

function sdkKeyMatches(script: HTMLScriptElement, key: string): boolean {
  try {
    return new URL(script.src, window.location.href).searchParams.get("appkey") === key;
  } catch {
    return false;
  }
}

/**
 * 카카오 지도 SDK를 앱 전체에서 한 번만 비동기로 불러온다.
 *
 * 카카오가 반환하는 sdk.js는 지도 구현 본체가 아니라 bootstrap이다. bootstrap이
 * `kakao.maps.load()`를 통해 CDN의 지도 본체를 추가로 받으므로 두 요청을 별도로 추적한다.
 */
export function loadKakaoMapSdk(rawKey: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new KakaoMapSdkError("MAP_CORE_INVALID", "브라우저에서만 지도를 불러올 수 있습니다.")
    );
  }

  const key = rawKey.trim();
  const keyError = validateKakaoJavascriptKey(key);
  if (keyError) return Promise.reject(keyError);

  const sdkWindow = window as KakaoSdkWindow;
  if (mapApiReady(sdkWindow)) return Promise.resolve();
  if (sdkWindow.__safecompassKakaoMapSdkPromise) {
    return sdkWindow.__safecompassKakaoMapSdkPromise;
  }

  const attempt = new Promise<void>((resolve, reject) => {
    let settled = false;
    let coreStarted = false;
    let timeoutId: number | undefined;
    let coreObserver: MutationObserver | null = null;
    let sdkScript = findSdkScript();
    let coreScript: HTMLScriptElement | null = null;

    if (sdkScript?.dataset.safecompassLoadState === "error") {
      const staleMaps = sdkWindow.kakao?.maps;
      sdkScript.remove();
      sdkScript = null;
      if (staleMaps && !mapApiReady(sdkWindow)) {
        if (sdkWindow.kakao) delete sdkWindow.kakao.maps;
        const daum = sdkWindow.daum;
        if (daum && daum.maps === staleMaps) delete daum.maps;
      }
      for (const candidate of Array.from(document.scripts)) {
        if (isCoreScript(candidate) && candidate.dataset.safecompassLoadState === "error") {
          candidate.remove();
        }
      }
    }

    if (sdkScript && !sdkKeyMatches(sdkScript, key)) {
      reject(
        new KakaoMapSdkError(
          "CONFLICTING_SDK",
          "다른 JavaScript 키로 생성된 카카오맵 SDK 태그가 이미 존재합니다."
        )
      );
      return;
    }

    const cleanup = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      coreObserver?.disconnect();
      sdkScript?.removeEventListener("load", handleSdkLoad);
      sdkScript?.removeEventListener("error", handleSdkError);
      coreScript?.removeEventListener("error", handleCoreError);
    };

    const fail = (error: KakaoMapSdkError) => {
      if (settled) return;
      settled = true;
      if (sdkScript) sdkScript.dataset.safecompassLoadState = "error";
      if (coreScript) coreScript.dataset.safecompassLoadState = "error";
      cleanup();
      reject(error);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      if (sdkScript) sdkScript.dataset.safecompassLoadState = "ready";
      cleanup();
      resolve();
    };

    function handleSdkError() {
      fail(
        new KakaoMapSdkError(
          "SDK_REQUEST_FAILED",
          "카카오맵 SDK 요청이 인증 거부되었거나 차단되었습니다."
        )
      );
    }

    function handleCoreError() {
      fail(
        new KakaoMapSdkError(
          "MAP_CORE_REQUEST_FAILED",
          "카카오맵 지도 본체 스크립트 요청에 실패했습니다."
        )
      );
    }

    const watchCoreScript = () => {
      const attach = (candidate: HTMLScriptElement) => {
        if (coreScript || !isCoreScript(candidate)) return;
        coreScript = candidate;
        coreScript.addEventListener("error", handleCoreError, { once: true });
      };

      const existing = findCoreScript();
      if (existing) attach(existing);
      if (coreScript) return;

      coreObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof HTMLScriptElement) attach(node);
          }
        }
      });
      coreObserver.observe(document.head, { childList: true });
    };

    const initializeMapCore = () => {
      if (settled || coreStarted) return;
      if (mapApiReady(sdkWindow)) {
        succeed();
        return;
      }

      const load = sdkWindow.kakao?.maps?.load;
      if (typeof load !== "function") {
        fail(
          new KakaoMapSdkError(
            "SDK_BOOTSTRAP_INVALID",
            "카카오맵 SDK에서 초기화 함수를 찾지 못했습니다."
          )
        );
        return;
      }

      coreStarted = true;
      watchCoreScript();
      try {
        load(() => {
          if (mapApiReady(sdkWindow)) {
            succeed();
          } else {
            fail(
              new KakaoMapSdkError(
                "MAP_CORE_INVALID",
                "카카오맵 지도 본체가 올바르게 초기화되지 않았습니다."
              )
            );
          }
        });
        // maps.load()가 같은 호출 스택에서 본체 태그를 추가하므로 한 번 더 확인한다.
        const insertedCore = findCoreScript();
        if (insertedCore && !coreScript) {
          coreScript = insertedCore;
          coreScript.addEventListener("error", handleCoreError, { once: true });
        }
      } catch {
        fail(
          new KakaoMapSdkError(
            "MAP_CORE_INVALID",
            "카카오맵 지도 본체 초기화 중 오류가 발생했습니다."
          )
        );
      }
    };

    function handleSdkLoad() {
      if (sdkScript) sdkScript.dataset.safecompassLoadState = "bootstrap-ready";
      initializeMapCore();
    }

    timeoutId = window.setTimeout(() => {
      fail(
        new KakaoMapSdkError(
          coreStarted ? "MAP_CORE_TIMEOUT" : "SDK_REQUEST_FAILED",
          coreStarted
            ? "카카오맵 지도 본체 초기화 시간이 초과되었습니다."
            : "카카오맵 SDK 요청 시간이 초과되었습니다."
        )
      );
    }, timeoutMs);

    if (sdkScript) {
      sdkScript.addEventListener("load", handleSdkLoad, { once: true });
      sdkScript.addEventListener("error", handleSdkError, { once: true });
      if (typeof sdkWindow.kakao?.maps?.load === "function") initializeMapCore();
      return;
    }

    if (typeof sdkWindow.kakao?.maps?.load === "function") {
      initializeMapCore();
      return;
    }

    sdkScript = document.createElement("script");
    sdkScript.id = SDK_SCRIPT_ID;
    sdkScript.src = `https://${SDK_HOST}${SDK_PATH}?appkey=${encodeURIComponent(
      key
    )}&autoload=false`;
    sdkScript.async = true;
    sdkScript.dataset.safecompassLoadState = "loading";
    sdkScript.addEventListener("load", handleSdkLoad, { once: true });
    sdkScript.addEventListener("error", handleSdkError, { once: true });
    document.head.appendChild(sdkScript);
  });

  sdkWindow.__safecompassKakaoMapSdkPromise = attempt.catch((error: unknown) => {
    delete sdkWindow.__safecompassKakaoMapSdkPromise;
    throw error;
  });
  return sdkWindow.__safecompassKakaoMapSdkPromise;
}

export function kakaoMapCreateError(): KakaoMapSdkError {
  return new KakaoMapSdkError("MAP_CREATE_FAILED", "카카오맵 화면을 만들지 못했습니다.");
}
