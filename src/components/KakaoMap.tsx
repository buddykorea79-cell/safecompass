"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { Shelter, Place, DisasterLevel } from "@/types";

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

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || "";

let sdkLoadingPromise: Promise<void> | null = null;

function loadKakaoSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("server"));
  if (window.kakao?.maps) return Promise.resolve();
  if (sdkLoadingPromise) return sdkLoadingPromise;

  sdkLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_JS_KEY}&autoload=false&libraries=services`;
    script.async = true;
    script.onload = () => window.kakao.maps.load(() => resolve());
    script.onerror = () => reject(new Error("카카오맵 SDK 로드 실패"));
    document.head.appendChild(script);
  });
  return sdkLoadingPromise;
}

export default function KakaoMap({
  center,
  markers,
  situationLevel,
  picking = false,
  onMarkerClick,
  onCenterSearch,
  onPickConfirm,
}: {
  center: { lat: number; lng: number };
  markers: MapMarkerItem[];
  situationLevel?: DisasterLevel;
  picking?: boolean;
  onMarkerClick?: (item: MapMarkerItem) => void;
  onCenterSearch?: (center: { lat: number; lng: number }) => void;
  onPickConfirm?: (center: { lat: number; lng: number }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerObjsRef = useRef<any[]>([]);
  const circleRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResearch, setShowResearch] = useState(false);
  const [pickCenter, setPickCenter] = useState(center);

  useEffect(() => {
    if (!KAKAO_JS_KEY) {
      setError("NEXT_PUBLIC_KAKAO_JS_KEY 미설정 — 지도를 표시할 수 없습니다");
      return;
    }
    let cancelled = false;
    loadKakaoSdk()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const map = new window.kakao.maps.Map(containerRef.current, {
          center: new window.kakao.maps.LatLng(center.lat, center.lng),
          level: 5,
        });
        mapRef.current = map;
        window.kakao.maps.event.addListener(map, "dragend", () => {
          setShowResearch(true);
          const c = map.getCenter();
          setPickCenter({ lat: c.getLat(), lng: c.getLng() });
        });
        setReady(true);
      })
      .catch(() => setError("카카오맵을 불러오지 못했습니다"));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setCenter(new window.kakao.maps.LatLng(center.lat, center.lng));
    setPickCenter(center);
    setShowResearch(false);
  }, [center.lat, center.lng, ready]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    markerObjsRef.current.forEach((m) => m.setMap(null));
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

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    circleRef.current?.setMap(null);
    if (situationLevel && situationLevel >= 2) {
      circleRef.current = new window.kakao.maps.Circle({
        center: new window.kakao.maps.LatLng(center.lat, center.lng),
        radius: 2000,
        strokeWeight: 0,
        fillColor: LEVEL_HEX[situationLevel],
        fillOpacity: 0.14,
        map: mapRef.current,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, situationLevel, center.lat, center.lng]);

  const research = useCallback(() => {
    setShowResearch(false);
    onCenterSearch?.(pickCenter);
  }, [onCenterSearch, pickCenter]);

  if (error) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-2 bg-slate-100 px-8 text-center">
        <p className="text-sm font-medium text-slate-400">{error}</p>
        <p className="text-xs text-slate-400">Vercel 환경변수 등록 후 자동으로 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {picking && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="-mt-8 h-4 w-4 rounded-full border-2 border-white bg-brand-600 shadow-lg" />
        </div>
      )}

      {picking && (
        <button
          onClick={() => onPickConfirm?.(pickCenter)}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-card"
        >
          이 위치로 설정
        </button>
      )}

      {!picking && showResearch && (
        <button
          onClick={research}
          className="absolute top-4 left-1/2 -translate-x-1/2 rounded-full bg-white px-4 py-2 text-xs font-semibold text-brand-600 shadow-card"
        >
          이 지역 재검색
        </button>
      )}
    </div>
  );
}
