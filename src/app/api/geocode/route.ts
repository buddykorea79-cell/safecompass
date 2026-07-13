import { NextRequest, NextResponse } from "next/server";
import { coordToRegionLabel } from "@/lib/kakao";
import { nearestRegion } from "@/lib/regions";
import { logApiCall } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng 파라미터가 필요합니다" }, { status: 400 });
  }

  const start = Date.now();
  const result = await coordToRegionLabel(lat, lng);
  logApiCall({
    provider: "kakao",
    endpoint: "coordToRegionLabel",
    ok: !result.fallback,
    detail: result.message,
    durationMs: Date.now() - start,
  });

  // region_code는 항상 내부 시드 데이터의 최근접 지역 코드를 사용한다(판정엔진 등에서 안정적인 키로 쓰기 위함).
  const nearest = nearestRegion(lat, lng);

  if (!result.fallback && result.regionLabel) {
    return NextResponse.json({ label: result.regionLabel, region_code: nearest.region_code, source: "kakao" as const });
  }

  // 카카오 키가 없거나 실패하면 정적 시드 데이터 중 최근접 지역의 표기로 근사
  return NextResponse.json({
    label: nearest.label,
    region_code: nearest.region_code,
    source: "seed-approx" as const,
    message: result.message,
  });
}
