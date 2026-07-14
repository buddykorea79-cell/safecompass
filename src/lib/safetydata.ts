// 행정안전부 재난안전데이터포털(safetydata.go.kr) 어댑터
// 재난문자는 서비스별로 발급된 키를 각각 사용한다:
// - DSSP-IF-10748 재난문자(속보):   SAFETYDATA_SERVICE10748_KEY
// - DSSP-IF-00247 긴급재난문자:     SAFETYDATA_SERVICE00247_KEY
// - 대피소(DSSP-IF-10941) 등 기타:  SAFETYDATA_SERVICE_KEY (공용/레거시)
// 응답은 V2 공통 포맷 { header: { resultCode, resultMsg, errorMsg }, body: [...] }을 따른다.

import { env, hasSafetydata, hasSafetydata00247, hasSafetydata10748 } from "./env";
import { regionKeywordMatch } from "./regions";
import type { DisasterMessage, Shelter, ShelterType } from "@/types";

const BASE_URL = "https://www.safetydata.go.kr/V2/api";

// 재난문자(속보) — DSSP-IF-10748
const BREAKING_MSG_SERVICE_ID = "DSSP-IF-10748";
// 긴급재난문자 — DSSP-IF-00247 (재난문자방송 발송현황)
const EMERGENCY_MSG_SERVICE_ID = "DSSP-IF-00247";
// 통합대피소 정보 — DSSP-IF-10941 (지진옥외대피장소) 등 대피소 계열 서비스 중 대표값 사용
const SHELTER_SERVICE_ID = "DSSP-IF-10941";

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

async function callSafetydata<T = any>(
  serviceId: string,
  serviceKey: string,
  params: Record<string, string>
): Promise<T[]> {
  const url = new URL(`${BASE_URL}/${serviceId}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("returnType", "json");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`재난안전데이터포털 응답 오류 (${serviceId}): HTTP ${res.status}`);
  }
  const json = await res.json();
  // 포털은 인증 실패 등도 HTTP 200 + header.resultCode로 내려주므로 반드시 확인
  const header = json?.header ?? json?.result?.header;
  if (header && header.resultCode && header.resultCode !== "00") {
    throw new Error(
      `재난안전데이터포털 오류 (${serviceId}): ${header.errorMsg || header.resultMsg || header.resultCode}`
    );
  }
  const body = json?.body ?? json?.result?.body;
  if (!body) return [];
  return Array.isArray(body) ? body : [body];
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
    const rows = await callSafetydata(EMERGENCY_MSG_SERVICE_ID, env.safetydataService00247Key, {
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
    const rows = await callSafetydata(BREAKING_MSG_SERVICE_ID, env.safetydataService10748Key, {
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

function classifyShelterType(raw: string | undefined): ShelterType {
  if (!raw) return "일반";
  if (raw.includes("민방위")) return "민방위대피소";
  if (raw.includes("지진")) return "지진옥외대피장소";
  if (raw.includes("이재민")) return "이재민임시주거시설";
  if (raw.includes("무더위")) return "무더위쉼터";
  if (raw.includes("한파")) return "한파쉼터";
  return "일반";
}

export interface ShelterResult {
  shelters: Shelter[];
  fallback: boolean;
  message?: string;
}

export async function getNearbyShelters(lat: number, lng: number): Promise<ShelterResult> {
  if (!hasSafetydata()) {
    return { shelters: [], fallback: true, message: "SAFETYDATA_SERVICE_KEY 미설정 — 대피소 정보를 불러올 수 없습니다" };
  }
  try {
    const rows = await callSafetydata(SHELTER_SERVICE_ID, env.safetydataServiceKey, {});
    const shelters: Shelter[] = rows
      .map((row: any, idx: number) => ({
        id: String(row.MNG_SN ?? row.id ?? idx),
        name: String(row.REARE_NM ?? row.FCLTY_NM ?? "대피소"),
        shelter_type: classifyShelterType(row.SHLT_SE_NM ?? row.FCLTY_SE_NM),
        address: String(row.RONA_DADDR ?? row.LOTNO_ADDR ?? ""),
        lat: Number(row.LAT ?? row.LA ?? 0),
        lng: Number(row.LOT ?? row.LO ?? 0),
        capacity: row.ACPT_PSN_NMPR ? Number(row.ACPT_PSN_NMPR) : null,
      }))
      .filter((s) => s.lat && s.lng);
    return { shelters, fallback: false };
  } catch (err) {
    return { shelters: [], fallback: true, message: err instanceof Error ? err.message : "대피소 조회 중 오류가 발생했습니다" };
  }
}
