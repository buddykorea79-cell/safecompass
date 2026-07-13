import { NextRequest, NextResponse } from "next/server";
import { searchNearbyPlaces } from "@/lib/kakao";
import { walkMinutes } from "@/lib/geo";
import { logApiCall } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const category = req.nextUrl.searchParams.get("category");
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (category !== "hospital" && category !== "pharmacy")) {
    return NextResponse.json({ error: "lat/lng/category(hospital|pharmacy) 파라미터가 필요합니다" }, { status: 400 });
  }

  const start = Date.now();
  const result = await searchNearbyPlaces(lat, lng, category);
  logApiCall({
    provider: "kakao",
    endpoint: `searchNearbyPlaces:${category}`,
    ok: !result.fallback,
    detail: result.message,
    durationMs: Date.now() - start,
  });

  const places = result.places.map((p) => ({ ...p, walkMinutes: p.distanceMeters ? walkMinutes(p.distanceMeters) : null }));

  return NextResponse.json({ places, fallback: result.fallback, message: result.message });
}
