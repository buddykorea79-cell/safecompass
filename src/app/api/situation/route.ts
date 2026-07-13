import { NextRequest, NextResponse } from "next/server";
import { getWeatherAlerts } from "@/lib/kma";
import { getDisasterMessages } from "@/lib/safetydata";
import { judgeSituation } from "@/lib/levelEngine";
import { logApiCall } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  const regionCode = req.nextUrl.searchParams.get("region_code") ?? "unknown";
  const regionKeyword = req.nextUrl.searchParams.get("region_keyword") ?? undefined;

  const start = Date.now();
  const [alertResult, msgResult] = await Promise.all([getWeatherAlerts(regionKeyword), getDisasterMessages(regionKeyword)]);
  const situation = await judgeSituation(regionCode, msgResult.messages, alertResult.alerts);

  logApiCall({
    provider: "bizrouter",
    endpoint: "judgeSituation",
    ok: true,
    detail: situation.used_llm ? "LLM 2차 판정 적용" : "규칙기반 판정",
    durationMs: Date.now() - start,
  });

  return NextResponse.json({
    situation,
    dataFallback: alertResult.fallback || msgResult.fallback,
    dataMessage: alertResult.message || msgResult.message,
  });
}
