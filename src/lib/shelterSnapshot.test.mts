import { afterEach, describe, expect, it, vi } from "vitest";

const { putMock, headMock } = vi.hoisted(() => ({ putMock: vi.fn(), headMock: vi.fn() }));

vi.mock("@vercel/blob", () => ({ put: putMock, head: headMock }));

const ORIGINAL_BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function downloadFixture() {
  return {
    source: "DSSP-IF-10941" as const,
    fetchedAt: "2026-07-14T10:00:00.000Z",
    rawCount: 1,
    validCount: 1,
    skippedCount: 0,
    typeCounts: { "1": 1, "2": 0, "3": 0, "4": 0 },
    shelters: [
      {
        id: "1:ABC",
        name: "테스트 한파쉼터",
        shelter_type: "한파쉼터" as const,
        shelter_type_code: "1" as const,
        shelter_type_name: "한파쉼터",
        address: "서울특별시 테스트로 1",
        lat: 37.5665,
        lng: 126.978,
        source: "DSSP-IF-10941" as const,
      },
    ],
  };
}

afterEach(() => {
  if (ORIGINAL_BLOB_TOKEN === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = ORIGINAL_BLOB_TOKEN;
  putMock.mockReset();
  headMock.mockReset();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("통합대피소 JSON 스냅샷", () => {
  it("완전한 데이터만 고정 Blob JSON 경로에 저장하고 키는 내용에 넣지 않는다", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob-secret";
    putMock.mockResolvedValue({
      url: "https://public.blob.vercel-storage.com/safecompass/integrated-shelters.json",
      downloadUrl: "https://public.blob.vercel-storage.com/safecompass/integrated-shelters.json?download=1",
    });

    const { saveShelterSnapshot, SHELTER_SNAPSHOT_PATHNAME } = await import("./shelterSnapshot");
    const summary = await saveShelterSnapshot(downloadFixture());

    expect(SHELTER_SNAPSHOT_PATHNAME).toBe("safecompass/integrated-shelters.json");
    expect(summary).toMatchObject({ storage: "vercel-blob", validCount: 1 });
    expect(putMock).toHaveBeenCalledTimes(1);
    const [pathname, body, options] = putMock.mock.calls[0];
    expect(pathname).toBe(SHELTER_SNAPSHOT_PATHNAME);
    expect(JSON.parse(body)).toMatchObject({ schemaVersion: 1, source: "DSSP-IF-10941" });
    expect(body).not.toContain("blob-secret");
    expect(options).toMatchObject({ access: "public", allowOverwrite: true, addRandomSuffix: false });
  });

  it("빈 배열이나 건수 불일치 JSON은 저장 전에 거부한다", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob-secret";
    const { validateShelterSnapshot } = await import("./shelterSnapshot");

    expect(() =>
      validateShelterSnapshot({
        schemaVersion: 1,
        source: "DSSP-IF-10941",
        fetchedAt: "2026-07-14T10:00:00.000Z",
        validCount: 1,
        shelters: [],
      })
    ).toThrow("형식이 올바르지 않습니다");
  });

  it("Blob JSON을 검증해 읽고 메타데이터 요약을 반환한다", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "blob-secret";
    const stored = { schemaVersion: 1 as const, ...downloadFixture() };
    headMock.mockResolvedValue({
      url: "https://public.blob.vercel-storage.com/snapshot.json",
      downloadUrl: "https://public.blob.vercel-storage.com/snapshot.json?download=1",
      etag: "etag-1",
      size: 512,
      pathname: "safecompass/integrated-shelters.json",
      uploadedAt: new Date(),
      contentType: "application/json",
      contentDisposition: "attachment",
      cacheControl: "public, max-age=60",
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(stored))));

    const { getShelterSnapshotSummary } = await import("./shelterSnapshot");
    const result = await getShelterSnapshotSummary();

    expect(result).toMatchObject({ storage: "vercel-blob", size: 512, validCount: 1 });
  });
});
