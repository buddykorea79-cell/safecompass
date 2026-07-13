"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldHalf, MapPin } from "lucide-react";
import type { Shelter } from "@/types";

export default function ShelterPreviewCard({ lat, lng }: { lat: number; lng: number }) {
  const [shelters, setShelters] = useState<Shelter[] | null>(null);
  const [fallback, setFallback] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/shelters?lat=${lat}&lng=${lng}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        setShelters(json.shelters ?? []);
        setFallback(Boolean(json.fallback));
      })
      .catch(() => {
        if (!cancelled) {
          setShelters([]);
          setFallback(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  const nearest = shelters?.[0];

  return (
    <div className="mx-5 mt-3 rounded-2xl bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
          <ShieldHalf size={16} className="text-brand-600" />
          가까운 대피소
        </h3>
        <Link href="/map" className="text-xs font-medium text-brand-600">
          지도에서 보기
        </Link>
      </div>
      {loading ? (
        <div className="h-14 animate-pulse rounded-xl bg-slate-100" />
      ) : !nearest || fallback ? (
        <p className="text-xs text-slate-400">
          {fallback ? "대피소 정보를 불러올 수 없습니다 (API 키 설정 필요)" : "주변에 등록된 대피소 정보가 없습니다"}
        </p>
      ) : (
        <div className="flex items-start gap-3">
          <MapPin size={18} className="mt-0.5 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-700">{nearest.name}</p>
            <p className="truncate text-xs text-slate-400">{nearest.address}</p>
          </div>
          {nearest.distanceMeters !== undefined && (
            <span className="shrink-0 text-xs font-semibold text-brand-600">
              {nearest.distanceMeters < 1000
                ? `${Math.round(nearest.distanceMeters)}m`
                : `${(nearest.distanceMeters / 1000).toFixed(1)}km`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
