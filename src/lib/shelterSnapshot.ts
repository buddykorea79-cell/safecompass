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
const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;

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

let memoryCache: { snapshot: ShelterSnapshot; expiresAt: number } | null = null;

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

function summary(
  snapshot: ShelterSnapshot,
  storage: ShelterSnapshotSummary["storage"],
  size: number,
  downloadUrl: string | null
): ShelterSnapshotSummary {
  return {
    storage,
    pathname: storage === "vercel-blob" ? SHELTER_SNAPSHOT_PATHNAME : LOCAL_SNAPSHOT_PATH,
    fetchedAt: snapshot.fetchedAt,
    rawCount: snapshot.rawCount,
    validCount: snapshot.validCount,
    skippedCount: snapshot.skippedCount,
    typeCounts: snapshot.typeCounts,
    size,
    downloadUrl,
  };
}

async function loadFromBlob(): Promise<{ snapshot: ShelterSnapshot; metadata: Awaited<ReturnType<typeof head>> }> {
  const metadata = await head(SHELTER_SNAPSHOT_PATHNAME, { token: env.blobReadWriteToken });
  const response = await fetch(`${metadata.url}?v=${encodeURIComponent(metadata.etag)}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`통합대피소 JSON 저장소 응답 오류: HTTP ${response.status}`);
  const snapshot = validateShelterSnapshot(await response.json());
  return { snapshot, metadata };
}

async function loadFromLocalFile(): Promise<{ snapshot: ShelterSnapshot; size: number }> {
  const [raw, stats] = await Promise.all([
    fs.readFile(LOCAL_SNAPSHOT_PATH, "utf8"),
    fs.stat(LOCAL_SNAPSHOT_PATH),
  ]);
  return { snapshot: validateShelterSnapshot(JSON.parse(raw)), size: stats.size };
}

export async function loadShelterSnapshot(): Promise<ShelterSnapshot> {
  if (memoryCache && memoryCache.expiresAt > Date.now()) return memoryCache.snapshot;
  let snapshot: ShelterSnapshot;
  try {
    snapshot = env.blobReadWriteToken
      ? (await loadFromBlob()).snapshot
      : (await loadFromLocalFile()).snapshot;
  } catch (error) {
    if (isMissingSnapshotError(error)) throw new Error(MISSING_SHELTER_SNAPSHOT_MESSAGE);
    throw error;
  }
  memoryCache = { snapshot, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS };
  return snapshot;
}

export async function saveShelterSnapshot(
  download: IntegratedShelterDownload
): Promise<ShelterSnapshotSummary> {
  const snapshot = makeSnapshot(download);
  const json = JSON.stringify(snapshot);
  let result: ShelterSnapshotSummary;

  if (env.blobReadWriteToken) {
    const blob = await put(SHELTER_SNAPSHOT_PATHNAME, json, {
      access: "public",
      allowOverwrite: true,
      addRandomSuffix: false,
      cacheControlMaxAge: 60,
      contentType: "application/json; charset=utf-8",
      token: env.blobReadWriteToken,
    });
    result = summary(snapshot, "vercel-blob", Buffer.byteLength(json), blob.downloadUrl);
  } else {
    if (process.env.NODE_ENV === "production") {
      throw new Error("BLOB_READ_WRITE_TOKEN 미설정 — 운영 환경에 통합대피소 JSON을 저장할 수 없습니다");
    }
    await fs.mkdir(path.dirname(LOCAL_SNAPSHOT_PATH), { recursive: true });
    const tempPath = `${LOCAL_SNAPSHOT_PATH}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(tempPath, json, "utf8");
    await fs.rename(tempPath, LOCAL_SNAPSHOT_PATH);
    result = summary(snapshot, "local-file", Buffer.byteLength(json), null);
  }

  memoryCache = { snapshot, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS };
  return result;
}

export async function getShelterSnapshotSummary(): Promise<ShelterSnapshotSummary | null> {
  try {
    if (env.blobReadWriteToken) {
      const { snapshot, metadata } = await loadFromBlob();
      memoryCache = { snapshot, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS };
      return summary(snapshot, "vercel-blob", metadata.size, metadata.downloadUrl);
    }
    const { snapshot, size } = await loadFromLocalFile();
    memoryCache = { snapshot, expiresAt: Date.now() + MEMORY_CACHE_TTL_MS };
    return summary(snapshot, "local-file", size, null);
  } catch (error) {
    if (isMissingSnapshotError(error)) return null;
    throw error;
  }
}

export function clearShelterSnapshotMemoryCache(): void {
  memoryCache = null;
}
