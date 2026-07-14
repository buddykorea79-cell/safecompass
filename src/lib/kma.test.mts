import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_AUTH_KEY = process.env.KMA_AUTH_KEY;
const ORIGINAL_SERVICE_KEY = process.env.KMA_SERVICE_KEY;
const GRID_NX = 149;
const GRID_NY = 253;
const GRID_SIZE = GRID_NX * GRID_NY;
const SEOUL_INDEX = (127 - 1) * GRID_NX + (60 - 1);

function restore(name: "KMA_AUTH_KEY" | "KMA_SERVICE_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function grid(valueAtSeoul = 0): string {
  const values = Array<number>(GRID_SIZE).fill(0);
  values[SEOUL_INDEX] = valueAtSeoul;
  return values.join(",");
}

afterEach(() => {
  restore("KMA_AUTH_KEY", ORIGINAL_AUTH_KEY);
  restore("KMA_SERVICE_KEY", ORIGINAL_SERVICE_KEY);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KMA API허브 단기예보 격자자료", () => {
  it("149×253 좌하단 기준 배열에서 지정 격자값을 선택하고 결측값을 제거한다", async () => {
    const { parseShortForecastGrid, shortForecastGridValue } = await import("./kma");
    const values = parseShortForecastGrid(grid(27.5));

    expect(values).toHaveLength(GRID_SIZE);
    expect(shortForecastGridValue(values, 60, 127, "TMP")).toBe(27.5);
    values[SEOUL_INDEX] = -99;
    expect(shortForecastGridValue(values, 60, 127, "TMP")).toBeNull();
    values[SEOUL_INDEX] = -50;
    expect(shortForecastGridValue(values, 60, 127, "TMP")).toBeNull();
    expect(() => shortForecastGridValue(values, 150, 127, "TMP")).toThrow("격자 범위");
  });

  it("격자 개수가 정확하지 않거나 숫자가 아니면 거부한다", async () => {
    const { parseShortForecastGrid } = await import("./kma");
    expect(() => parseShortForecastGrid("1,2,3")).toThrow("37697");
    const values = Array<string>(GRID_SIZE).fill("0");
    values[10] = "invalid";
    expect(() => parseShortForecastGrid(values.join(","))).toThrow("숫자가 아닌 값");
  });

  it("발표 15분 유예와 다음 정시 발효시각을 KST 기준으로 계산한다", async () => {
    const { nearestForecastEffect, shortForecastBase } = await import("./kma");
    expect(shortForecastBase(new Date(2026, 6, 14, 14, 5))).toBe("2026071411");
    expect(shortForecastBase(new Date(2026, 6, 14, 14, 20))).toBe("2026071414");
    expect(shortForecastBase(new Date(2026, 6, 14, 1, 30))).toBe("2026071323");
    expect(nearestForecastEffect(new Date(2026, 6, 14, 23, 31))).toBe("2026071500");
  });

  it("KMA_AUTH_KEY만 authKey로 보내고 typ01 단기예보 격자자료만 사용한다", async () => {
    process.env.KMA_AUTH_KEY = "api-hub-secret";
    process.env.KMA_SERVICE_KEY = "must-not-be-used";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T05:20:00Z")); // KST 14:20
    const values: Record<string, number> = {
      TMP: 28,
      SKY: 3,
      PTY: 0,
      POP: 40,
      PCP: 0,
      REH: 65,
      WSD: 2.5,
      TMN: 21,
      TMX: 32,
    };
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe(
        "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_shrt_grd"
      );
      expect(url.searchParams.get("authKey")).toBe("api-hub-secret");
      expect(url.searchParams.has("serviceKey")).toBe(false);
      expect(url.searchParams.has("nx")).toBe(false);
      expect(url.searchParams.has("base_date")).toBe(false);
      expect(url.searchParams.get("tmfc")).toMatch(/^202607\d{4}$/);
      expect(url.searchParams.get("tmef")).toMatch(/^202607\d{4}$/);
      const variable = url.searchParams.get("vars")!;
      return new Response(grid(values[variable]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({
      fallback: false,
      provider: "KMA_APIHUB",
      temp: 28,
      sky: "cloudy",
      precipProbability: 40,
      humidity: 65,
      windSpeed: 2.5,
      tmn: 21,
      tmx: 32,
      observationBaseDate: null,
      forecastBaseDate: "20260714",
      forecastBaseTime: "1400",
    });
    expect(fetchMock).toHaveBeenCalledTimes(9);
  });

  it("일부 변수 호출이 실패해도 TMP가 있으면 단기예보를 부분 제공한다", async () => {
    process.env.KMA_AUTH_KEY = "api-hub-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T05:20:00Z"));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const variable = new URL(String(input)).searchParams.get("vars");
      if (variable === "WSD") return new Response("temporary failure", { status: 503 });
      return new Response(grid(variable === "TMP" ? 27 : variable === "TMN" ? 20 : variable === "TMX" ? 31 : 0));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({ fallback: false, temp: 27, windSpeed: null });
    expect(result.message).toContain("일부 단기예보 요소 조회 실패");
  });

  it("공공데이터포털 키만 있으면 호출하지 않고 APIHub 키 미설정으로 처리한다", async () => {
    delete process.env.KMA_AUTH_KEY;
    process.env.KMA_SERVICE_KEY = "public-data-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result.fallback).toBe(true);
    expect(result.message).toContain("KMA_AUTH_KEY 미설정");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("APIHub 오류 메시지와 URL에서 인증키를 숨긴다", async () => {
    const secret = "api-hub-secret";
    process.env.KMA_AUTH_KEY = secret;
    const fetchMock = vi.fn(async () =>
      new Response(`Unauthorized https://apihub.kma.go.kr/example?authKey=${secret}`, { status: 401 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result.fallback).toBe(true);
    expect(result.message).not.toContain(secret);
    expect(result.message).not.toMatch(/[?&]authKey=[^\s]+/);
  });
});
