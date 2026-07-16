import { head, put } from "@vercel/blob";
import { promises as fs } from "fs";
import path from "path";
import { env } from "./env";
import type { IntegratedShelterDownload } from "./safetydata";
import type { Shelter, ShelterTypeCode } from "@/types";

export const SHELTER_SNAPSHOT_PATHNAME = "safecompass/integrated-shelters.json";
export const MISSING_SHELTER_SNAPSHOT_MESSAGE =
  "통합대피소 JSON이 없습니다. SAFETYDATA_SERVICE10941_KEY와 BLOB_READ_WRITE_TOKEN을 설정한 뒤 관리자 페이지에서 '새로 받기'를 실행해 주세요.";
const LOCAL_SNAPSHOT_PATH = path.join(process.cwd(), "data", "runtime", "integrated-shelters.json");
// 저장본은 관리자가 '새로 받기'를 누를 때만 바뀐다. 원본 API를 다시 부르지 않도록
// 메모리에 올려 둔 JSON을 계속 쓰고, 다른 서버 인스턴스에서 교체된 저장본만
// 이 간격으로 etag/수정시각을 대조해 감지한다. 내용이 같으면 다시 내려받지 않는다.
const REVALIDATE_INTERVAL_MS = 5 * 60 * 1000;

export interface ShelterSnapshot {
  schemaVersion: 1;
  source: "DSSP-IF-10941";
  fetchedAt: string;
  rawCount: number;
  validCount: number;
  skippedCount: number;
  typeCounts: Record<ShelterTypeCode, number>;
  shelters: Shelter[];
}

export interface ShelterSnapshotSummary {
  storage: "vercel-blob" | "local-file";
  pathname: string;
  fetchedAt: string;
  rawCount: number;
  validCount: number;
  skippedCount: number;
  typeCounts: Record<ShelterTypeCode, number>;
  size: number;
  downloadUrl: string | null;
}

interface MemoryCache {
  snapshot: ShelterSnapshot;
  storage: ShelterSnapshotSummary["storage"];
  version: string;
  checkedAt: number;
  size: number;
  downloadUrl: string | null;
}

let memoryCache: MemoryCache | null = null;

function isMissingSnapshotError(error: unknown): boolean {
  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
    statusCode?: unknown;
  };
  const status = Number(candidate?.status ?? candidate?.statusCode);
  const code = typeof candidate?.code === "string" ? candidate.code.trim().toUpperCase() : "";
  const name = String(candidate?.name ?? "").trim();
  const detail = String(candidate?.message ?? error ?? "");

  return (
    status === 404 ||
    code === "ENOENT" ||
    code === "BLOB_NOT_FOUND" ||
    /^BlobNotFound(?:Error)?$/i.test(name) ||
    /Vercel Blob:\s*The requested blob does not exist/i.test(detail) ||
    /\bno such file(?: or directory)?\b/i.test(detail)
  );
}

function isShelter(value: unknown): value is Shelter {
  const item = value as Shelter;
  return Boolean(
    item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.address === "string" &&
      Number.isFinite(item.lat) &&
      Number.isFinite(item.lng) &&
      item.source === "DSSP-IF-10941"
  );
}

export function validateShelterSnapshot(value: unknown): ShelterSnapshot {
  const snapshot = value as ShelterSnapshot;
  if (
    !snapshot ||
    snapshot.schemaVersion !== 1 ||
    snapshot.source !== "DSSP-IF-10941" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(snapshot.fetchedAt) ||
    !Array.isArray(snapshot.shelters) ||
    snapshot.shelters.length === 0 ||
    !snapshot.shelters.every(isShelter) ||
    snapshot.validCount !== snapshot.shelters.length
  ) {
    throw new Error("저장된 통합대피소 JSON 형식이 올바르지 않습니다");
  }
  return snapshot;
}

function makeSnapshot(download: IntegratedShelterDownload): ShelterSnapshot {
  return validateShelterSnapshot({ schemaVersion: 1, ...download });
}

function summary(cache: MemoryCache): ShelterSnapshotSummary {
  return {
    storage: cache.storage,
    pathname: cache.storage === "vercel-blob" ? SHELTER_SNAPSHOT_PATHNAME : LOCAL_SNAPSHOT_PATH,
    fetchedAt: cache.snapshot.fetchedAt,
    rawCount: cache.snapshot.rawCount,
    validCount: cache.snapshot.validCount,
    skippedCount: cache.snapshot.skippedCount,
    typeCounts: cache.snapshot.typeCounts,
    size: cache.size,
    downloadUrl: cache.downloadUrl,
  };
}

type BlobMetadata = Awaited<ReturnType<typeof head>>;

function blobVersion(metadata: BlobMetadata): string {
  return String(metadata.etag ?? `${metadata.size}:${metadata.uploadedAt}`);
}

function localVersion(stats: { mtimeMs: number; size: number }): string {
  return `${stats.mtimeMs}:${stats.size}`;
}

async function downloadBlobSnapshot(metadata: BlobMetadata): Promise<ShelterSnapshot> {
  const response = await fetch(`${metadata.url}?v=${encodeURIComponent(blobVersion(metadata))}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`통합대피소 JSON 저장소 응답 오류: HTTP ${response.status}`);
  return validateShelterSnapshot(await response.json());
}

// 저장소의 버전(etag/수정시각)만 가볍게 대조하고, 저장본이 실제로 교체된 경우에만
// JSON 전체를 다시 읽는다. 그 외에는 메모리에 있는 저장본을 그대로 쓴다.
async function resolveCache(forceCheck: boolean): Promise<MemoryCache> {
  const now = Date.now();
  if (memoryCache && !forceCheck && now - memoryCache.checkedAt < REVALIDATE_INTERVAL_MS) {
    return memoryCache;
  }

  if (env.blobReadWriteToken) {
    const metadata = await head(SHELTER_SNAPSHOT_PATHNAME, { token: env.blobReadWriteToken });
    const version = blobVersion(metadata);
    if (memoryCache?.storage === "vercel-blob" && memoryCache.version === version) {
      memoryCache = { ...memoryCache, checkedAt: now, size: metadata.size, downloadUrl: metadata.downloadUrl };
      return memoryCache;
    }
    const snapshot = await downloadBlobSnapshot(metadata);
    memoryCache = {
      snapshot,
      storage: "vercel-blob",
      version,
      checkedAt: now,
      size: metadata.size,
      downloadUrl: metadata.downloadUrl,
    };
    return memoryCache;
  }

  const stats = await fs.stat(LOCAL_SNAPSHOT_PATH);
  const version = localVersion(stats);
  if (memoryCache?.storage === "local-file" && memoryCache.version === version) {
    memoryCache = { ...memoryCache, checkedAt: now };
    return memoryCache;
  }
  const raw = await fs.readFile(LOCAL_SNAPSHOT_PATH, "utf8");
  memoryCache = {
    snapshot: validateShelterSnapshot(JSON.parse(raw)),
    storage: "local-file",
    version,
    checkedAt: now,
    size: stats.size,
    downloadUrl: null,
  };
  return memoryCache;
}

export async function loadShelterSnapshot(): Promise<ShelterSnapshot> {
  try {
    return (await resolveCache(false)).snapshot;
  } catch (error) {
    if (isMissingSnapshotError(error)) throw new Error(MISSING_SHELTER_SNAPSHOT_MESSAGE);
    throw error;
  }
}

export async function saveShelterSnapshot(
  download: IntegratedShelterDownload
): Promise<ShelterSnapshotSummary> {
  const snapshot = makeSnapshot(download);
  const json = JSON.stringify(snapshot);
  const size = Buffer.byteLength(json);

  if (env.blobReadWriteToken) {
    const blob = await put(SHELTER_SNAPSHOT_PATHNAME, json, {
      access: "public",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
      contentType: "application/json; charset=utf-8",
      token: env.blobReadWriteToken,
    });
    // 방금 저장한 버전(etag)을 기억해 두면 이후 상태 조회에서 같은 파일을 다시
    // 내려받지 않는다. 확인에 실패해도 다음 조회에서 새로 읽으므로 저장은 성공이다.
    try {
      const metadata = await head(SHELTER_SNAPSHOT_PATHNAME, { token: env.blobReadWriteToken });
      memoryCache = {
        snapshot,
        storage: "vercel-blob",
        version: blobVersion(metadata),
        checkedAt: Date.now(),
        size: metadata.size,
        downloadUrl: metadata.downloadUrl,
      };
    } catch {
      memoryCache = null;
    }
    return {
      storage: "vercel-blob",
      pathname: SHELTER_SNAPSHOT_PATHNAME,
      fetchedAt: snapshot.fetchedAt,
      rawCount: snapshot.rawCount,
      validCount: snapshot.validCount,
      skippedCount: snapshot.skippedCount,
      typeCounts: snapshot.typeCounts,
      size,
      downloadUrl: blob.downloadUrl,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("BLOB_READ_WRITE_TOKEN 미설정 — 운영 환경에 통합대피소 JSON을 저장할 수 없습니다");
  }
  await fs.mkdir(path.dirname(LOCAL_SNAPSHOT_PATH), { recursive: true });
  const tempPath = `${LOCAL_SNAPSHOT_PATH}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, json, "utf8");
  await fs.rename(tempPath, LOCAL_SNAPSHOT_PATH);
  try {
    const stats = await fs.stat(LOCAL_SNAPSHOT_PATH);
    memoryCache = {
      snapshot,
      storage: "local-file",
      version: localVersion(stats),
      checkedAt: Date.now(),
      size: stats.size,
      downloadUrl: null,
    };
  } catch {
    memoryCache = null;
  }
  return {
    storage: "local-file",
    pathname: LOCAL_SNAPSHOT_PATH,
    fetchedAt: snapshot.fetchedAt,
    rawCount: snapshot.rawCount,
    validCount: snapshot.validCount,
    skippedCount: snapshot.skippedCount,
    typeCounts: snapshot.typeCounts,
    size,
    downloadUrl: null,
  };
}

export async function getShelterSnapshotSummary(): Promise<ShelterSnapshotSummary | null> {
  try {
    // 관리자 상태 조회는 항상 저장소 버전을 대조해 최신 저장 상태를 보여 준다.
    // 버전이 같으면 메타데이터만 확인하고 JSON 본문은 다시 내려받지 않는다.
    return summary(await resolveCache(true));
  } catch (error) {
    if (isMissingSnapshotError(error)) return null;
    throw error;
  }
}

export function clearShelterSnapshotMemoryCache(): void {
  memoryCache = null;
}
