import { describe, expect, it } from "vitest";
import type { DisasterMessage, WeatherAlert } from "../types";
import { paginateOfficialAlerts } from "./alertsPagination";

const NOW = new Date("2026-07-15T12:00:00+09:00");

function messages(count: number, service: "00247" | "10748" = "00247"): DisasterMessage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${service}-${index}`,
    msg_type: service === "10748" ? "재난문자(속보)" : "긴급재난문자",
    region_codes: ["전국"],
    content: `재난문자 ${index}`,
    issued_at: new Date(Date.UTC(2026, 6, 14, 12, 0) - index * 60_000).toISOString(),
    source: "safetydata" as const,
    service,
  }));
}

function weatherAlerts(count: number): WeatherAlert[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `weather-${index}`,
    alert_kind: "호우",
    alert_level: "주의보",
    region_codes: ["전국"],
    issued_at: new Date(Date.UTC(2026, 6, 14, 11, 0) - index * 60_000).toISOString(),
    source: "kma" as const,
  }));
}

describe("공식 알림 페이지네이션", () => {
  it("재난문자와 기상특보를 최신순으로 합쳐 페이지당 10건을 반환한다", () => {
    const result = paginateOfficialAlerts({
      messages: messages(21),
      weatherAlerts: weatherAlerts(2),
      filter: "all",
      requestedPage: 2,
      pageSize: 10,
      now: NOW,
    });

    expect(result.items).toHaveLength(10);
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 23,
      totalPages: 3,
      hasPrevious: true,
      hasNext: true,
    });
    expect(result.items[0].issued_at >= result.items[1].issued_at).toBe(true);
  });

  it("속보와 날씨 필터를 서버 페이지 계산 전에 적용한다", () => {
    const breaking = paginateOfficialAlerts({
      messages: [...messages(5), ...messages(3, "10748")],
      weatherAlerts: weatherAlerts(4),
      filter: "breaking",
      requestedPage: 1,
      pageSize: 10,
      now: NOW,
    });
    const weather = paginateOfficialAlerts({
      messages: messages(5),
      weatherAlerts: weatherAlerts(4),
      filter: "weather",
      requestedPage: 1,
      pageSize: 10,
      now: NOW,
    });

    expect(breaking.pagination.total).toBe(3);
    expect(breaking.items.every((item) => item.kind === "message" && item.service === "10748")).toBe(true);
    expect(weather.pagination.total).toBe(4);
    expect(weather.items.every((item) => item.kind === "weather")).toBe(true);
  });

  it("상세 id 조회는 페이지와 관계없이 정확한 한 건을 찾는다", () => {
    const result = paginateOfficialAlerts({
      messages: messages(20),
      weatherAlerts: [],
      filter: "all",
      requestedPage: 1,
      pageSize: 1,
      requestedId: "message-00247-17",
      now: NOW,
    });

    expect(result.pagination.total).toBe(1);
    expect(result.items[0]).toMatchObject({ kind: "message", id: "00247-17" });
  });

  it("KST 기준 당일과 전일 알림만 남기고 더 오래된 캐시 후보는 제외한다", () => {
    const dated = [
      { ...messages(1)[0], id: "today", issued_at: "2026-07-15T00:00:00+09:00" },
      { ...messages(1)[0], id: "yesterday", issued_at: "2026-07-14T00:00:00+09:00" },
      { ...messages(1)[0], id: "expired", issued_at: "2026-07-13T23:59:59+09:00" },
      { ...messages(1)[0], id: "future", issued_at: "2026-07-16T00:00:00+09:00" },
    ];

    const result = paginateOfficialAlerts({
      messages: dated,
      weatherAlerts: [],
      filter: "all",
      requestedPage: 1,
      pageSize: 10,
      now: NOW,
    });

    expect(result.items.map((item) => item.id)).toEqual(["today", "yesterday"]);
    expect(result.pagination.total).toBe(2);
  });
});
