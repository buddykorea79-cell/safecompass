import { NextRequest, NextResponse } from "next/server";
import { loadShelterSnapshot } from "@/lib/shelterSnapshot";
import { distanceMeters, walkMinutes } from "@/lib/geo";
import { logApiCall } from "@/lib/apiLog";

const DEFAULT_SHELTER_RADIUS_METERS = 3_000;
const MAX_SHELTER_RADIUS_METERS = 20_000;

export async function GET(req: NextRequest) {
  const rawLat = req.nextUrl.searchParams.get("lat");
  const rawLng = req.nextUrl.searchParams.get("lng");
  const rawRadiusKm = req.nextUrl.searchParams.get("radius_km");
  const lat = rawLat?.trim() ? Number(rawLat) : Number.NaN;
  const lng = rawLng?.trim() ? Number(rawLng) : Number.NaN;
  const radiusMeters =
    rawRadiusKm === null
      ? DEFAULT_SHELTER_RADIUS_METERS
      : rawRadiusKm.trim()
        ? Number(rawRadiusKm) * 1_000
        : Number.NaN;
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return NextResponse.json({ error: "유효한 lat/lng 파라미터가 필요합니다" }, { status: 400 });
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters <= 0 || radiusMeters > MAX_SHELTER_RADIUS_METERS) {
    return NextResponse.json(
      { error: `radius_km은 0보다 크고 ${MAX_SHELTER_RADIUS_METERS / 1_000} 이하이어야 합니다` },
      { status: 400 }
    );
  }

  const start = Date.now();
  let snapshot;
  try {
    snapshot = await loadShelterSnapshot();
  } catch (error) {
    const message = error instanceof Error ? error.message : "통합대피소 JSON을 읽을 수 없습니다";
    logApiCall({
      provider: "safetydata",
      endpoint: "getNearbyShelters:snapshot",
      ok: false,
      detail: message,
      durationMs: Date.now() - start,
    });
    return NextResponse.json({
      shelters: [],
      fallback: true,
      message,
      source: "DSSP-IF-10941",
      radiusMeters,
    });
  }
  const stale = Date.now() - new Date(snapshot.fetchedAt).getTime() > 48 * 60 * 60 * 1000;
  logApiCall({
    provider: "safetydata",
    endpoint: "getNearbyShelters:snapshot",
    ok: true,
    detail: stale ? "통합대피소 JSON이 48시간보다 오래되었습니다" : undefined,
    durationMs: Date.now() - start,
  });

  const shelters = snapshot.shelters
    .map((s) => {
      const d = distanceMeters(lat, lng, s.lat, s.lng);
      return { ...s, distanceMeters: d, walkMinutes: walkMinutes(d) };
    })
    .filter((s) => s.distanceMeters <= radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 30);

  return NextResponse.json({
    shelters,
    fallback: false,
    stale,
    message: stale ? "저장된 통합대피소 JSON이 48시간보다 오래되었습니다" : undefined,
    source: "DSSP-IF-10941",
    snapshotFetchedAt: snapshot.fetchedAt,
    radiusMeters,
  });
}
