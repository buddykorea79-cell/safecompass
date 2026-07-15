// 행정안전부 재난안전데이터공유플랫폼(safetydata.go.kr) 어댑터
// 재난문자는 서비스별로 발급된 키를 각각 사용한다:
// - DSSP-IF-10748 재난문자(속보):   SAFETYDATA_SERVICE10748_KEY
// - DSSP-IF-00247 긴급재난문자:     SAFETYDATA_SERVICE00247_KEY
// - DSSP-IF-10941 통합대피소:       SAFETYDATA_SERVICE10941_KEY
// 응답은 V2 공통 포맷 { header: { resultCode, resultMsg, errorMsg }, body: [...] }을 따른다.

import { env, hasSafetydata00247, hasSafetydata10748, hasSafetydata10941 } from "./env";
import { REGIONS, regionKeywordMatch } from "./regions";
import { retainCurrentOfficialAlerts } from "./officialAlertRetention";
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

// 공식 알림 보관 정책은 KST 당일+전일이다. 시작일을 지정하지 않으면 공급자가
// 오래된 자료부터 내려주므로 첫 페이지에 최신 문자가 포함되지 않는다.
const MESSAGE_LOOKBACK_DAYS = 1;
const MESSAGE_PAGE_SIZE = 100;
const MESSAGE_PAGE_CONCURRENCY = 4;
// totalCount가 없는 비정상 응답에서 무한 조회를 막는다. 이 한도에 닿으면 일부만
// 반환하지 않고 명시적으로 실패시켜 운영 화면에서 공급자 장애를 확인할 수 있게 한다.
const MESSAGE_UNKNOWN_TOTAL_PAGE_LIMIT = 1_000;

function kstDateStr(daysAgo = 0): string {
  const now = new Date();
  const kst = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 9 * 60 * 60000);
  kst.setDate(kst.getDate() - daysAgo);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${kst.getFullYear()}${pad(kst.getMonth() + 1)}${pad(kst.getDate())}`;
}

// 포털의 "2024/07/14 08:30:00.000000000" 또는 YYYYMMDDHHmmss 형태를
// KST 기준 ISO 문자열로 정규화한다. 날짜가 없는 행을 현재 시각으로 위장하지 않는다.
function normalizeIssuedAt(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;

  const separated = value.match(
    /^(\d{4})[/-](\d{2})[/-](\d{2})(?:[ T](\d{2})(?::?(\d{2}))?(?::?(\d{2}))?)?/
  );
  if (separated) {
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = separated;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
  }

  const compact = value.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})?(\d{2})?)?$/);
  if (compact) {
    const [, y, mo, d, h = "00", mi = "00", s = "00"] = compact;
    return `${y}-${mo}-${d}T${h}:${mi}:${s}+09:00`;
  }

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
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
  else if (
    body &&
    typeof body === "object" &&
    (body.MNG_SN || body.SN || body.MSG_CN || body.MSTN_BRNE_NO || body.MSTN_BRNE_CN)
  )
    items = [body];
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

async function fetchMessageRows(
  serviceId: typeof EMERGENCY_MSG_SERVICE_ID | typeof BREAKING_MSG_SERVICE_ID,
  serviceKey: string,
  dateParameter: "crtDt" | "regDt"
): Promise<any[]> {
  const baseParams = {
    [dateParameter]: kstDateStr(MESSAGE_LOOKBACK_DAYS),
    numOfRows: String(MESSAGE_PAGE_SIZE),
  };
  const first = await callSafetydata(serviceId, serviceKey, { ...baseParams, pageNo: "1" });

  if (first.totalCount === null) {
    const rows = [...first.rows];
    let previous = first;
    for (let pageNo = 2; previous.rows.length >= MESSAGE_PAGE_SIZE; pageNo += 1) {
      if (pageNo > MESSAGE_UNKNOWN_TOTAL_PAGE_LIMIT) {
        throw new Error(
          `${serviceId} 응답에 totalCount가 없어 ${MESSAGE_UNKNOWN_TOTAL_PAGE_LIMIT}페이지에서 조회를 중단했습니다`
        );
      }
      previous = await callSafetydata(serviceId, serviceKey, {
        ...baseParams,
        pageNo: String(pageNo),
      });
      rows.push(...previous.rows);
    }
    return rows;
  }

  const totalPages = Math.max(1, Math.ceil(first.totalCount / MESSAGE_PAGE_SIZE));
  if (totalPages === 1) return first.rows;

  // 날짜 조건으로 KST 전일부터 범위를 제한한 뒤 그 범위의 모든 페이지를 조회한다.
  // 일부 페이지만 반환하면 전국 발송량이 많은 날 특정 지역 알림이 누락될 수 있다.
  const rows = [...first.rows];
  const pageNumbers = Array.from({ length: totalPages - 1 }, (_, index) => index + 2);

  for (let index = 0; index < pageNumbers.length; index += MESSAGE_PAGE_CONCURRENCY) {
    const batch = pageNumbers.slice(index, index + MESSAGE_PAGE_CONCURRENCY);
    const pages = await Promise.all(
      batch.map((pageNo) =>
        callSafetydata(serviceId, serviceKey, { ...baseParams, pageNo: String(pageNo) })
      )
    );
    for (const page of pages) rows.push(...page.rows);
  }
  return rows;
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

function normalizeRegionValues(raw: unknown): string[] {
  const values = Array.isArray(raw) ? raw : [raw];
  return Array.from(
    new Set(
      values
        .flatMap((value) => String(value ?? "").split(/[,;|]/))
        .map((value) => value.trim())
        .filter(Boolean)
    )
  );
}

const SIDO_ALIASES: Record<string, string[]> = {
  서울특별시: ["서울특별시", "서울시"],
  부산광역시: ["부산광역시", "부산시"],
  대구광역시: ["대구광역시", "대구시"],
  인천광역시: ["인천광역시", "인천시"],
  광주광역시: ["광주광역시"],
  대전광역시: ["대전광역시", "대전시"],
  울산광역시: ["울산광역시", "울산시"],
  세종특별자치시: ["세종특별자치시", "세종시"],
  경기도: ["경기도"],
  강원특별자치도: ["강원특별자치도", "강원도"],
  충청북도: ["충청북도", "충북"],
  충청남도: ["충청남도", "충남"],
  전북특별자치도: ["전북특별자치도", "전라북도", "전북"],
  전라남도: ["전라남도", "전남"],
  경상북도: ["경상북도", "경북"],
  경상남도: ["경상남도", "경남"],
  제주특별자치도: ["제주특별자치도", "제주도"],
};

function compactRegionText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, "");
}

/** DSSP-IF-10748에는 별도 수신지역 필드가 없어 공식 본문에서 지역을 보완 추출한다. */
export function extractBreakingMessageRegions(content: string): string[] {
  const compact = compactRegionText(content);
  if (!compact) return [];
  if (compact.includes("전국") || compact.includes("대한민국전역")) return ["전국"];

  // 속보 본문 끝의 대괄호 발신지역을 가장 신뢰한다. 알려진 시군구는 앱의 정식
  // 시도명을 붙이고, 통합 지자체처럼 아직 시드에 없는 명칭은 원문 그대로 보존한다.
  const bracketedRegions = Array.from(content.matchAll(/\[([^\]]+)]/g))
    .map((match) => match[1].trim())
    .filter(
      (value) =>
        /(?:특별시|특별자치시|특별자치도|광역시|[시군구도])$/.test(value) &&
        !/(국민안전처|행정안전부|기상청|소방청|경찰청)$/.test(value)
    );
  if (bracketedRegions.length > 0) {
    const resolved = bracketedRegions.flatMap((value) => {
      const token = compactRegionText(value);
      const regionMatches = REGIONS.filter(
        (region) =>
          compactRegionText(region.label) === token ||
          (region.sigungu && compactRegionText(region.sigungu) === token) ||
          (region.eupmyeondong && compactRegionText(region.eupmyeondong) === token)
      );
      if (regionMatches.length === 1) return [regionMatches[0].label];

      const sido = Object.entries(SIDO_ALIASES).find(([, aliases]) =>
        aliases.some((alias) => compactRegionText(alias) === token)
      )?.[0];
      return [sido ?? value];
    });
    return Array.from(new Set(resolved));
  }

  const matchedSidos = new Set(
    Object.entries(SIDO_ALIASES)
      .filter(([, aliases]) => aliases.some((alias) => compact.includes(compactRegionText(alias))))
      .map(([sido]) => sido)
  );
  const sigunguSidoCount = new Map<string, number>();
  for (const region of REGIONS) {
    if (!region.sigungu) continue;
    sigunguSidoCount.set(region.sigungu, (sigunguSidoCount.get(region.sigungu) ?? 0) + 1);
  }

  const found = new Set<string>();
  const matchedChildSidos = new Set<string>();
  for (const region of REGIONS) {
    if (region.eupmyeondong && compact.includes(compactRegionText(region.eupmyeondong))) {
      found.add(region.label);
      matchedChildSidos.add(region.sido);
      continue;
    }
    if (!region.sigungu) continue;

    const fullName = compactRegionText(region.sigungu);
    const stem = fullName.replace(/[시군구]$/, "");
    const duplicated = (sigunguSidoCount.get(region.sigungu) ?? 0) > 1;
    const hasSidoContext = matchedSidos.has(region.sido);
    const exactMatch = compact.includes(fullName);
    const contextualStemMatch = hasSidoContext && stem.length >= 2 && compact.includes(stem);
    if ((!exactMatch && !contextualStemMatch) || (duplicated && !hasSidoContext)) continue;

    found.add(`${region.sido} ${region.sigungu}`);
    matchedChildSidos.add(region.sido);
  }

  for (const sido of matchedSidos) {
    if (!matchedChildSidos.has(sido)) found.add(sido);
  }
  if (found.size > 0) return Array.from(found);

  const maritimeRegion = content.match(
    /((?:동해|서해|남해|제주)[가-힣]*(?:앞바다|먼바다|전해상|해상))/
  )?.[1];
  return maritimeRegion ? [maritimeRegion] : ["지역 미제공 · 본문 참조"];
}

export function normalizeEmergencyMessageRow(row: any, index = 0): DisasterMessage | null {
  const content = String(row?.MSG_CN ?? row?.msgCn ?? "").trim();
  const issuedAt = normalizeIssuedAt(row?.CRT_DT ?? row?.crtDt ?? row?.REG_YMD ?? row?.regYmd);
  if (!content || !issuedAt) return null;
  return {
    id: String(row?.SN ?? row?.sn ?? row?.MD101_SN ?? row?.md101Sn ?? `${issuedAt}-${index}`),
    msg_type: classifyMsgType(
      row?.EMRG_STEP_NM ?? row?.emrgStepNm,
      row?.DST_SE_NM ?? row?.dstSeNm ?? content
    ),
    region_codes: normalizeRegionValues(
      row?.RCPTN_RGN_NM ?? row?.rcptnRgnNm ?? row?.RGN_NM ?? row?.rgnNm ?? row?.REG_ID ?? row?.regId
    ),
    content,
    issued_at: issuedAt,
    source: "safetydata",
    service: "00247",
  };
}

export function normalizeBreakingMessageRow(row: any, index = 0): DisasterMessage | null {
  const content = String(row?.MSTN_BRNE_CN ?? row?.mstnBrneCn ?? "").trim();
  const issuedAt = normalizeIssuedAt(row?.REG_DT ?? row?.regDt);
  if (!content || !issuedAt) return null;
  const suppliedRegions = normalizeRegionValues(
    row?.RCPTN_RGN_NM ?? row?.rcptnRgnNm ?? row?.RGN_NM ?? row?.rgnNm
  );
  return {
    id: String(
      row?.MSTN_BRNE_NO ??
        row?.mstnBrneNo ??
        row?.MSTN_ID ??
        row?.mstnId ??
        `${issuedAt}-${index}`
    ),
    msg_type: "재난문자(속보)",
    region_codes: suppliedRegions.length > 0 ? suppliedRegions : extractBreakingMessageRegions(content),
    content,
    issued_at: issuedAt,
    source: "safetydata",
    service: "10748",
  };
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
    const rows = await fetchMessageRows(
      EMERGENCY_MSG_SERVICE_ID,
      env.safetydataService00247Key,
      "crtDt"
    );
    const messages = rows
      .map((row: any, index: number) => normalizeEmergencyMessageRow(row, index))
      .filter((message): message is DisasterMessage => message !== null);
    return {
      messages: sortAndDedupe(filterByRegion(retainCurrentOfficialAlerts(messages), regionKeyword)),
      fallback: false,
    };
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
    const rows = await fetchMessageRows(
      BREAKING_MSG_SERVICE_ID,
      env.safetydataService10748Key,
      "regDt"
    );
    const messages = rows
      .map((row: any, index: number) => normalizeBreakingMessageRow(row, index))
      .filter((message): message is DisasterMessage => message !== null);
    return {
      messages: sortAndDedupe(filterByRegion(retainCurrentOfficialAlerts(messages), regionKeyword)),
      fallback: false,
    };
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
  const anyFailed = emergency.fallback || breaking.fallback;
  const partialError = [
    emergency.fallback ? `긴급재난문자: ${emergency.message}` : "",
    breaking.fallback ? `재난문자(속보): ${breaking.message}` : "",
  ]
    .filter(Boolean)
    .join(" / ");
  return {
    messages,
    fallback: anyFailed,
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
