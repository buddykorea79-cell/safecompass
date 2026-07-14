// 행정안전부 재난안전데이터공유플랫폼(safetydata.go.kr) 어댑터
// 재난문자는 서비스별로 발급된 키를 각각 사용한다:
// - DSSP-IF-10748 재난문자(속보):   SAFETYDATA_SERVICE10748_KEY
// - DSSP-IF-00247 긴급재난문자:     SAFETYDATA_SERVICE00247_KEY
// - DSSP-IF-10941 통합대피소:       SAFETYDATA_SERVICE10941_KEY
// 응답은 V2 공통 포맷 { header: { resultCode, resultMsg, errorMsg }, body: [...] }을 따른다.

import { env, hasSafetydata00247, hasSafetydata10748, hasSafetydata10941 } from "./env";
import { regionKeywordMatch } from "./regions";
import type { DisasterMessage, Shelter, ShelterType, ShelterTypeCode } from "@/types";

const BASE_URL = "https://www.safetydata.go.kr/V2/api";
const SAFETYDATA_FETCH_TIMEOUT_MS = 8_000;

// 재난문자(속보) — DSSP-IF-10748
const BREAKING_MSG_SERVICE_ID = "DSSP-IF-10748";
// 긴급재난문자 — DSSP-IF-00247 (재난문자방송 발송현황)
const EMERGENCY_MSG_SERVICE_ID = "DSSP-IF-00247";
// 통합대피소 — 한파/무더위/지진옥외/지진해일 긴급대피장소를 한 API에서 제공한다.
export const SHELTER_SERVICE_ID = "DSSP-IF-10941";
const SHELTER_PAGE_SIZE = 1_000;
const SHELTER_MAX_PAGES_PER_TYPE = 100;

// 재난문자 조회 시작일: 최근 N일치만 요청 (crtDt 미지정 시 과거 데이터부터 내려와 최신 문자가 잘림)
const MESSAGE_LOOKBACK_DAYS = 3;

function kstDateStr(daysAgo = 0): string {
  const now = new Date();
  const kst = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 60 * 60000);
  kst.setDate(kst.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getFullYear()}${pad(kst.getMonth() + 1)}${pad(kst.getDate())}`;
}

// 포털의 "2024/07/14 08:30:00" 형태를 KST 기준 ISO 문자열로 정규화 (서버가 UTC여도 시각이 밀리지 않게)
function normalizeIssuedAt(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const m = String(raw).match(/^(\d{4})[/-](\d{2})[/-](\d{2})[ T]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!m) return String(raw);
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
}

interface SafetydataPage<T> {
  rows: T[];
  totalCount: number | null;
}

function redactSafetydataError(raw: unknown, serviceKey: string): string {
  let message = String(raw ?? "알 수 없는 오류");
  for (const secret of [serviceKey, encodeURIComponent(serviceKey)].filter(Boolean)) {
    message = message.split(secret).join("[REDACTED]");
  }
  return message
    .replace(/([?&](?:serviceKey)=)[^&\s]*/gi, "$1[REDACTED]")
    .slice(0, 300);
}

function parseSafetydataBody<T>(json: any, serviceId: string): SafetydataPage<T> {
  const envelope = json?.result && typeof json.result === "object" ? json.result : json;
  const body = envelope?.body;
  const totalCountRaw = envelope?.totalCount ?? body?.totalCount ?? json?.totalCount;
  const parsedTotal = Number(totalCountRaw);
  const totalCount = Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : null;

  if (body === null && totalCount === 0) return { rows: [], totalCount };
  if (body === undefined) {
    throw new Error(`재난안전데이터공유플랫폼 응답 형식 오류 (${serviceId}): body가 없습니다`);
  }

  let items: unknown;
  if (Array.isArray(body)) items = body;
  else if (Array.isArray(body?.items)) items = body.items;
  else if (Array.isArray(body?.item)) items = body.item;
  else if (Array.isArray(body?.items?.item)) items = body.items.item;
  else if (body?.items?.item && typeof body.items.item === "object") items = [body.items.item];
  else if (body?.item && typeof body.item === "object") items = [body.item];
  else if (body?.items?.item == null && totalCount === 0) items = [];
  else if (body && typeof body === "object" && (body.MNG_SN || body.SN || body.MSG_CN)) items = [body];
  else {
    throw new Error(`재난안전데이터공유플랫폼 응답 형식 오류 (${serviceId}): body를 해석할 수 없습니다`);
  }
  return { rows: items as T[], totalCount };
}

async function callSafetydata<T = any>(
  serviceId: string,
  serviceKey: string,
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<SafetydataPage<T>> {
  const url = new URL(`${BASE_URL}/${serviceId}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("returnType", "json");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(SAFETYDATA_FETCH_TIMEOUT_MS),
    });
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error(`재난안전데이터공유플랫폼 응답 시간 초과 (${serviceId})`);
    }
    throw new Error(`재난안전데이터공유플랫폼 연결 오류 (${serviceId})`);
  }
  if (!res.ok) {
    throw new Error(`재난안전데이터공유플랫폼 응답 오류 (${serviceId}): HTTP ${res.status}`);
  }
  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new Error(`재난안전데이터공유플랫폼 응답 형식 오류 (${serviceId}): JSON이 아닙니다`);
  }
  // 포털은 인증 실패 등도 HTTP 200 + header.resultCode로 내려주므로 반드시 확인
  const header = json?.header ?? json?.result?.header;
  const resultCode = header?.resultCode == null ? "" : String(header.resultCode);
  if (resultCode && resultCode !== "00" && resultCode !== "0") {
    throw new Error(
      `재난안전데이터공유플랫폼 오류 (${serviceId}): ${redactSafetydataError(
        header.errorMsg || header.resultMsg || resultCode,
        serviceKey
      )}`
    );
  }
  return parseSafetydataBody<T>(json, serviceId);
}

// 긴급단계명(EMRG_STEP_NM: 위급/긴급/안전안내)을 우선 사용하고, 없으면 본문에서 추정
function classifyMsgType(stepName: string | undefined, fallbackText?: string): DisasterMessage["msg_type"] {
  const raw = stepName || fallbackText;
  if (!raw) return "긴급재난문자";
  if (raw.includes("위급")) return "위급재난문자";
  if (raw.includes("긴급")) return "긴급재난문자";
  if (raw.includes("안전안내")) return "안전안내문자";
  return "긴급재난문자";
}

export interface DisasterMessageResult {
  messages: DisasterMessage[];
  fallback: boolean;
  message?: string;
}

function filterByRegion(messages: DisasterMessage[], regionKeyword?: string): DisasterMessage[] {
  if (!regionKeyword) return messages;
  return messages.filter(
    (m) => m.region_codes.some((r) => regionKeywordMatch(r, regionKeyword)) || m.content.includes(regionKeyword)
  );
}

function sortAndDedupe(messages: DisasterMessage[]): DisasterMessage[] {
  const seen = new Set<string>();
  return messages
    .sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime())
    .filter((m) => {
      const key = `${m.service ?? ""}-${m.id}-${m.content.slice(0, 40)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// 긴급재난문자 (DSSP-IF-00247)
export async function getEmergencyMessages(regionKeyword?: string): Promise<DisasterMessageResult> {
  if (!hasSafetydata00247()) {
    return {
      messages: [],
      fallback: true,
      message: "SAFETYDATA_SERVICE00247_KEY 미설정 — 긴급재난문자를 불러올 수 없습니다",
    };
  }
  try {
    const { rows } = await callSafetydata(EMERGENCY_MSG_SERVICE_ID, env.safetydataService00247Key, {
      crtDt: kstDateStr(MESSAGE_LOOKBACK_DAYS),
    });
    const messages: DisasterMessage[] = rows.map((row: any, idx: number) => ({
      id: String(row.SN ?? row.MD101_SN ?? row.id ?? idx),
      msg_type: classifyMsgType(row.EMRG_STEP_NM ?? row.emrgStepNm, row.DST_SE_NM ?? row.MSG_CN),
      region_codes: [String(row.RCPTN_RGN_NM ?? row.rcptnRgnNm ?? row.REG_ID ?? "")].filter(Boolean),
      content: String(row.MSG_CN ?? row.msgCn ?? ""),
      issued_at: normalizeIssuedAt(row.CRT_DT ?? row.crtDt ?? row.REG_YMD ?? row.regYmd),
      source: "safetydata" as const,
      service: "00247" as const,
    }));
    return { messages: sortAndDedupe(filterByRegion(messages, regionKeyword)), fallback: false };
  } catch (err) {
    return {
      messages: [],
      fallback: true,
      message: err instanceof Error ? err.message : "긴급재난문자 조회 중 오류가 발생했습니다",
    };
  }
}

// 재난문자(속보) (DSSP-IF-10748)
export async function getBreakingMessages(regionKeyword?: string): Promise<DisasterMessageResult> {
  if (!hasSafetydata10748()) {
    return {
      messages: [],
      fallback: true,
      message: "SAFETYDATA_SERVICE10748_KEY 미설정 — 재난문자(속보)를 불러올 수 없습니다",
    };
  }
  try {
    const { rows } = await callSafetydata(BREAKING_MSG_SERVICE_ID, env.safetydataService10748Key, {
      crtDt: kstDateStr(MESSAGE_LOOKBACK_DAYS),
    });
    const messages: DisasterMessage[] = rows.map((row: any, idx: number) => ({
      id: String(row.SN ?? row.MD101_SN ?? row.id ?? idx),
      msg_type: "재난문자(속보)" as const,
      region_codes: [String(row.RCPTN_RGN_NM ?? row.rcptnRgnNm ?? row.RGN_NM ?? row.REG_ID ?? "")].filter(Boolean),
      content: String(row.MSG_CN ?? row.msgCn ?? row.CN ?? row.TTL ?? ""),
      issued_at: normalizeIssuedAt(row.CRT_DT ?? row.crtDt ?? row.REG_YMD ?? row.regYmd),
      source: "safetydata" as const,
      service: "10748" as const,
    }));
    return { messages: sortAndDedupe(filterByRegion(messages, regionKeyword)), fallback: false };
  } catch (err) {
    return {
      messages: [],
      fallback: true,
      message: err instanceof Error ? err.message : "재난문자(속보) 조회 중 오류가 발생했습니다",
    };
  }
}

// 두 서비스를 병렬 조회해 병합. 한쪽 키만 있어도 그쪽 데이터는 정상 제공한다.
export async function getDisasterMessages(regionKeyword?: string): Promise<DisasterMessageResult> {
  const [emergency, breaking] = await Promise.all([
    getEmergencyMessages(regionKeyword),
    getBreakingMessages(regionKeyword),
  ]);
  const messages = sortAndDedupe([...emergency.messages, ...breaking.messages]);
  const bothFailed = emergency.fallback && breaking.fallback;
  const partialError = [
    emergency.fallback ? `긴급재난문자: ${emergency.message}` : "",
    breaking.fallback ? `재난문자(속보): ${breaking.message}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  return {
    messages,
    fallback: bothFailed,
    message: partialError || undefined,
  };
}

const SHELTER_TYPE_BY_CODE: Record<ShelterTypeCode, ShelterType> = {
  "1": "한파쉼터",
  "2": "무더위쉼터",
  "3": "지진옥외대피장소",
  "4": "지진해일긴급대피장소",
};

function toShelterTypeCode(raw: unknown): ShelterTypeCode | undefined {
  const code = String(raw ?? "").trim();
  return code === "1" || code === "2" || code === "3" || code === "4" ? code : undefined;
}

function classifyShelterType(code: ShelterTypeCode | undefined, rawName: string): ShelterType {
  if (code) return SHELTER_TYPE_BY_CODE[code];
  if (rawName.includes("지진해일")) return "지진해일긴급대피장소";
  if (rawName.includes("지진")) return "지진옥외대피장소";
  if (rawName.includes("무더위")) return "무더위쉼터";
  if (rawName.includes("한파")) return "한파쉼터";
  return "일반";
}

function validCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export interface IntegratedShelterDownload {
  source: typeof SHELTER_SERVICE_ID;
  fetchedAt: string;
  rawCount: number;
  validCount: number;
  skippedCount: number;
  typeCounts: Record<ShelterTypeCode, number>;
  shelters: Shelter[];
}

export function normalizeIntegratedShelterRow(
  row: any,
  expectedCode?: ShelterTypeCode
): Shelter | null {
  const shelterLat = Number(row?.LAT);
  const shelterLng = Number(row?.LOT);
  const name = String(row?.REARE_NM ?? "").trim();
  const code = toShelterTypeCode(row?.SHLT_SE_CD) ?? expectedCode;
  const managementId = String(row?.MNG_SN ?? "").trim();
  if (!name || !code || !managementId || !validCoordinate(shelterLat, shelterLng)) return null;

  const typeName = String(row?.SHLT_SE_NM ?? "").trim();
  return {
    id: `${code}:${managementId}`,
    name,
    shelter_type: classifyShelterType(code, typeName),
    shelter_type_code: code,
    shelter_type_name: typeName || undefined,
    address: String(row?.RONA_DADDR ?? "").trim(),
    lat: shelterLat,
    lng: shelterLng,
    source: SHELTER_SERVICE_ID,
  };
}

function shouldRetryShelterError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP (?:429|5\d\d)|시간 초과|연결 오류/.test(message);
}

async function callShelterPage(
  code: ShelterTypeCode,
  pageNo: number,
  numOfRows = SHELTER_PAGE_SIZE
): Promise<SafetydataPage<any>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await callSafetydata<any>(SHELTER_SERVICE_ID, env.safetydataService10941Key, {
        pageNo: String(pageNo),
        numOfRows: String(numOfRows),
        shlt_se_cd: code,
      });
    } catch (error) {
      lastError = error;
      if (attempt === 2 || !shouldRetryShelterError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function fetchShelterRowsByType(code: ShelterTypeCode): Promise<any[]> {
  const rows: any[] = [];
  let totalCount: number | null = null;
  let previousSignature = "";

  for (let pageNo = 1; pageNo <= SHELTER_MAX_PAGES_PER_TYPE; pageNo += 1) {
    const page = await callShelterPage(code, pageNo);
    totalCount = page.totalCount ?? totalCount;
    if (page.rows.length === 0) {
      if (totalCount !== null && rows.length !== totalCount) {
        throw new Error(`통합대피소 ${code}번 유형 수집 불완전: ${rows.length}/${totalCount}건`);
      }
      break;
    }

    const first = page.rows[0]?.MNG_SN ?? "";
    const last = page.rows.at(-1)?.MNG_SN ?? "";
    const signature = `${page.rows.length}:${first}:${last}`;
    if (pageNo > 1 && signature === previousSignature) {
      throw new Error(`통합대피소 ${code}번 유형 페이지가 반복되어 수집을 중단했습니다`);
    }
    previousSignature = signature;
    rows.push(...page.rows);

    if (totalCount !== null && rows.length >= totalCount) {
      if (rows.length !== totalCount) {
        throw new Error(`통합대피소 ${code}번 유형 건수 불일치: ${rows.length}/${totalCount}건`);
      }
      return rows;
    }
    if (totalCount === null && page.rows.length < SHELTER_PAGE_SIZE) return rows;
    if (pageNo === SHELTER_MAX_PAGES_PER_TYPE) {
      throw new Error(`통합대피소 ${code}번 유형이 최대 페이지 수를 초과했습니다`);
    }
  }
  return rows;
}

export async function testIntegratedShelterSource(): Promise<{
  ok: boolean;
  source: typeof SHELTER_SERVICE_ID;
  sample: Shelter | null;
}> {
  if (!hasSafetydata10941()) {
    throw new Error("SAFETYDATA_SERVICE10941_KEY 미설정 — 통합대피소 원본을 테스트할 수 없습니다");
  }
  const page = await callShelterPage("1", 1, 1);
  return {
    ok: true,
    source: SHELTER_SERVICE_ID,
    sample: page.rows[0] ? normalizeIntegratedShelterRow(page.rows[0], "1") : null,
  };
}

export async function fetchAllIntegratedShelters(): Promise<IntegratedShelterDownload> {
  if (!hasSafetydata10941()) {
    throw new Error("SAFETYDATA_SERVICE10941_KEY 미설정 — 통합대피소 JSON을 만들 수 없습니다");
  }

  const codes: ShelterTypeCode[] = ["1", "2", "3", "4"];
  const results = await Promise.all(codes.map(async (code) => ({ code, rows: await fetchShelterRowsByType(code) })));
  const rawCount = results.reduce((sum, result) => sum + result.rows.length, 0);
  const seen = new Set<string>();
  const shelters: Shelter[] = [];
  const typeCounts: Record<ShelterTypeCode, number> = { "1": 0, "2": 0, "3": 0, "4": 0 };
  let skippedCount = 0;

  for (const { code, rows } of results) {
    for (const row of rows) {
      const shelter = normalizeIntegratedShelterRow(row, code);
      if (!shelter || seen.has(shelter.id)) {
        skippedCount += 1;
        continue;
      }
      seen.add(shelter.id);
      shelters.push(shelter);
      typeCounts[code] += 1;
    }
  }

  shelters.sort((a, b) => a.id.localeCompare(b.id, "ko"));
  return {
    source: SHELTER_SERVICE_ID,
    fetchedAt: new Date().toISOString(),
    rawCount,
    validCount: shelters.length,
    skippedCount,
    typeCounts,
    shelters,
  };
}
