"use client";

import { useEffect, useState } from "react";
import { Sun, Cloud, CloudRain, CloudSnow, CloudDrizzle, CloudOff } from "lucide-react";
import type { WeatherSnapshot } from "@/types";

function WeatherIcon({ sky, precipType }: Pick<WeatherSnapshot, "sky" | "precipType">) {
  const cls = "text-brand-600";
  if (precipType === "rain" || precipType === "rain_snow") return <CloudRain size={34} className={cls} />;
  if (precipType === "snow") return <CloudSnow size={34} className={cls} />;
  if (precipType === "shower") return <CloudDrizzle size={34} className={cls} />;
  if (sky === "clear") return <Sun size={34} className="text-amber-400" />;
  if (sky === "partly_cloudy" || sky === "cloudy" || sky === "overcast") return <Cloud size={34} className={cls} />;
  return <CloudOff size={34} className="text-slate-300" />;
}

const SKY_LABEL: Record<WeatherSnapshot["sky"], string> = {
  clear: "맑음",
  partly_cloudy: "구름 조금",
  cloudy: "구름 많음",
  overcast: "흐림",
  unknown: "정보 없음",
};

export default function WeatherCard({ lat, lng }: { lat: number; lng: number }) {
  const [data, setData] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/weather?lat=${lat}&lng=${lng}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return (
    <div className="mx-5 mt-3 rounded-2xl bg-white p-5 shadow-card">
      {loading ? (
        <div className="h-20 animate-pulse rounded-xl bg-slate-100" />
      ) : !data || data.fallback || data.temp === null ? (
        <div className="flex items-center gap-3 text-slate-400">
          <CloudOff size={30} />
          <div>
            <p className="text-sm font-medium text-slate-500">날씨 정보를 불러올 수 없습니다</p>
            <p className="text-xs text-slate-400">{data?.message ?? "기상청 API 키가 설정되면 표시됩니다"}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <WeatherIcon sky={data.sky} precipType={data.precipType} />
            <div>
              <p className="text-3xl font-bold text-slate-800">{Math.round(data.temp)}°</p>
              <p className="text-xs text-slate-400">
                {SKY_LABEL[data.sky]}
                {data.feelsLike !== null && ` · 체감 ${Math.round(data.feelsLike)}°`}
              </p>
            </div>
          </div>
          <div className="text-right text-xs text-slate-400">
            {data.tmx !== null && data.tmn !== null && (
              <p>
                최고 <span className="font-semibold text-red-400">{Math.round(data.tmx)}°</span> / 최저{" "}
                <span className="font-semibold text-blue-400">{Math.round(data.tmn)}°</span>
              </p>
            )}
            {data.precipProbability !== null && <p className="mt-1">강수확률 {data.precipProbability}%</p>}
            {data.humidity !== null && <p className="mt-1">습도 {data.humidity}%</p>}
          </div>
        </div>
      )}
    </div>
  );
}
