"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, MapPin } from "lucide-react";
import { useLocationStore } from "@/store/useLocationStore";
import KakaoMap, { type MapMarkerItem } from "@/components/KakaoMap";
import LayerToggleChips, { type MapLayer } from "@/components/LayerToggleChips";
import MarkerSheet from "@/components/MarkerSheet";
import type {
  DisasterMessage,
  DisasterSituation,
  Place,
  Shelter,
  WeatherAlert,
} from "@/types";

interface SituationQuery {
  lat: number;
  lng: number;
  regionCode: string;
  label: string;
}

interface SituationNotice {
  id: string;
  title: string;
  content: string;
}

interface MarkerQueryResult {
  items: MapMarkerItem[];
  message?: string;
}

function isNationwide(regions: string[]): boolean {
  return regions.some((region) => {
    const normalized = region.replace(/\s+/g, "");
    return normalized.startsWith("전국") || normalized === "대한민국전역";
  });
}

function nationwideNotices(payload: {
  messages?: DisasterMessage[];
  alerts?: WeatherAlert[];
}): SituationNotice[] {
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

function MapScreenInner() {
  const location = useLocationStore((state) => state.location);
  const setLocation = useLocationStore((state) => state.setLocation);
  const router = useRouter();
  const searchParams = useSearchParams();
  const picking = searchParams.get("pick") === "1";

  const [center, setCenter] = useState({ lat: location.lat, lng: location.lng });
  const [activeLayers, setActiveLayers] = useState<Set<MapLayer>>(
    new Set(["situation", "shelter"])
  );
  const [markers, setMarkers] = useState<MapMarkerItem[]>([]);
  const [markerMessage, setMarkerMessage] = useState("");
  const [selected, setSelected] = useState<MapMarkerItem | null>(null);
  const [situation, setSituation] = useState<DisasterSituation | null>(null);
  const [situationLoading, setSituationLoading] = useState(true);
  const [situationMessage, setSituationMessage] = useState("");
  const [situationQuery, setSituationQuery] = useState<SituationQuery>({
    lat: location.lat,
    lng: location.lng,
    regionCode: location.region_code,
    label: location.label,
  });
  const [situationResultCenter, setSituationResultCenter] = useState({
    lat: location.lat,
    lng: location.lng,
  });
  const markerRequestId = useRef(0);
  const geocodeRequestId = useRef(0);

  const loadMarkers = useCallback(
    async (nextCenter: { lat: number; lng: number }, layers: Set<MapLayer>) => {
      const requestId = ++markerRequestId.current;
      setMarkers([]);
      setMarkerMessage("");
      const requests: Array<Promise<MarkerQueryResult>> = [];

      if (layers.has("shelter")) {
        requests.push(
          fetch(`/api/shelters?lat=${nextCenter.lat}&lng=${nextCenter.lng}`)
            .then(async (response) => {
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error ?? "대피소 조회 실패");
              return {
                items: (payload.shelters ?? []).map((shelter: Shelter) => ({
                  kind: "shelter" as const,
                  ...shelter,
                })),
                message: payload.fallback
                  ? `대피소: ${payload.message ?? "공식 데이터를 확인하지 못했습니다."}`
                  : undefined,
              };
            })
            .catch((cause: unknown) => ({
              items: [],
              message: `대피소: ${cause instanceof Error ? cause.message : "조회 실패"}`,
            }))
        );
      }
      if (layers.has("hospital")) {
        requests.push(
          fetch(
            `/api/places?lat=${nextCenter.lat}&lng=${nextCenter.lng}&category=hospital`
          )
            .then(async (response) => {
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error ?? "병원 조회 실패");
              return {
                items: (payload.places ?? []).map((place: Place) => ({
                  kind: "place" as const,
                  ...place,
                })),
                message: payload.fallback
                  ? `병원: ${payload.message ?? "공식 데이터를 확인하지 못했습니다."}`
                  : undefined,
              };
            })
            .catch((cause: unknown) => ({
              items: [],
              message: `병원: ${cause instanceof Error ? cause.message : "조회 실패"}`,
            }))
        );
      }
      if (layers.has("pharmacy")) {
        requests.push(
          fetch(
            `/api/places?lat=${nextCenter.lat}&lng=${nextCenter.lng}&category=pharmacy`
          )
            .then(async (response) => {
              const payload = await response.json();
              if (!response.ok) throw new Error(payload.error ?? "약국 조회 실패");
              return {
                items: (payload.places ?? []).map((place: Place) => ({
                  kind: "place" as const,
                  ...place,
                })),
                message: payload.fallback
                  ? `약국: ${payload.message ?? "공식 데이터를 확인하지 못했습니다."}`
                  : undefined,
              };
            })
            .catch((cause: unknown) => ({
              items: [],
              message: `약국: ${cause instanceof Error ? cause.message : "조회 실패"}`,
            }))
        );
      }

      const results = await Promise.all(requests);
      if (requestId === markerRequestId.current) {
        setMarkers(results.flatMap((result) => result.items));
        setMarkerMessage(
          results
            .map((result) => result.message)
            .filter((message): message is string => Boolean(message))
            .join(" / ")
        );
      }
    },
    []
  );

  useEffect(() => {
    if (picking) return;
    geocodeRequestId.current += 1;
    const nextCenter = { lat: location.lat, lng: location.lng };
    setCenter((current) =>
      current.lat === nextCenter.lat && current.lng === nextCenter.lng ? current : nextCenter
    );
    setSituationQuery((current) => {
      if (
        current.lat === location.lat &&
        current.lng === location.lng &&
        current.regionCode === location.region_code &&
        current.label === location.label
      ) {
        return current;
      }
      return {
        lat: location.lat,
        lng: location.lng,
        regionCode: location.region_code,
        label: location.label,
      };
    });
    setSelected(null);
  }, [picking, location.lat, location.lng, location.region_code, location.label]);

  useEffect(() => {
    if (picking) {
      markerRequestId.current += 1;
      setMarkers([]);
      setMarkerMessage("");
      return;
    }
    void loadMarkers(center, activeLayers);
  }, [activeLayers, center, loadMarkers, picking]);

  useEffect(() => {
    if (picking) return;
    const controller = new AbortController();
    setSituationLoading(true);
    setSituationMessage("");
    setSituation(null);

    fetch(
      `/api/situation?region_code=${encodeURIComponent(
        situationQuery.regionCode
      )}&region_keyword=${encodeURIComponent(situationQuery.label)}`,
      { signal: controller.signal }
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("상황정보를 조회하지 못했습니다.");
        return response.json();
      })
      .then((payload) => {
        setSituation(payload.situation ?? null);
        setSituationResultCenter({ lat: situationQuery.lat, lng: situationQuery.lng });
        if (payload.dataFallback && payload.dataMessage) {
          setSituationMessage(payload.dataMessage);
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setSituation(null);
        setSituationMessage(
          cause instanceof Error ? cause.message : "상황정보를 조회하지 못했습니다."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setSituationLoading(false);
      });

    return () => controller.abort();
  }, [picking, situationQuery]);

  const notices = useMemo(() => {
    if (!situation) return [];
    return nationwideNotices({
      messages: situation.source_messages,
      alerts: situation.source_alerts,
    }).slice(0, 2);
  }, [situation]);

  const affectedRegions = useMemo(() => {
    if (!situation) return [];
    const regions = [
      ...situation.source_messages.flatMap((message) => message.region_codes),
      ...situation.source_alerts.flatMap((alert) => alert.region_codes),
    ];
    return Array.from(new Set(regions.filter((region) => region && !isNationwide([region])))).slice(
      0,
      3
    );
  }, [situation]);

  function toggleLayer(layer: MapLayer) {
    setActiveLayers((current) => {
      const next = new Set(current);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  }

  async function selectSearchCenter(nextCenter: { lat: number; lng: number }) {
    const requestId = ++geocodeRequestId.current;
    setCenter(nextCenter);
    setSelected(null);
    try {
      const response = await fetch(
        `/api/geocode?lat=${nextCenter.lat}&lng=${nextCenter.lng}`
      );
      if (!response.ok) throw new Error("지역 변환 실패");
      const payload = await response.json();
      if (requestId !== geocodeRequestId.current) return;
      setSituationQuery({
        ...nextCenter,
        regionCode:
          payload.region_code ??
          `map-${nextCenter.lat.toFixed(3)}-${nextCenter.lng.toFixed(3)}`,
        label: payload.label ?? "지도에서 선택한 지역",
      });
    } catch {
      if (requestId !== geocodeRequestId.current) return;
      setSituationQuery({
        ...nextCenter,
        regionCode: `map-${nextCenter.lat.toFixed(3)}-${nextCenter.lng.toFixed(3)}`,
        label: "지도에서 선택한 지역",
      });
    }
  }

  async function handlePickConfirm(nextCenter: { lat: number; lng: number }) {
    let nextLocation = {
      region_code: `map-${nextCenter.lat.toFixed(3)}-${nextCenter.lng.toFixed(3)}`,
      label: "지도에서 선택한 위치",
      lat: nextCenter.lat,
      lng: nextCenter.lng,
      source: "map" as const,
    };
    try {
      const response = await fetch(
        `/api/geocode?lat=${nextCenter.lat}&lng=${nextCenter.lng}`
      );
      if (!response.ok) throw new Error("지역 변환 실패");
      const payload = await response.json();
      nextLocation = {
        region_code:
          payload.region_code ??
          `map-${nextCenter.lat.toFixed(3)}-${nextCenter.lng.toFixed(3)}`,
        label: payload.label ?? "선택한 위치",
        lat: nextCenter.lat,
        lng: nextCenter.lng,
        source: "map",
      };
    } catch {
      // 역지오코딩이 실패해도 사용자가 확정한 좌표 자체는 보존한다.
    } finally {
      setLocation(nextLocation);
      router.replace("/");
    }
  }

  const situationLayerVisible = activeLayers.has("situation");

  return (
    <main className="flex h-[calc(100dvh-9.5rem)] min-h-[320px] w-full flex-col overflow-hidden">
      <div className="z-20 shrink-0 border-b border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800">
              {picking ? "위치 선택" : "안전지도"}
            </h1>
            {!picking && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                <MapPin size={12} aria-hidden="true" /> {situationQuery.label}
              </p>
            )}
          </div>
        </div>
        {!picking && (
          <LayerToggleChips
            active={activeLayers}
            onToggle={toggleLayer}
            className="mt-3"
          />
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <KakaoMap
          center={center}
          markers={picking ? [] : markers}
          situationLevel={picking ? undefined : situation?.level}
          situationCenter={situationResultCenter}
          situationLabel={situationQuery.label}
          showSituation={!picking && situationLayerVisible}
          picking={picking}
          controlTopOffset={16}
          onMarkerClick={setSelected}
          onCenterSearch={selectSearchCenter}
          onPickConfirm={handlePickConfirm}
        />

        {!picking && situationLayerVisible && (
          <section
            aria-label="현재 조회 상황"
            className="pointer-events-none absolute inset-x-3 bottom-3 z-20 max-h-[52%] overflow-y-auto"
          >
            <div className="pointer-events-auto rounded-2xl border border-white/80 bg-white/95 p-3.5 shadow-card backdrop-blur">
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <AlertTriangle size={16} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-xs font-bold text-slate-700">현재 조회 상황</h2>
                  {situation && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      {situation.level_name}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">
                  {situationLoading
                    ? "선택 지역의 상황정보를 확인하고 있습니다."
                    : situation?.summary ||
                      situationMessage ||
                      "현재 표시할 상황정보가 없습니다."}
                </p>
                {affectedRegions.length > 0 && (
                  <p className="mt-1 line-clamp-1 text-[10px] text-slate-500">
                    <strong>발생 지역</strong> · {affectedRegions.join(" · ")}
                  </p>
                )}
                {!situationLoading && situation && situationMessage && (
                  <p className="mt-1 line-clamp-1 text-[10px] text-amber-700">
                    일부 공식 데이터 확인 필요 · {situationMessage}
                  </p>
                )}
                {markerMessage && (
                  <p className="mt-1 line-clamp-2 text-[10px] text-amber-700">
                    시설 정보 확인 필요 · {markerMessage}
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
          </section>
        )}

        {!picking && !situationLayerVisible && markerMessage && (
          <p className="absolute inset-x-3 bottom-3 z-20 rounded-xl bg-white/95 px-3 py-2 text-[10px] text-amber-700 shadow-card">
            시설 정보 확인 필요 · {markerMessage}
          </p>
        )}

        {selected && <MarkerSheet item={selected} onClose={() => setSelected(null)} />}
      </div>
    </main>
  );
}

export default function MapPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[calc(100dvh-9.5rem)] items-center justify-center text-sm text-slate-400">
          불러오는 중...
        </div>
      }
    >
      <MapScreenInner />
    </Suspense>
  );
}
