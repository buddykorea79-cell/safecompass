// 행정안전부 재난안전데이터포털(safetydata.go.kr) 어댑터
// 주의: 이 포털의 정확한 REST 스펙(엔드포인트 경로/응답 필드명)은 실제 서비스키 발급 후에만
// 확인 가능하다. 아래는 공개적으로 알려진 "재난안전데이터 공유 플랫폼 Open API" 표준 패턴
// (base: https://www.safetydata.go.kr/V2/api/{serviceId}, serviceKey 파라미터)을 따른
// best-effort 구현이며, 실제 키 등록 후 필드 매핑 보정이 필요할 수 있다(설계서 15장 리스크 동일 성격).

import { env, hasSafetydata } from "./env";
import type { DisasterMessage, Shelter, ShelterType } from "@/types";

const BASE_URL = "https://www.safetydata.go.kr/V2/api";

// 긴급재난문자(수집) — DSSP-IF-00247 (재난문자방송 발송현황)
const DISASTER_MSG_SERVICE_ID = "DSSP-IF-00247";
// 통합대피소 정보 — DSSP-IF-10941 (지진옥외대피장소) 등 대피소 계열 서비스 중 대표값 사용
const SHELTER_SERVICE_ID = "DSSP-IF-10941";

async function callSafetydata<T = any>(serviceId: string, params: Record<string, string>): Promise<T[]> {
  const url = new URL(`${BASE_URL}/${serviceId}`);
  url.searchParams.set("serviceKey", env.safetydataServiceKey);
  url.searchParams.set("returnType", "json");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "100");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`재난안전데이터포털 응답 오류 (${serviceId}): HTTP ${res.status}`);
  }
  const json = await res.json();
  const body = json?.body ?? json?.result?.body;
  if (!body) return [];
  return Array.isArray(body) ? body : [body];
}

function classifyMsgType(raw: string | undefined): DisasterMessage["msg_type"] {
  if (!raw) return "재난문자";
  if (raw.includes("위급")) return "위급재난문자";
  if (raw.includes("긴급")) return "긴급재난문자";
  if (raw.includes("안전안내")) return "안전안내문자";
  return "재난문자";
}

export interface DisasterMessageResult {
  messages: DisasterMessage[];
  fallback: boolean;
  message?: string;
}

// regionKeyword: "세종" 등 시도/시군구 명칭 일부로 필터링(포털이 지역코드 대신 지역명을 담는 경우 대비)
export async function getDisasterMessages(regionKeyword?: string): Promise<DisasterMessageResult> {
  if (!hasSafetydata()) {
    return { messages: [], fallback: true, message: "SAFETYDATA_SERVICE_KEY 미설정 — 재난문자를 불러올 수 없습니다" };
  }
  try {
    const rows = await callSafetydata(DISASTER_MSG_SERVICE_ID, {});
    const messages: DisasterMessage[] = rows
      .map((row: any, idx: number) => ({
        id: String(row.SN ?? row.id ?? idx),
        msg_type: classifyMsgType(row.MSG_CN ?? row.DST_SE_NM),
        region_codes: [String(row.RCPTN_RGN_NM ?? row.REG_ID ?? "")].filter(Boolean),
        content: String(row.MSG_CN ?? row.msgCn ?? ""),
        issued_at: String(row.CRT_DT ?? row.regYmd ?? new Date().toISOString()),
        source: "safetydata" as const,
      }))
      .filter((m) => (regionKeyword ? m.region_codes.some((r) => r.includes(regionKeyword)) || m.content.includes(regionKeyword) : true));
    return { messages, fallback: false };
  } catch (err) {
    return { messages: [], fallback: true, message: err instanceof Error ? err.message : "재난문자 조회 중 오류가 발생했습니다" };
  }
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
    const rows = await callSafetydata(SHELTER_SERVICE_ID, {});
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
