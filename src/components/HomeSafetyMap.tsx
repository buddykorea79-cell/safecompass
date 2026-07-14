"use client";

import { AlertTriangle, ArrowRight, MapPin } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type {
  DisasterMessage,
  DisasterSituation,
  Shelter,
  WeatherAlert,
} from "@/types";
import KakaoMap, { type MapMarkerItem } from "./KakaoMap";
import MarkerSheet from "./MarkerSheet";

interface NationwideNotice {
  id: string;
  title: string;
  content: string;
}

function isNationwide(regions: string[]): boolean {
  return regions.some((region) => {
    const normalized = region.replace(/\s+/g, "");
    return normalized.startsWith("전국") || normalized === "대한민국전역";
  });
}

function extractNationwideNotices(payload: {
  messages?: DisasterMessage[];
  alerts?: WeatherAlert[];
}): NationwideNotice[] {
  const messages = (payload.messages ?? [])
    .filter((message) => isNationwide(message.region_codes))
    .map((message) => ({
      id: `message-${message.id}`,
      title: message.msg_type,
      content: message.content,
    }));
  const alerts = (payload.alerts ?? [])
    .filter((alert) => isNationwide(alert.region_codes))
    .map((alert) => ({
      id: `alert-${alert.id}`,
      title: `${alert.alert_kind} ${alert.alert_level}`,
      content: alert.content ?? `${alert.alert_kind} ${alert.alert_level}가 발표되었습니다.`,
    }));
  return [...messages, ...alerts];
}

export default function HomeSafetyMap({
  lat,
  lng,
  regionCode,
  regionLabel,
}: {
  lat: number;
  lng: number;
  regionCode: string;
  regionLabel: string;
}) {
  const [markers, setMarkers] = useState<MapMarkerItem[]>([]);
  const [selected, setSelected] = useState<MapMarkerItem | null>(null);
  const [situation, setSituation] = useState<DisasterSituation | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [shelterMessage, setShelterMessage] = useState("");
  const center = useMemo(() => ({ lat, lng }), [lat, lng]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setMessage("");
    setShelterMessage("");
    setSituation(null);
    setSelected(null);
    setMarkers([]);

    void fetch(`/api/shelters?lat=${lat}&lng=${lng}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error ?? "대피소 조회 실패");
        if (controller.signal.aborted) return;
        setMarkers(
          (payload.shelters ?? []).map((shelter: Shelter) => ({
            ...shelter,
            kind: "shelter" as const,
          }))
        );
        setShelterMessage(
          payload.message ??
            (payload.fallback ? "통합대피소 공식 데이터를 확인하지 못했습니다." : "")
        );
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setMarkers([]);
        setShelterMessage(cause instanceof Error ? cause.message : "대피소 조회 실패");
      });

    void fetch(
      `/api/situation?region_code=${encodeURIComponent(
        regionCode
      )}&region_keyword=${encodeURIComponent(regionLabel)}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("상황정보를 조회하지 못했습니다.");
        return response.json();
      })
      .then((situationPayload) => {
        if (controller.signal.aborted) return;
        setSituation(situationPayload.situation ?? null);
        if (situationPayload.dataMessage) setMessage(situationPayload.dataMessage);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setSituation(null);
        setMessage(cause instanceof Error ? cause.message : "상황정보를 조회하지 못했습니다.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [lat, lng, regionCode, regionLabel]);

  const notices = useMemo(() => {
    if (!situation) return [];
    return extractNationwideNotices({
      messages: situation.source_messages,
      alerts: situation.source_alerts,
    }).slice(0, 1);
  }, [situation]);

  const affectedRegions = useMemo(() => {
    if (!situation) return [];
    const regions = [
      ...situation.source_messages.flatMap((item) => item.region_codes),
      ...situation.source_alerts.flatMap((item) => item.region_codes),
    ];
    return Array.from(new Set(regions.filter((region) => region && !isNationwide([region])))).slice(
      0,
      3
    );
  }, [situation]);

  return (
    <section
      id="safety-info"
      aria-labelledby="home-safety-map-title"
      className="mx-5 mt-3 scroll-mt-16 overflow-hidden rounded-2xl bg-white shadow-card"
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h2
            id="home-safety-map-title"
            className="flex items-center gap-1.5 text-sm font-bold text-slate-700"
          >
            <MapPin size={16} className="shrink-0 text-brand-600" aria-hidden="true" />
            내 주변 안전지도
          </h2>
          <p className="mt-0.5 truncate text-[11px] text-slate-400">{regionLabel}</p>
        </div>
        <Link
          href="/map"
          className="flex shrink-0 items-center gap-1 text-xs font-semibold text-brand-700"
        >
          크게 보기 <ArrowRight size={13} aria-hidden="true" />
        </Link>
      </header>

      <div className="h-64 border-y border-slate-100">
        <KakaoMap
          center={center}
          markers={markers}
          situationLevel={situation?.level}
          situationCenter={center}
          situationLabel={regionLabel}
          showSituation
          onMarkerClick={setSelected}
        />
      </div>

      <div className="px-4 py-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <AlertTriangle size={14} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-slate-700">현재 상황</h3>
              {situation && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {situation.level_name}
                </span>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
              {loading
                ? "상황발생 지역과 인근 대피소를 확인하고 있습니다."
                : situation?.summary || message || "현재 표시할 상황정보가 없습니다."}
            </p>
            {affectedRegions.length > 0 && (
              <p className="mt-1 line-clamp-1 text-[10px] text-slate-500">
                <strong>발생 지역</strong> · {affectedRegions.join(" · ")}
              </p>
            )}
            {!loading && situation && message && (
              <p className="mt-1 line-clamp-1 text-[10px] text-amber-700">
                일부 공식 데이터 확인 필요 · {message}
              </p>
            )}
            {!loading && shelterMessage && (
              <p className="mt-1 line-clamp-2 text-[10px] text-amber-700">
                대피소 정보 확인 필요 · {shelterMessage}
              </p>
            )}
          </div>
        </div>

        {notices.map((notice) => (
          <div
            key={notice.id}
            className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2"
          >
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              전국
            </span>
            <p className="line-clamp-2 text-[11px] leading-relaxed text-amber-900">
              <strong>{notice.title}</strong> · {notice.content}
            </p>
          </div>
        ))}
      </div>

      {selected && <MarkerSheet item={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
