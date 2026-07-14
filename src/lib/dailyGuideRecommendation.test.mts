import { describe, expect, it } from "vitest";
import type { DisasterMessage, WeatherSnapshot } from "../types";
import { kstDateKey, parseCoordinate, selectDailyGuideRecommendation } from "./dailyGuideRecommendation";

function weather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    provider: null,
    temp: null,
    feelsLike: null,
    sky: "unknown",
    precipType: "unknown",
    precipProbability: null,
    humidity: null,
    windSpeed: null,
    precipitation1h: null,
    tmx: null,
    tmn: null,
    baseDate: "",
    baseTime: "",
    observationBaseDate: null,
    observationBaseTime: null,
    forecastBaseDate: null,
    forecastBaseTime: null,
    fallback: true,
    ...overrides,
  };
}

function message(content: string): DisasterMessage {
  return {
    id: content,
    msg_type: "긴급재난문자",
    region_codes: ["서울특별시"],
    content,
    issued_at: "2026-07-14T09:00:00+09:00",
    source: "safetydata",
    service: "00247",
  };
}

describe("오늘의 맞춤 행동요령", () => {
  it("재난문자와 동네예보 위험 신호를 합쳐 가장 관련도 높은 유형을 고른다", () => {
    const result = selectDailyGuideRecommendation({
      date: "2026-07-14",
      messages: [message("서울 전역에 폭염경보가 발효됐습니다. 온열질환에 유의하세요.")],
      weatherAlerts: [],
      weather: weather({ fallback: false, provider: "KMA_APIHUB", temp: 34, tmx: 36 }),
    });

    expect(result.guide).toMatchObject({ id: "heatWave", category: "natural", name: "폭염" });
    expect(result.selectionBasis).toBe("signals");
    expect(result.sources).toEqual({ disasterMessageCount: 1, weatherAlertCount: 0, weatherAvailable: true });
    expect(result.reason).toContain("재난문자·동네예보");
  });

  it("재난문자 키워드만 있어도 사회재난 행동요령을 결정론적으로 선택한다", () => {
    const input = {
      date: "2026-04-03",
      messages: [message("인근 공장에서 유해화학 물질 누출 사고가 발생했습니다.")],
      weatherAlerts: [],
      weather: weather(),
    };

    expect(selectDailyGuideRecommendation(input).guide).toMatchObject({
      id: "chemicalAccident",
      category: "social",
    });
    expect(selectDailyGuideRecommendation(input)).toEqual(selectDailyGuideRecommendation(input));
  });

  it("API 키와 위험 신호가 없어도 날짜별 계절 행동요령을 제공한다", () => {
    const result = selectDailyGuideRecommendation({
      date: "2026-12-10",
      messages: [],
      weatherAlerts: [],
      weather: weather(),
    });

    expect(result.guide.id).toBe("coldWave");
    expect(result.selectionBasis).toBe("seasonal-fallback");
    expect(result.sources).toEqual({ disasterMessageCount: 0, weatherAlertCount: 0, weatherAvailable: false });
  });

  it("기상특보도 재난문자와 같은 점수표에 반영한다", () => {
    const result = selectDailyGuideRecommendation({
      date: "2026-07-14",
      messages: [],
      weatherAlerts: [
        {
          id: "warning-1",
          alert_kind: "호우",
          alert_level: "경보",
          region_codes: ["서울특별시"],
          issued_at: "2026-07-14T08:00:00+09:00",
          source: "kma",
        },
      ],
      weather: weather({ fallback: false, provider: "KMA_APIHUB", precipProbability: 80 }),
    });

    expect(result.guide.id).toBe("heavyRain");
    expect(result.sources).toEqual({ disasterMessageCount: 0, weatherAlertCount: 1, weatherAvailable: true });
    expect(result.reason).toContain("기상특보·동네예보");
  });

  it("한국 표준시 날짜를 UTC와 분리해 계산한다", () => {
    expect(kstDateKey(new Date("2026-07-13T15:01:00Z"))).toBe("2026-07-14");
  });

  it("누락되거나 빈 좌표를 0으로 오인하지 않는다", () => {
    expect(parseCoordinate(null, -90, 90)).toBeNull();
    expect(parseCoordinate(" ", -90, 90)).toBeNull();
    expect(parseCoordinate("37.5665", -90, 90)).toBe(37.5665);
    expect(parseCoordinate("91", -90, 90)).toBeNull();
  });
});
