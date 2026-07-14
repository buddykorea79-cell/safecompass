// 카카오 로컬/맵 어댑터
// - 카테고리 검색(병원 HP8/약국 PM9): https://dapi.kakao.com/v2/local/search/category.json
// - 좌표→행정동 변환: https://dapi.kakao.com/v2/local/geo/coord2regioncode.json
// - 길찾기 딥링크: https://map.kakao.com/link/to/{name},{lat},{lng}

import { env, hasKakaoRest } from "./env";
import { distanceMeters } from "./geo";
import type { Place } from "@/types";

const LOCAL_BASE = "https://dapi.kakao.com/v2/local";
const KAKAO_FETCH_TIMEOUT_MS = 8_000;

async function callKakao(path: string, params: Record<string, string>) {
  const url = new URL(`${LOCAL_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `KakaoAK ${env.kakaoRestApiKey}` },
    cache: "no-store",
    signal: AbortSignal.timeout(KAKAO_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`카카오 로컬 API 오류: HTTP ${res.status}`);
  }
  return res.json();
}

export interface PlaceSearchResult {
  places: Place[];
  fallback: boolean;
  message?: string;
}

export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  category: "hospital" | "pharmacy",
  radiusMeters = 3000
): Promise<PlaceSearchResult> {
  if (!hasKakaoRest()) {
    return { places: [], fallback: true, message: "KAKAO_REST_API_KEY 미설정 — 병원·약국 정보를 불러올 수 없습니다" };
  }
  try {
    const code = category === "hospital" ? "HP8" : "PM9";
    const json = await callKakao("/search/category.json", {
      category_group_code: code,
      x: String(lng),
      y: String(lat),
      radius: String(radiusMeters),
      sort: "distance",
      size: "15",
    });

    const places: Place[] = (json.documents ?? []).map((doc: any) => ({
      id: doc.id,
      name: doc.place_name,
      category,
      address: doc.road_address_name || doc.address_name,
      phone: doc.phone || undefined,
      lat: Number(doc.y),
      lng: Number(doc.x),
      distanceMeters: distanceMeters(lat, lng, Number(doc.y), Number(doc.x)),
    }));

    return { places, fallback: false };
  } catch (err) {
    return { places: [], fallback: true, message: err instanceof Error ? err.message : "장소 검색 중 오류가 발생했습니다" };
  }
}

export interface RegionCodeResult {
  regionLabel: string | null;
  fallback: boolean;
  message?: string;
}

export async function coordToRegionLabel(lat: number, lng: number): Promise<RegionCodeResult> {
  if (!hasKakaoRest()) {
    return { regionLabel: null, fallback: true, message: "KAKAO_REST_API_KEY 미설정" };
  }
  try {
    const json = await callKakao("/geo/coord2regioncode.json", { x: String(lng), y: String(lat) });
    const doc = (json.documents ?? []).find((d: any) => d.region_type === "H") ?? json.documents?.[0];
    if (!doc) return { regionLabel: null, fallback: true, message: "행정구역 정보를 찾을 수 없습니다" };
    const label = [doc.region_1depth_name, doc.region_2depth_name, doc.region_3depth_name].filter(Boolean).join(" ");
    return { regionLabel: label, fallback: false };
  } catch (err) {
    return { regionLabel: null, fallback: true, message: err instanceof Error ? err.message : "좌표 변환 중 오류가 발생했습니다" };
  }
}

export function kakaoDirectionsUrl(name: string, lat: number, lng: number): string {
  return `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
}
