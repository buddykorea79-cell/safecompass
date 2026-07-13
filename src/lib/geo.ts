// 위경도 ↔ 기상청 동네예보 격자좌표(nx, ny) 변환 (Lambert Conformal Conic)
// 상수 출처: 기상청 API 허브 공식 변환 알고리즘(공개된 표준 계수)

const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0; // 투영 위도1
const SLAT2 = 60.0; // 투영 위도2
const OLON = 126.0; // 기준점 경도
const OLAT = 38.0; // 기준점 위도
const XO = 43; // 기준점 X좌표
const YO = 136; // 기준점 Y좌표

const DEGRAD = Math.PI / 180.0;

export interface GridXY {
  nx: number;
  ny: number;
}

export function lonLatToGrid(lon: number, lat: number): GridXY {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD;
  const slat2 = SLAT2 * DEGRAD;
  const olon = OLON * DEGRAD;
  const olat = OLAT * DEGRAD;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  const rlat = lat * DEGRAD;
  const rlon = lon * DEGRAD;

  let ra = Math.tan(Math.PI * 0.25 + rlat * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = rlon - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);

  return { nx, ny };
}

// 두 좌표 사이 거리(m), Haversine
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * DEGRAD;
  const dLng = (lng2 - lng1) * DEGRAD;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * DEGRAD) * Math.cos(lat2 * DEGRAD) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function walkMinutes(meters: number): number {
  // 성인 평균 도보 속도 약 67m/분 기준
  return Math.max(1, Math.round(meters / 67));
}
