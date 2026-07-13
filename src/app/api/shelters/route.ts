import { NextRequest, NextResponse } from "next/server";
import { getNearbyShelters } from "@/lib/safetydata";
import { distanceMeters, walkMinutes } from "@/lib/geo";
import { logApiCall } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat/lng 파라미터가 필요합니다" }, { status: 400 });
  }

  const start = Date.now();
  const result = await getNearbyShelters(lat, lng);
  logApiCall({
    provider: "safetydata",
    endpoint: "getNearbyShelters",
    ok: !result.fallback,
    detail: result.message,
    durationMs: Date.now() - start,
  });

  const shelters = result.shelters
    .map((s) => {
      const d = distanceMeters(lat, lng, s.lat, s.lng);
      return { ...s, distanceMeters: d, walkMinutes: walkMinutes(d) };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 30);

  return NextResponse.json({ shelters, fallback: result.fallback, message: result.message });
}
