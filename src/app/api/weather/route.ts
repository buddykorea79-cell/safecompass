import { NextRequest, NextResponse } from "next/server";
import { getWeatherSnapshot } from "@/lib/kma";
import { logApiCall } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng 파라미터가 필요합니다" }, { status: 400 });
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
