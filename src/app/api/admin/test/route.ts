import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { getWeatherSnapshot, getWeatherAlerts } from "@/lib/kma";
import { getDisasterMessages, getEmergencyMessages, getBreakingMessages, getNearbyShelters } from "@/lib/safetydata";
import { searchNearbyPlaces, coordToRegionLabel } from "@/lib/kakao";
import { chatComplete } from "@/lib/bizrouter";

function requireAdmin(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(ADMIN_COOKIE_NAME)?.value);
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const provider: string = body?.provider ?? "";
  const params: Record<string, string> = body?.params ?? {};
  const lat = Number(params.lat ?? "36.48");
  const lng = Number(params.lng ?? "127.289");

  try {
    switch (provider) {
      case "kma-weather":
        return NextResponse.json(await getWeatherSnapshot(lat, lng));
      case "kma-alerts":
        return NextResponse.json(await getWeatherAlerts(params.region));
      case "safetydata-messages":
        return NextResponse.json(await getDisasterMessages(params.region));
      case "safetydata-emergency":
        return NextResponse.json(await getEmergencyMessages(params.region));
      case "safetydata-breaking":
        return NextResponse.json(await getBreakingMessages(params.region));
      case "safetydata-shelters":
        return NextResponse.json(await getNearbyShelters(lat, lng));
      case "kakao-places":
        return NextResponse.json(
          await searchNearbyPlaces(lat, lng, params.category === "pharmacy" ? "pharmacy" : "hospital")
        );
      case "kakao-geocode":
        return NextResponse.json(await coordToRegionLabel(lat, lng));
      case "bizrouter-chat":
        return NextResponse.json(await chatComplete("당신은 테스트용 어시스턴트입니다.", params.message ?? "안녕하세요"));
      default:
        return NextResponse.json({ error: "알 수 없는 provider입니다" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "테스트 중 오류가 발생했습니다" },
      { status: 500 }
    );
  }
}
