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
  vi.resetModules();
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
