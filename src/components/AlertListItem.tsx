"use client";

import Link from "next/link";
import { AlertTriangle, CloudLightning } from "lucide-react";
import clsx from "clsx";
import type { DisasterMessage, WeatherAlert } from "@/types";

export type UnifiedAlert =
  | ({ kind: "message" } & DisasterMessage)
  | ({ kind: "weather" } & WeatherAlert);

const MESSAGE_BADGE: Record<string, string> = {
  위급재난문자: "bg-red-50 text-red-500",
  긴급재난문자: "bg-orange-50 text-orange-500",
  재난문자: "bg-amber-50 text-amber-600",
  안전안내문자: "bg-blue-50 text-blue-500",
};

const WEATHER_BADGE: Record<string, string> = {
  중대경보: "bg-red-50 text-red-500",
  경보: "bg-orange-50 text-orange-500",
  주의보: "bg-amber-50 text-amber-600",
  예비특보: "bg-blue-50 text-blue-500",
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AlertListItem({ alert }: { alert: UnifiedAlert }) {
  const isMessage = alert.kind === "message";
  const title = isMessage ? alert.msg_type : `${alert.alert_kind} ${alert.alert_level}`;
  const badgeClass = isMessage ? MESSAGE_BADGE[alert.msg_type] : WEATHER_BADGE[alert.alert_level];
  const content = isMessage ? alert.content : alert.content ?? `${alert.alert_kind} ${alert.alert_level} 발표`;
  const region = alert.region_codes.join(", ") || "전국";

  return (
    <Link
      href={`/alerts/${alert.kind}-${alert.id}`}
      className="mb-2.5 block rounded-2xl bg-white p-4 shadow-card active:scale-[0.99]"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <span className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold", badgeClass)}>
          {isMessage ? <AlertTriangle size={11} /> : <CloudLightning size={11} />}
          {title}
        </span>
        <span className="text-[11px] text-slate-400">{formatTime(alert.issued_at)}</span>
      </div>
      <p className="line-clamp-2 text-sm text-slate-700">{content}</p>
      <p className="mt-1.5 text-[11px] text-slate-400">{region}</p>
    </Link>
  );
}
