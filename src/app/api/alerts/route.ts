import { NextRequest, NextResponse } from "next/server";
import { getWeatherAlerts } from "@/lib/kma";
import { getDisasterMessages } from "@/lib/safetydata";
import { logApiCall } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region") ?? undefined;

  const start = Date.now();
  const [alertResult, msgResult] = await Promise.all([getWeatherAlerts(region), getDisasterMessages(region)]);
  logApiCall({
    provider: "kma",
    endpoint: "getWeatherAlerts",
    ok: !alertResult.fallback,
    detail: alertResult.message,
    durationMs: Date.now() - start,
  });
  logApiCall({
    provider: "safetydata",
    endpoint: "getDisasterMessages",
    ok: !msgResult.fallback,
    detail: msgResult.message,
    durationMs: Date.now() - start,
  });

  return NextResponse.json({
    alerts: alertResult.alerts,
    messages: msgResult.messages,
    alertsFallback: alertResult.fallback,
    alertsMessage: alertResult.message,
    messagesFallback: msgResult.fallback,
    messagesMessage: msgResult.message,
  });
}
