import { describe, expect, it } from "vitest";
import {
  KakaoMapSdkError,
  kakaoMapErrorView,
  validateKakaoJavascriptKey,
} from "./kakaoMapSdk";

describe("카카오맵 SDK 진단", () => {
  it("빈 JavaScript 키를 배포 설정 오류로 분류한다", () => {
    expect(validateKakaoJavascriptKey("  ")?.code).toBe("MISSING_JAVASCRIPT_KEY");
  });

  it("Authorization 접두사나 따옴표가 섞인 키를 거부한다", () => {
    expect(validateKakaoJavascriptKey("KakaoAK abc")?.code).toBe("INVALID_JAVASCRIPT_KEY");
    expect(validateKakaoJavascriptKey('"abc123"')?.code).toBe("INVALID_JAVASCRIPT_KEY");
  });

  it("키 값 자체는 로그나 오류 객체에 포함하지 않는다", () => {
    const secret = "0123456789abcdef0123456789abcdef";
    expect(validateKakaoJavascriptKey(secret)).toBeNull();
    expect(JSON.stringify(kakaoMapErrorView(new KakaoMapSdkError("SDK_REQUEST_FAILED", secret))))
      .not.toContain(secret);
  });

  it("첫 SDK 요청 실패에는 현재 출처와 최신 설정 경로를 안내한다", () => {
    const view = kakaoMapErrorView(
      new KakaoMapSdkError("SDK_REQUEST_FAILED", "failed"),
      "https://safecompass.vercel.app"
    );

    expect(view.code).toBe("SDK_REQUEST_FAILED");
    expect(view.checks.join(" ")).toContain("https://safecompass.vercel.app");
    expect(view.checks.join(" ")).toContain("JavaScript SDK 도메인");
    expect(view.checks.join(" ")).toContain("401");
  });

  it("bootstrap 이후 지도 본체 실패를 별도 CDN 오류로 안내한다", () => {
    const view = kakaoMapErrorView(
      new KakaoMapSdkError("MAP_CORE_REQUEST_FAILED", "failed")
    );

    expect(view.summary).toContain("지도 본체");
    expect(view.checks.join(" ")).toContain("t1.daumcdn.net");
  });

  it("지도 본체 시간초과에도 도메인·키 종류·사용 설정을 함께 안내한다", () => {
    const view = kakaoMapErrorView(
      new KakaoMapSdkError("MAP_CORE_TIMEOUT", "timeout"),
      "http://localhost:3000"
    );

    expect(view.checks.join(" ")).toContain("http://localhost:3000");
    expect(view.checks.join(" ")).toContain("JavaScript 키");
    expect(view.checks.join(" ")).toContain("카카오맵 사용 설정");
    expect(view.checks.join(" ")).toContain("t1.daumcdn.net");
  });

  it("지도 생성 실패를 SDK 네트워크 실패와 구분한다", () => {
    const view = kakaoMapErrorView(new KakaoMapSdkError("MAP_CREATE_FAILED", "failed"));
    expect(view.code).toBe("MAP_CREATE_FAILED");
    expect(view.summary).toContain("지도 화면");
  });
});
