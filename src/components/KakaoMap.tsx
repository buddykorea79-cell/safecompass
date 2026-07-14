"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DisasterLevel, Place, Shelter } from "@/types";

declare global {
  interface Window {
    kakao: any;
  }
}

export type MapMarkerItem =
  | ({ kind: "shelter" } & Shelter)
  | ({ kind: "place" } & Place);

const LEVEL_HEX: Record<DisasterLevel, string> = {
  1: "#6b7280",
  2: "#3b82f6",
  3: "#f2b100",
  4: "#f97316",
  5: "#ef4444",
};

const KAKAO_JS_KEY = (process.env.NEXT_PUBLIC_KAKAO_JS_KEY ?? "").trim();
const KAKAO_SDK_SCRIPT_ID = "safecompass-kakao-map-sdk";
const KAKAO_SDK_TIMEOUT_MS = 10_000;

let sdkLoadingPromise: Promise<void> | null = null;

function kakaoMapsReady(): boolean {
  return typeof window.kakao?.maps?.Map === "function";
}

function loadKakaoSdk(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("브라우저에서만 지도를 불러올 수 있습니다."));
  }
  if (!KAKAO_JS_KEY) {
    return Promise.reject(
      new Error("NEXT_PUBLIC_KAKAO_JS_KEY가 설정되지 않아 지도를 표시할 수 없습니다.")
    );
  }
  if (kakaoMapsReady()) return Promise.resolve();
  if (sdkLoadingPromise) return sdkLoadingPromise;

  const attempt = new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutId: number | undefined;
    let script = document.getElementById(KAKAO_SDK_SCRIPT_ID) as HTMLScriptElement | null;

    if (script?.dataset.loadState === "error") {
      script.remove();
      script = null;
    }

    const cleanup = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
    };

    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      if (script) script.dataset.loadState = "error";
      cleanup();
      reject(new Error(message));
    };

    const initialize = () => {
      if (kakaoMapsReady()) {
        succeed();
        return;
      }
      if (typeof window.kakao?.maps?.load !== "function") {
        fail("카카오맵 SDK 초기화 함수를 찾지 못했습니다.");
        return;
      }
      try {
        window.kakao.maps.load(() => {
          if (kakaoMapsReady()) succeed();
          else fail("카카오맵 SDK가 올바르게 초기화되지 않았습니다.");
        });
      } catch {
        fail("카카오맵 SDK 초기화 중 오류가 발생했습니다.");
      }
    };

    function handleLoad() {
      if (script) script.dataset.loadState = "loaded";
      initialize();
    }

    function handleError() {
      fail("카카오맵 SDK를 내려받지 못했습니다. 네트워크와 등록 도메인을 확인해 주세요.");
    }

    timeoutId = window.setTimeout(() => {
      fail(
        "카카오맵 초기화 시간이 초과되었습니다. JavaScript 키와 카카오 콘솔의 등록 도메인을 확인해 주세요."
      );
    }, KAKAO_SDK_TIMEOUT_MS);

    if (script) {
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
      if (script.dataset.loadState === "loaded" || window.kakao?.maps?.load) initialize();
      return;
    }

    // 이전 화면이나 구버전 로더가 SDK 태그를 먼저 추가한 경우에도 새 태그를 중복 삽입하지 않는다.
    if (typeof window.kakao?.maps?.load === "function") {
      initialize();
      return;
    }

    script = document.createElement("script");
    script.id = KAKAO_SDK_SCRIPT_ID;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(
      KAKAO_JS_KEY
    )}&autoload=false&libraries=services`;
    script.async = true;
    script.dataset.loadState = "loading";
    script.addEventListener("load", handleLoad, { once: true });
    script.addEventListener("error", handleError, { once: true });
    document.head.appendChild(script);
  });

  sdkLoadingPromise = attempt.catch((error: unknown) => {
    sdkLoadingPromise = null;
    throw error;
  });
  return sdkLoadingPromise;
}

export default function KakaoMap({
  center,
  markers,
  situationLevel,
  situationCenter,
  situationLabel,
  showSituation = true,
  picking = false,
  controlTopOffset = 16,
  onMarkerClick,
  onCenterSearch,
  onPickConfirm,
}: {
  center: { lat: number; lng: number };
  markers: MapMarkerItem[];
  situationLevel?: DisasterLevel;
  situationCenter?: { lat: number; lng: number };
  situationLabel?: string;
  showSituation?: boolean;
  picking?: boolean;
  controlTopOffset?: number;
  onMarkerClick?: (item: MapMarkerItem) => void;
  onCenterSearch?: (center: { lat: number; lng: number }) => void;
  onPickConfirm?: (center: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerObjsRef = useRef<any[]>([]);
  const situationOverlayRef = useRef<any>(null);
  const centerRef = useRef(center);
  const pickingRef = useRef(picking);
  const onCenterSearchRef = useRef(onCenterSearch);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResearch, setShowResearch] = useState(false);
  const [pickCenter, setPickCenter] = useState(center);
  const [retryToken, setRetryToken] = useState(0);

  centerRef.current = center;
  pickingRef.current = picking;
  onCenterSearchRef.current = onCenterSearch;

  useEffect(() => {
    let cancelled = false;
    let map: any = null;
    let handleDragEnd: (() => void) | null = null;

    setReady(false);
    setError(null);
    loadKakaoSdk()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const currentCenter = centerRef.current;
        map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(currentCenter.lat, currentCenter.lng),
          level: 5,
        });
        mapRef.current = map;
        handleDragEnd = () => {
          const next = map.getCenter();
          setPickCenter({ lat: next.getLat(), lng: next.getLng() });
          if (!pickingRef.current && onCenterSearchRef.current) setShowResearch(true);
        };
        window.kakao.maps.event.addListener(map, "dragend", handleDragEnd);
        setPickCenter(currentCenter);
        setReady(true);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(
          cause instanceof Error ? cause.message : "카카오맵을 불러오지 못했습니다."
        );
      });

    return () => {
      cancelled = true;
      markerObjsRef.current.forEach((marker) => marker.setMap(null));
      markerObjsRef.current = [];
      situationOverlayRef.current?.setMap(null);
      situationOverlayRef.current = null;
      if (map && handleDragEnd) {
        window.kakao?.maps?.event?.removeListener?.(map, "dragend", handleDragEnd);
      }
      mapRef.current = null;
    };
  }, [retryToken]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
    setPickCenter(center);
    setShowResearch(false);
  }, [center.lat, center.lng, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current || !containerRef.current || typeof ResizeObserver === "undefined") {
      return;
    }
    const map = mapRef.current;
    const observer = new ResizeObserver(() => {
      const currentCenter = map.getCenter();
      map.relayout();
      map.setCenter(currentCenter);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markerObjsRef.current.forEach((marker) => marker.setMap(null));
    markerObjsRef.current = [];

    markers.forEach((item) => {
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(item.lat, item.lng),
        map: mapRef.current,
      });
      window.kakao.maps.event.addListener(marker, "click", () => onMarkerClick?.(item));
      markerObjsRef.current.push(marker);
    });
  }, [markers, ready, onMarkerClick]);

  const situationLat = situationCenter?.lat ?? center.lat;
  const situationLng = situationCenter?.lng ?? center.lng;

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    situationOverlayRef.current?.setMap(null);
    situationOverlayRef.current = null;
    if (showSituation && situationLevel && situationLevel >= 2) {
      // 원문에는 행정구역명만 있고 정확한 재난 geometry는 없으므로 임의 반경·발생 좌표를 만들지 않는다.
      // 현재 조회 기준 위치만 명시하고 실제 대상 지역은 하단 원문으로 표시한다.
      const content = document.createElement("div");
      content.textContent = `조회 기준 · ${situationLabel || "현재 위치"}`;
      Object.assign(content.style, {
        border: `1px solid ${LEVEL_HEX[situationLevel]}`,
        borderRadius: "9999px",
        background: "rgba(255,255,255,0.96)",
        color: LEVEL_HEX[situationLevel],
        fontSize: "11px",
        fontWeight: "700",
        maxWidth: "180px",
        overflow: "hidden",
        padding: "6px 10px",
        pointerEvents: "none",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        boxShadow: "0 4px 14px rgba(15,23,42,0.16)",
      });
      situationOverlayRef.current = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(situationLat, situationLng),
        content,
        yAnchor: 1.6,
        zIndex: 4,
        map: mapRef.current,
      });
    }
  }, [ready, showSituation, situationLabel, situationLevel, situationLat, situationLng]);

  const research = useCallback(() => {
    setShowResearch(false);
    onCenterSearch?.(pickCenter);
  }, [onCenterSearch, pickCenter]);

  if (error) {
    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 bg-slate-100 px-8 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-600">지도를 불러올 수 없습니다</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-400">{error}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setRetryToken((value) => value + 1);
          }}
          className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-700 shadow-card"
        >
          <RefreshCw size={14} aria-hidden="true" /> 다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" aria-label="카카오 안전지도" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100 text-xs font-medium text-slate-400">
          카카오맵을 불러오는 중입니다...
        </div>
      )}

      {ready && picking && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="-mt-8 h-4 w-4 rounded-full border-2 border-white bg-brand-600 shadow-lg" />
        </div>
      )}

      {ready && picking && (
        <button
          type="button"
          onClick={() => onPickConfirm?.(pickCenter)}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card"
        >
          이 위치로 설정
        </button>
      )}

      {ready && !picking && showResearch && (
        <button
          type="button"
          onClick={research}
          style={{ top: controlTopOffset }}
          className="absolute left-1/2 z-10 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-600 shadow-card"
        >
          이 지역 재검색
        </button>
      )}
    </div>
  );
}
