import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe("관리자 고정 접근코드", () => {
  it("21002100만 허용한다", async () => {
    const { ADMIN_ACCESS_CODE, checkAdminPassword } = await import("./adminAuth");
    expect(ADMIN_ACCESS_CODE).toBe("21002100");
    expect(checkAdminPassword("21002100")).toBe(true);
    expect(checkAdminPassword("21002101")).toBe(false);
    expect(checkAdminPassword("")).toBe(false);
  });

  it("정상 서명 쿠키만 유효기간 동안 허용한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T00:00:00Z"));
    const { createSessionToken, verifySessionToken } = await import("./adminAuth");
    const token = createSessionToken();

    expect(verifySessionToken(token)).toBe(true);
    expect(verifySessionToken(`${token}tampered`)).toBe(false);
    vi.advanceTimersByTime(12 * 60 * 60 * 1000 + 1);
    expect(verifySessionToken(token)).toBe(false);
  });
});
