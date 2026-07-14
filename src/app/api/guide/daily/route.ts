import { NextRequest, NextResponse } from "next/server";
import { getWeatherAlerts, getWeatherSnapshot } from "@/lib/kma";
import { getDisasterMessages } from "@/lib/safetydata";
import {
  kstDateKey,
  parseCoordinate,
  selectDailyGuideRecommendation,
  type DailyGuideRecommendation,
} from "@/lib/dailyGuideRecommendation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface DailyCacheValue {
  recommendation: DailyGuideRecommendation;
  dataFallback: boolean;
  dataMessages: string[];
}

const dailyCache = new Map<string, Promise<DailyCacheValue>>();
const DAILY_CACHE_LIMIT = 128;

function secondsUntilNextKstDay(now = new Date()): number {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const nextKstMidnightAsUtc = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) - 9 * 60 * 60 * 1000;
  return Math.max(60, Math.floor((nextKstMidnightAsUtc - now.getTime()) / 1000));
}

async function calculateDaily(
  date: string,
  region: string | undefined,
  lat: number,
  lng: number
): Promise<DailyCacheValue> {
  const [messageResult, weatherAlertResult, weather] = await Promise.all([
    getDisasterMessages(region),
    getWeatherAlerts(region),
    getWeatherSnapshot(lat, lng),
  ]);
  return {
    recommendation: selectDailyGuideRecommendation({
      date,
      messages: messageResult.messages,
      weatherAlerts: weatherAlertResult.alerts,
      weather,
    }),
    dataFallback: messageResult.fallback || weatherAlertResult.fallback || weather.fallback,
    dataMessages: [messageResult.message, weatherAlertResult.message, weather.message].filter(
      (message): message is string => Boolean(message)
    ),
  };
}

export async function GET(request: NextRequest) {
  const lat = parseCoordinate(request.nextUrl.searchParams.get("lat"), -90, 90);
  const lng = parseCoordinate(request.nextUrl.searchParams.get("lng"), -180, 180);
  if (lat === null || lng === null) {
    return NextResponse.json({ error: "올바른 위도와 경도를 입력하세요." }, { status: 400 });
  }

  const date = kstDateKey();
  const regionCode = (request.nextUrl.searchParams.get("region_code") || "unknown").slice(0, 30);
  const region = request.nextUrl.searchParams.get("region")?.trim().slice(0, 80) || undefined;
  const cacheKey = `${date}:${regionCode}:${lat.toFixed(3)}:${lng.toFixed(3)}`;

  // 날짜가 바뀌면 이전 인스턴스 캐시를 제거한다. 브라우저와 CDN도 같은 날짜 단위로 재사용한다.
  for (const key of dailyCache.keys()) {
    if (!key.startsWith(`${date}:`)) dailyCache.delete(key);
  }
  let pending = dailyCache.get(cacheKey);
  if (!pending) {
    if (dailyCache.size >= DAILY_CACHE_LIMIT) {
      const oldestKey = dailyCache.keys().next().value;
      if (oldestKey) dailyCache.delete(oldestKey);
    }
    pending = calculateDaily(date, region, lat, lng);
    dailyCache.set(cacheKey, pending);
  }

  try {
    const result = await pending;
    return NextResponse.json(result, {
      headers: {
        "Cache-Control": `public, max-age=300, s-maxage=${secondsUntilNextKstDay()}, stale-while-revalidate=300`,
      },
    });
  } catch (error) {
    dailyCache.delete(cacheKey);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "오늘의 행동요령을 선정하지 못했습니다." },
      { status: 502 }
    );
  }
}
