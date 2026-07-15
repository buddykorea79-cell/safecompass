import type { DisasterMessage, WeatherAlert } from "@/types";
import { retainCurrentOfficialAlerts } from "./officialAlertRetention";

export type OfficialAlertFilter = "all" | "emergency" | "breaking" | "weather";
export type UnifiedOfficialAlert =
  | ({ kind: "message" } & DisasterMessage)
  | ({ kind: "weather" } & WeatherAlert);

export interface OfficialAlertsPage {
  items: UnifiedOfficialAlert[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    hasPrevious: boolean;
    hasNext: boolean;
  };
}

function matchesFilter(item: UnifiedOfficialAlert, filter: OfficialAlertFilter): boolean {
  if (filter === "all") return true;
  if (filter === "weather") return item.kind === "weather";
  if (item.kind !== "message") return false;
  const isBreaking = item.service === "10748" || item.msg_type === "재난문자(속보)";
  return filter === "breaking" ? isBreaking : !isBreaking;
}

export function paginateOfficialAlerts({
  messages,
  weatherAlerts,
  filter,
  requestedPage,
  pageSize,
  requestedId,
  now,
}: {
  messages: DisasterMessage[];
  weatherAlerts: WeatherAlert[];
  filter: OfficialAlertFilter;
  requestedPage: number;
  pageSize: number;
  requestedId?: string;
  now?: Date;
}): OfficialAlertsPage {
  const merged: UnifiedOfficialAlert[] = retainCurrentOfficialAlerts(
    [
      ...messages.map((message) => ({ kind: "message" as const, ...message })),
      ...weatherAlerts.map((alert) => ({ kind: "weather" as const, ...alert })),
    ],
    now
  ).sort((a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime());

  const filtered = merged
    .filter((item) => matchesFilter(item, filter))
    .filter((item) => !requestedId || `${item.kind}-${item.id}` === requestedId);
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const items = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
      hasPrevious: page > 1,
      hasNext: page < totalPages,
    },
  };
}
