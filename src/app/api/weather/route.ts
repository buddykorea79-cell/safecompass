import { NextRequest, NextResponse } from "next/server";
import { getWeatherSnapshot } from "@/lib/kma";
import { logApiCall } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  const rawLat = req.nextUrl.searchParams.get("lat");
  const rawLng = req.nextUrl.searchParams.get("lng");
  const lat = rawLat?.trim() ? Number(rawLat) : Number.NaN;
  const lng = rawLng?.trim() ? Number(rawLng) : Number.NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "유효한 lat/lng 파라미터가 필요합니다" }, { status: 400 });
  }

  const start = Date.now();
  const snapshot = await getWeatherSnapshot(lat, lng);
  logApiCall({
    provider: "kma",
    endpoint: "getWeatherSnapshot",
    ok: !snapshot.fallback,
    detail: snapshot.message,
    durationMs: Date.now() - start,
  });

  return NextResponse.json(snapshot);
}
