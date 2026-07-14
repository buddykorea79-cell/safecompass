import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_APIHUB_KEY = process.env.KMA_AUTH_KEY;
const ORIGINAL_SERVICE_KEY = process.env.KMA_SERVICE_KEY;

function setKmaKeys(apiHubKey?: string, serviceKey?: string) {
  if (apiHubKey === undefined) delete process.env.KMA_AUTH_KEY;
  else process.env.KMA_AUTH_KEY = apiHubKey;
  if (serviceKey === undefined) delete process.env.KMA_SERVICE_KEY;
  else process.env.KMA_SERVICE_KEY = serviceKey;
}

function restoreEnv(name: "KMA_AUTH_KEY" | "KMA_SERVICE_KEY", value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function successPayload(endpoint: string) {
  const item =
    endpoint === "getUltraSrtNcst"
      ? [
          { category: "T1H", obsrValue: "24" },
          { category: "REH", obsrValue: "70" },
          { category: "WSD", obsrValue: "1" },
          { category: "PTY", obsrValue: "0" },
        ]
      : [
          {
            category: "TMP",
            fcstDate: "20990101",
            fcstTime: "0000",
            fcstValue: "25",
          },
        ];
  return JSON.stringify({
    response: {
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: { items: { item } },
    },
  });
}

afterEach(() => {
  restoreEnv("KMA_AUTH_KEY", ORIGINAL_APIHUB_KEY);
  restoreEnv("KMA_SERVICE_KEY", ORIGINAL_SERVICE_KEY);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("KMA 날씨 공급자 인증", () => {
  it("API허브 키만 있으면 API허브에 authKey로만 전달한다", async () => {
    setKmaKeys("api-hub-secret");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("apihub.kma.go.kr");
      expect(url.searchParams.get("authKey")).toBe("api-hub-secret");
      expect(url.searchParams.has("serviceKey")).toBe(false);
      return new Response('{"result":{"status":403,"message":"활용신청이 필요한 API 입니다."}}', {
        status: 403,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result.fallback).toBe(true);
    expect(result.message).toContain("기상청 API허브: HTTP 403");
    expect(result.message).toContain("활용신청이 필요한 API");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("공공데이터포털 키만 있으면 data.go.kr에 serviceKey로만 전달한다", async () => {
    setKmaKeys(undefined, "public-data-secret");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.hostname).toBe("apis.data.go.kr");
      expect(url.searchParams.get("serviceKey")).toBe("public-data-secret");
      expect(url.searchParams.has("authKey")).toBe(false);
      return new Response(successPayload(url.pathname.split("/").at(-1) ?? ""), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({
      fallback: false,
      provider: "DATA_GO_KR",
      temp: 24,
      humidity: 70,
      windSpeed: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("단기예보 첫 행이 아니라 현재 이후 가장 가까운 시각의 값을 사용한다", async () => {
    setKmaKeys(undefined, "public-data-secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T03:30:00Z")); // KST 12:30

    const forecastItems = [
      { category: "SKY", fcstDate: "20260714", fcstTime: "0600", fcstValue: "1" },
      { category: "POP", fcstDate: "20260714", fcstTime: "0600", fcstValue: "0" },
      { category: "SKY", fcstDate: "20260714", fcstTime: "1300", fcstValue: "4" },
      { category: "PTY", fcstDate: "20260714", fcstTime: "1300", fcstValue: "0" },
      { category: "POP", fcstDate: "20260714", fcstTime: "1300", fcstValue: "80" },
      { category: "PCP", fcstDate: "20260714", fcstTime: "1300", fcstValue: "1.0mm" },
      { category: "TMN", fcstDate: "20260714", fcstTime: "0600", fcstValue: "21" },
      { category: "TMX", fcstDate: "20260714", fcstTime: "1500", fcstValue: "31" },
    ];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const endpoint = new URL(String(input)).pathname.split("/").at(-1);
      const item =
        endpoint === "getUltraSrtNcst"
          ? [
              { category: "T1H", obsrValue: "27" },
              { category: "REH", obsrValue: "65" },
              { category: "WSD", obsrValue: "2" },
            ]
          : forecastItems;
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
            body: { items: { item } },
          },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({
      fallback: false,
      sky: "overcast",
      precipType: "none",
      precipProbability: 80,
      precipitation1h: "1.0mm",
      tmn: 21,
      tmx: 31,
    });
  });

  it("초단기실황이 실패해도 단기예보 TMP로 부분 복구한다", async () => {
    setKmaKeys(undefined, "public-data-secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T03:30:00Z"));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const endpoint = new URL(String(input)).pathname.split("/").at(-1);
      if (endpoint === "getUltraSrtNcst") {
        return new Response("temporary failure", { status: 503 });
      }
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
            body: {
              items: {
                item: [
                  { category: "TMP", fcstDate: "20260714", fcstTime: "1300", fcstValue: "28" },
                  { category: "REH", fcstDate: "20260714", fcstTime: "1300", fcstValue: "60" },
                  { category: "SKY", fcstDate: "20260714", fcstTime: "1300", fcstValue: "3" },
                ],
              },
            },
          },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({
      fallback: false,
      provider: "DATA_GO_KR",
      temp: 28,
      humidity: 60,
      sky: "cloudy",
      observationBaseDate: null,
      forecastBaseTime: "1100",
    });
    expect(result.message).toContain("일부 날씨 자료 조회 실패");
  });

  it("23시 이후에는 익일 첫 예보를 선택한다", async () => {
    setKmaKeys(undefined, "public-data-secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T14:30:00Z")); // KST 23:30
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const endpoint = new URL(String(input)).pathname.split("/").at(-1);
      const item =
        endpoint === "getUltraSrtNcst"
          ? [{ category: "T1H", obsrValue: "25" }]
          : [
              { category: "SKY", fcstDate: "20260715", fcstTime: "0000", fcstValue: "4" },
              { category: "POP", fcstDate: "20260715", fcstTime: "0000", fcstValue: "70" },
              { category: "TMP", fcstDate: "20260715", fcstTime: "0000", fcstValue: "24" },
            ];
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
            body: { items: { item } },
          },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({
      fallback: false,
      sky: "overcast",
      precipProbability: 70,
      forecastBaseTime: "2300",
    });
  });

  it("최신 발표가 비어 있으면 직전 발표시각을 다시 조회한다", async () => {
    setKmaKeys(undefined, "public-data-secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T03:30:00Z"));
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const endpoint = url.pathname.split("/").at(-1);
      let item: Array<Record<string, string>> = [];
      if (endpoint === "getUltraSrtNcst") {
        item = [{ category: "T1H", obsrValue: "27" }];
      } else if (url.searchParams.get("base_time") === "0800") {
        item = [
          { category: "TMP", fcstDate: "20260714", fcstTime: "1300", fcstValue: "28" },
          { category: "SKY", fcstDate: "20260714", fcstTime: "1300", fcstValue: "1" },
        ];
      }
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
            body: { items: { item } },
          },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({ fallback: false, forecastBaseTime: "0800", sky: "clear" });
    expect(
      fetchMock.mock.calls.some(
        ([input]) => new URL(String(input)).searchParams.get("base_time") === "0800"
      )
    ).toBe(true);
  });

  it("최신 발표에서 빠진 오늘 최고·최저는 02시 발표본으로 보완한다", async () => {
    setKmaKeys(undefined, "public-data-secret");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-14T09:30:00Z")); // KST 18:30
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const endpoint = url.pathname.split("/").at(-1);
      let item: Array<Record<string, string>>;
      if (endpoint === "getUltraSrtNcst") {
        item = [{ category: "T1H", obsrValue: "29" }];
      } else if (url.searchParams.get("base_time") === "0200") {
        item = [
          { category: "TMN", fcstDate: "20260714", fcstTime: "0600", fcstValue: "22" },
          { category: "TMX", fcstDate: "20260714", fcstTime: "1500", fcstValue: "33" },
        ];
      } else {
        item = [
          { category: "TMP", fcstDate: "20260714", fcstTime: "1900", fcstValue: "28" },
          { category: "TMN", fcstDate: "20260715", fcstTime: "0600", fcstValue: "23" },
          { category: "TMX", fcstDate: "20260715", fcstTime: "1500", fcstValue: "32" },
        ];
      }
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
            body: { items: { item } },
          },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({ fallback: false, tmn: 22, tmx: 33 });
    expect(
      fetchMock.mock.calls.some(
        ([input]) => new URL(String(input)).searchParams.get("base_time") === "0200"
      )
    ).toBe(true);
  });

  it("두 키가 있으면 API허브 실패 후 공공데이터포털으로 독립 폴백한다", async () => {
    setKmaKeys("api-hub-secret", "public-data-secret");
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "apihub.kma.go.kr") {
        return new Response('{"result":{"status":403,"message":"활용신청이 필요한 API 입니다."}}', {
          status: 403,
        });
      }
      expect(url.searchParams.get("serviceKey")).toBe("public-data-secret");
      return new Response(successPayload(url.pathname.split("/").at(-1) ?? ""), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result).toMatchObject({ fallback: false, provider: "DATA_GO_KR", temp: 24 });
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).hostname === "apihub.kma.go.kr")).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => new URL(String(input)).hostname === "apis.data.go.kr")).toBe(true);
  });

  it("두 공급자가 모두 실패해도 첫 API허브 403을 보존하고 키와 URL query는 숨긴다", async () => {
    const apiHubKey = "api-hub-secret";
    const serviceKey = "public-data-secret";
    setKmaKeys(apiHubKey, serviceKey);
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.hostname === "apihub.kma.go.kr") {
        return new Response(
          JSON.stringify({
            result: {
              status: 403,
              message: "활용신청이 필요한 API 입니다.",
              request: `https://apihub.kma.go.kr/example?authKey=${apiHubKey}&nx=60`,
            },
          }),
          { status: 403 },
        );
      }
      return new Response(`Unauthorized serviceKey=${serviceKey}`, { status: 401 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getWeatherSnapshot } = await import("./kma");
    const result = await getWeatherSnapshot(37.5665, 126.978);

    expect(result.fallback).toBe(true);
    expect(result.message).toContain("기상청 API허브: HTTP 403");
    expect(result.message).toContain("활용신청이 필요한 API");
    expect(result.message).toContain("공공데이터포털: HTTP 401");
    expect(result.message).not.toContain(apiHubKey);
    expect(result.message).not.toContain(serviceKey);
    expect(result.message).not.toMatch(/[?&](?:authKey|serviceKey)=/i);
  });
});
