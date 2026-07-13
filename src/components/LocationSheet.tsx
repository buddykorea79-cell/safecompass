"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, LocateFixed, MapPinned, Loader2 } from "lucide-react";
import { useLocationStore } from "@/store/useLocationStore";
import { listSido, listSigunguBySido, REGIONS } from "@/lib/regions";

export default function LocationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const setLocation = useLocationStore((s) => s.setLocation);
  const router = useRouter();
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [sido, setSido] = useState<string>(listSido()[0]);

  const sigunguOptions = useMemo(() => listSigunguBySido(sido), [sido]);

  if (!open) return null;

  async function useGps() {
    setGpsError(null);
    if (!("geolocation" in navigator)) {
      setGpsError("이 브라우저에서는 위치 확인을 지원하지 않습니다.");
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`);
          const json = await res.json();
          setLocation({
            region_code: json.region_code ?? `gps-${lat.toFixed(3)}-${lng.toFixed(3)}`,
            label: json.label ?? "현재 위치",
            lat,
            lng,
            source: "gps",
          });
        } finally {
          setGpsLoading(false);
          onClose();
        }
      },
      () => {
        setGpsError("위치 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해 주세요.");
        setGpsLoading(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function selectRegion(code: string) {
    const region = REGIONS.find((r) => r.region_code === code);
    if (!region) return;
    setLocation({
      region_code: region.region_code,
      label: region.label,
      lat: region.lat,
      lng: region.lng,
      source: "manual",
    });
    onClose();
  }

  function pickOnMap() {
    onClose();
    router.push("/map?pick=1");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative w-full max-w-lg animate-slide-up rounded-t-3xl bg-white p-5 pb-8 shadow-sheet">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">위치 설정</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <button
          onClick={useGps}
          disabled={gpsLoading}
          className="mb-2.5 flex w-full items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3.5 text-left"
        >
          {gpsLoading ? (
            <Loader2 size={20} className="animate-spin text-brand-600" />
          ) : (
            <LocateFixed size={20} className="text-brand-600" />
          )}
          <div>
            <p className="text-sm font-semibold text-brand-700">현재 위치로 설정</p>
            <p className="text-xs text-brand-600/70">GPS로 내 위치를 자동으로 찾습니다</p>
          </div>
        </button>
        {gpsError && <p className="mb-2 px-1 text-xs text-red-500">{gpsError}</p>}

        <button
          onClick={pickOnMap}
          className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-left"
        >
          <MapPinned size={20} className="text-slate-500" />
          <div>
            <p className="text-sm font-semibold text-slate-700">지도에서 선택</p>
            <p className="text-xs text-slate-400">지도를 움직여 원하는 위치를 지정합니다</p>
          </div>
        </button>

        <div className="rounded-2xl border border-slate-200 p-3.5">
          <p className="mb-2.5 text-xs font-semibold text-slate-500">시도·시군구로 선택</p>
          <div className="mb-2.5 flex gap-2 overflow-x-auto no-scrollbar">
            {listSido().map((s) => (
              <button
                key={s}
                onClick={() => setSido(s)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  s === sido ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="grid max-h-48 grid-cols-2 gap-1.5 overflow-y-auto">
            {sigunguOptions.map((region) => (
              <button
                key={region.region_code}
                onClick={() => selectRegion(region.region_code)}
                className="rounded-xl px-3 py-2 text-left text-sm text-slate-600 hover:bg-slate-50"
              >
                {region.sigungu ?? region.eupmyeondong ?? region.sido}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
