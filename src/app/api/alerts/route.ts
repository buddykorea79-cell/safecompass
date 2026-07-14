import { NextRequest, NextResponse } from "next/server";
import { getWeatherAlerts } from "@/lib/kma";
import { getDisasterMessages } from "@/lib/safetydata";
import { logApiCall } from "@/lib/apiLog";
import {
  paginateOfficialAlerts,
  type OfficialAlertFilter,
  type UnifiedOfficialAlert,
} from "@/lib/alertsPagination";
import type { DisasterMessage, WeatherAlert } from "@/types";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function alertFilter(value: string | null): OfficialAlertFilter {
  return value === "emergency" || value === "breaking" || value === "weather" ? value : "all";
}

function stripKind(item: UnifiedOfficialAlert): DisasterMessage | WeatherAlert {
  const { kind: _kind, ...alert } = item;
  return alert;
}

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region")?.trim() || undefined;
  const requestedPage = positiveInteger(req.nextUrl.searchParams.get("page"), 1, Number.MAX_SAFE_INTEGER);
  const pageSize = positiveInteger(req.nextUrl.searchParams.get("pageSize"), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  const filter = alertFilter(req.nextUrl.searchParams.get("filter"));
  const requestedId = req.nextUrl.searchParams.get("id")?.trim();

  const start = Date.now();
  const [alertResult, msgResult] = await Promise.all([getWeatherAlerts(region), getDisasterMessages(region)]);
  const durationMs = Date.now() - start;
  logApiCall({
    provider: "kma",
    endpoint: "getWeatherAlerts",
    ok: !alertResult.fallback,
    detail: alertResult.message,
    durationMs,
  });
  logApiCall({
    provider: "safetydata",
    endpoint: "getDisasterMessages",
    ok: !msgResult.fallback,
    detail: msgResult.message,
    durationMs,
  });

  const { items, pagination } = paginateOfficialAlerts({
    messages: msgResult.messages,
    weatherAlerts: alertResult.alerts,
    filter,
    requestedPage,
    pageSize,
    requestedId,
  });

  return NextResponse.json({
    items,
    // 기존 상세 화면과 외부 호출을 위한 호환 필드다. 각 배열도 현재 페이지 범위만 반환한다.
    messages: items.filter((item) => item.kind === "message").map(stripKind),
    alerts: items.filter((item) => item.kind === "weather").map(stripKind),
    pagination,
    alertsFallback: alertResult.fallback,
    alertsMessage: alertResult.message,
    messagesFallback: msgResult.fallback,
    messagesMessage: msgResult.message,
  });
}
