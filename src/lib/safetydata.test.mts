import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_NAMES = [
  "SAFETYDATA_SERVICE10941_KEY",
  "SAFETYDATA_SERVICE_KEY",
  "SAFETYDATA_SERVICE10748_KEY",
  "SAFETYDATA_SERVICE00247_KEY",
] as const;
const ORIGINAL = Object.fromEntries(ENV_NAMES.map((name) => [name, process.env[name]]));

function row(code: string, id: string, overrides: Record<string, unknown> = {}) {
  return {
    REARE_NM: `대피소 ${code}-${id}`,
    RONA_DADDR: "서울특별시 테스트로 1",
    LAT: "37.5665",
    LOT: "126.9780",
    SHLT_SE_CD: code,
    SHLT_SE_NM:
      code === "1"
        ? "한파쉼터"
        : code === "2"
          ? "무더위쉼터"
          : code === "3"
            ? "지진옥외대피장소"
            : "지진해일긴급대피장소",
    MNG_SN: id,
    ...overrides,
  };
}

afterEach(() => {
  for (const name of ENV_NAMES) {
    const value = ORIGINAL[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.resetModules();
});

describe("재난안전데이터공유플랫폼 재난문자", () => {
  it("10748 공식 필드에서 속보 내용·시각·본문 지역을 채운다", async () => {
    const { normalizeBreakingMessageRow } = await import("./safetydata");
    const message = normalizeBreakingMessageRow({
      MSTN_BRNE_NO: "9876",
      MSTN_BRNE_CN:
        "내일까지 많은 비가 예상되어 산사태 위험이 높습니다. 산림 주변 활동을 자제하세요.[괴산군]",
      MSTN_ID: "3",
      REG_DT: "2026/07/15 08:21:34.000000000",
      EMRG_MSTN_LTR_EXGENC_STEP: "안전안내",
    });

    expect(message).toMatchObject({
      id: "9876",
      content:
        "내일까지 많은 비가 예상되어 산사태 위험이 높습니다. 산림 주변 활동을 자제하세요.[괴산군]",
      issued_at: "2026-07-15T08:21:34+09:00",
      region_codes: ["충청북도 괴산군"],
      service: "10748",
    });
  });

  it("10748 발신지역을 우선 사용하고 일반 단어의 부분 문자열은 지역으로 오인하지 않는다", async () => {
    const { extractBreakingMessageRegions } = await import("./safetydata");

    expect(extractBreakingMessageRegions("경기장에서 안전사고가 발생했습니다.")).toEqual([
      "지역 미제공 · 본문 참조",
    ]);
    expect(
      extractBreakingMessageRegions("통합 지자체 관할 재난 속보입니다.[전남광주통합특별시]")
    ).toEqual(["전남광주통합특별시"]);
    expect(extractBreakingMessageRegions("산사태 위험이 높습니다.[괴산군]")).toEqual([
      "충청북도 괴산군",
    ]);
  });

  it("00247의 모든 페이지를 조회해 첫 페이지에 잘리던 최신 문자를 포함한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00+09:00"));
    process.env.SAFETYDATA_SERVICE00247_KEY = "emergency-secret";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/V2/api/DSSP-IF-00247");
      expect(url.searchParams.get("serviceKey")).toBe("emergency-secret");
      expect(url.searchParams.get("crtDt")).toBe("20260714");
      expect(url.searchParams.has("regDt")).toBe(false);
      expect(url.searchParams.get("numOfRows")).toBe("100");
      const pageNo = Number(url.searchParams.get("pageNo"));
      const body =
        pageNo === 1
          ? [
              {
                SN: "oldest-in-range",
                CRT_DT: "2026/07/14 00:10:00",
                MSG_CN: "전일 문자",
                RCPTN_RGN_NM: "서울특별시",
                EMRG_STEP_NM: "안전안내",
              },
            ]
          : pageNo === 22
            ? [
                {
                  SN: "newest",
                  CRT_DT: "2026/07/15 11:50:00",
                  MSG_CN: "최신 긴급재난문자",
                  RCPTN_RGN_NM: "서울특별시, 경기도",
                  EMRG_STEP_NM: "긴급재난",
                },
              ]
            : [];
      return new Response(JSON.stringify({ header: { resultCode: "00" }, totalCount: 2101, body }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getEmergencyMessages } = await import("./safetydata");
    const result = await getEmergencyMessages();

    expect(fetchMock).toHaveBeenCalledTimes(22);
    expect(result.fallback).toBe(false);
    expect(result.messages.map((message) => message.id)).toEqual(["newest", "oldest-in-range"]);
    expect(result.messages[0].region_codes).toEqual(["서울특별시", "경기도"]);
  });

  it("10748에 공식 regDt를 보내 마지막 페이지를 조회하고 당일·전일 외 자료는 제거한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00+09:00"));
    process.env.SAFETYDATA_SERVICE10748_KEY = "breaking-secret";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/V2/api/DSSP-IF-10748");
      expect(url.searchParams.get("regDt")).toBe("20260714");
      expect(url.searchParams.has("crtDt")).toBe(false);
      const pageNo = Number(url.searchParams.get("pageNo"));
      const body =
        pageNo === 1
          ? [
              {
                MSTN_BRNE_NO: "expired",
                MSTN_BRNE_CN: "오래된 속보[국민안전처]",
                REG_DT: "2026/07/13 23:59:59.000000000",
              },
            ]
          : [
              {
                MSTN_BRNE_NO: "latest-breaking",
                MSTN_BRNE_CN: "호우로 하천 수위가 높습니다. 접근하지 마세요.[괴산군]",
                REG_DT: "2026/07/15 11:55:00.000000000",
              },
            ];
      return new Response(JSON.stringify({ header: { resultCode: "00" }, totalCount: 101, body }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getBreakingMessages } = await import("./safetydata");
    const result = await getBreakingMessages();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.messages).toEqual([
      expect.objectContaining({
        id: "latest-breaking",
        content: "호우로 하천 수위가 높습니다. 접근하지 마세요.[괴산군]",
        region_codes: ["충청북도 괴산군"],
      }),
    ]);
  });

  it("재난문자 두 서비스 중 하나만 실패해도 부분 장애를 표시한다", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-15T12:00:00+09:00"));
    process.env.SAFETYDATA_SERVICE00247_KEY = "emergency-secret";
    delete process.env.SAFETYDATA_SERVICE10748_KEY;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            header: { resultCode: "00" },
            totalCount: 1,
            body: [
              {
                SN: "available",
                CRT_DT: "2026/07/15 11:50:00",
                MSG_CN: "정상 수신된 긴급재난문자",
                RCPTN_RGN_NM: "서울특별시",
              },
            ],
          })
        )
      )
    );

    const { getDisasterMessages } = await import("./safetydata");
    const result = await getDisasterMessages();

    expect(result.messages).toHaveLength(1);
    expect(result.fallback).toBe(true);
    expect(result.message).toContain("SAFETYDATA_SERVICE10748_KEY");
  });

  it("관리자 상태는 재난문자 키가 빠지면 통합대피소 키가 있어도 미설정으로 표시한다", async () => {
    process.env.SAFETYDATA_SERVICE10941_KEY = "shelter-secret";
    delete process.env.SAFETYDATA_SERVICE00247_KEY;
    delete process.env.SAFETYDATA_SERVICE10748_KEY;

    const { providerStatuses } = await import("./env");
    const status = providerStatuses().find((item) => item.provider === "safetydata");

    expect(status?.configured).toBe(false);
    expect(status?.detail).toContain("SAFETYDATA_SERVICE00247_KEY");
    expect(status?.detail).toContain("SAFETYDATA_SERVICE10748_KEY");
  });
});

describe("재난안전데이터공유플랫폼 통합대피소", () => {
  it("이전 SAFETYDATA_SERVICE_KEY를 무시하고 10941 전용 키만 요구한다", async () => {
    delete process.env.SAFETYDATA_SERVICE10941_KEY;
    process.env.SAFETYDATA_SERVICE_KEY = "old-key-must-not-work";
    process.env.SAFETYDATA_SERVICE10748_KEY = "message-key";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { testIntegratedShelterSource } = await import("./safetydata");
    await expect(testIntegratedShelterSource()).rejects.toThrow("SAFETYDATA_SERVICE10941_KEY 미설정");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("DSSP-IF-10941에 새 키와 유형코드·페이지 인자를 전달해 전체 유형을 수집한다", async () => {
    process.env.SAFETYDATA_SERVICE10941_KEY = "shelter-secret";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe("https://www.safetydata.go.kr/V2/api/DSSP-IF-10941");
      expect(url.searchParams.get("serviceKey")).toBe("shelter-secret");
      expect(url.searchParams.get("returnType")).toBe("json");
      expect(url.searchParams.get("numOfRows")).toBe("1000");
      expect(url.searchParams.has("startLat")).toBe(false);
      const code = url.searchParams.get("shlt_se_cd")!;
      const pageNo = Number(url.searchParams.get("pageNo"));
      const body =
        code === "1" && pageNo === 1
          ? [row("1", "A"), row("1", "B")]
          : code === "1" && pageNo === 2
            ? [row("1", "C")]
            : [row(code, "A")];
      const totalCount = code === "1" ? 3 : 1;
      return new Response(JSON.stringify({ header: { resultCode: "00" }, totalCount, body }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAllIntegratedShelters } = await import("./safetydata");
    const result = await fetchAllIntegratedShelters();

    expect(result).toMatchObject({
      source: "DSSP-IF-10941",
      rawCount: 6,
      validCount: 6,
      skippedCount: 0,
      typeCounts: { "1": 3, "2": 1, "3": 1, "4": 1 },
    });
    expect(result.shelters.map((item) => item.shelter_type)).toEqual(
      expect.arrayContaining([
        "한파쉼터",
        "무더위쉼터",
        "지진옥외대피장소",
        "지진해일긴급대피장소",
      ])
    );
    expect(result.shelters.find((item) => item.shelter_type_code === "4")).toMatchObject({
      id: "4:A",
      source: "DSSP-IF-10941",
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("필수 필드가 없거나 좌표가 잘못된 행은 JSON 저장 대상에서 제외한다", async () => {
    process.env.SAFETYDATA_SERVICE10941_KEY = "shelter-secret";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const code = new URL(String(input)).searchParams.get("shlt_se_cd")!;
      const body =
        code === "1"
          ? [row("1", "A"), row("1", "BAD", { LAT: "Infinity" }), row("1", "", { MNG_SN: "" })]
          : [row(code, "A")];
      return new Response(
        JSON.stringify({ header: { resultCode: "00" }, totalCount: body.length, body })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchAllIntegratedShelters } = await import("./safetydata");
    const result = await fetchAllIntegratedShelters();

    expect(result.rawCount).toBe(6);
    expect(result.validCount).toBe(4);
    expect(result.skippedCount).toBe(2);
  });

  it("URL 인코딩된 전용 키를 한 번만 복원해 serviceKey로 보낸다", async () => {
    process.env.SAFETYDATA_SERVICE10941_KEY = "abc%2Bdef%3D";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      expect(url.searchParams.get("serviceKey")).toBe("abc+def=");
      return new Response(
        JSON.stringify({ header: { resultCode: "00" }, totalCount: 1, body: [row("1", "A")] })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { testIntegratedShelterSource } = await import("./safetydata");
    const result = await testIntegratedShelterSource();
    expect(result.ok).toBe(true);
  });

  it("플랫폼 오류에 서비스키가 포함돼도 공개 오류에서는 가린다", async () => {
    const secret = "shelter-secret";
    process.env.SAFETYDATA_SERVICE10941_KEY = secret;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            header: {
              resultCode: "30",
              errorMsg: `Unauthorized https://example.test?serviceKey=${secret}`,
            },
            body: [],
          })
        )
      )
    );

    const { testIntegratedShelterSource } = await import("./safetydata");
    const message = await testIntegratedShelterSource().then(
      () => "",
      (error: unknown) => (error instanceof Error ? error.message : String(error))
    );
    expect(message).toContain("[REDACTED]");
    expect(message).not.toContain(secret);
  });
});
