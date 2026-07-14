"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  kakaoMapCreateError,
  kakaoMapErrorView,
  loadKakaoMapSdk,
  type KakaoMapErrorView,
} from "@/lib/kakaoMapSdk";
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
  const [error, setError] = useState<KakaoMapErrorView | null>(null);
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
    loadKakaoMapSdk(KAKAO_JS_KEY)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const currentCenter = centerRef.current;
        try {
          map = new window.kakao.maps.Map(containerRef.current, {
            center: new window.kakao.maps.LatLng(currentCenter.lat, currentCenter.lng),
            level: 5,
          });
        } catch {
          throw kakaoMapCreateError();
        }
        mapRef.current = map;
        handleDragEnd = () => {
          const next = map.getCenter();
          setPickCenter({ lat: next.getLat(), lng: next.getLng() });
          if (!pickingRef.current && onCenterSearchRef.current) setShowResearch(true);
        };
        window.kakao.maps.event.addListener(map, "dragend", handleDragEnd);
        setPickCenter(currentCenter);
        setReady(true);
        window.requestAnimationFrame(() => {
          if (cancelled || mapRef.current !== map) return;
          map.relayout();
          map.setCenter(new window.kakao.maps.LatLng(currentCenter.lat, currentCenter.lng));
        });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(kakaoMapErrorView(cause));
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
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{error.summary}</p>
          <ul className="mt-2 space-y-1 text-left text-[10px] leading-relaxed text-slate-400">
            {error.checks.map((check) => (
              <li key={check}>· {check}</li>
            ))}
          </ul>
          <p className="mt-2 text-[9px] font-medium uppercase tracking-wide text-slate-300">
            진단 코드 {error.code}
          </p>
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
