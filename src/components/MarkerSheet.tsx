"use client";

import { X, Navigation, Phone } from "lucide-react";
import { kakaoDirectionsUrl } from "@/lib/kakao";
import type { ShelterType } from "@/types";
import type { MapMarkerItem } from "./KakaoMap";

const SHELTER_TYPE_LABEL: Record<ShelterType, string> = {
  민방위대피소: "민방위 대피소",
  지진옥외대피장소: "지진 옥외대피장소",
  지진해일긴급대피장소: "지진해일 긴급대피장소",
  이재민임시주거시설: "이재민 임시주거시설",
  무더위쉼터: "무더위 쉼터",
  한파쉼터: "한파 쉼터",
  일반: "대피소",
};

export default function MarkerSheet({ item, onClose }: { item: MapMarkerItem; onClose: () => void }) {
  const isShelter = item.kind === "shelter";
  const title = item.name;
  const subtitle = isShelter ? SHELTER_TYPE_LABEL[item.shelter_type] ?? "대피소" : item.category === "hospital" ? "병원" : "약국";
  const address = item.address;
  const phone = !isShelter ? item.phone : undefined;
  const distance = item.distanceMeters;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-slide-up rounded-t-3xl bg-white p-5 pb-8 shadow-sheet">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold text-brand-600">{subtitle}</p>
            <h2 className="mt-0.5 text-lg font-bold text-slate-800">{title}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <p className="mb-1 text-sm text-slate-500">{address}</p>
        {distance !== undefined && (
          <p className="mb-4 text-xs text-slate-400">
            약 {distance < 1000 ? `${Math.round(distance)}m` : `${(distance / 1000).toFixed(1)}km`}
          </p>
        )}

        <div className="flex gap-2.5">
          <a
            href={kakaoDirectionsUrl(title, item.lat, item.lng)}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-brand-600 py-3 text-sm font-semibold text-white"
          >
            <Navigation size={16} />
            길찾기
          </a>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-slate-100 py-3 text-sm font-semibold text-slate-600"
            >
              <Phone size={16} />
              전화
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
