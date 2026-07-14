"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import type { DailyGuideRecommendation } from "@/lib/dailyGuideRecommendation";

interface DailyGuideResponse {
  recommendation: DailyGuideRecommendation;
  dataFallback: boolean;
}

function browserKstDate(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isDailyGuideResponse(value: unknown, date: string): value is DailyGuideResponse {
  const candidate = value as DailyGuideResponse | null;
  return Boolean(
    candidate?.recommendation?.date === date &&
      candidate.recommendation.guide?.id &&
      candidate.recommendation.guide?.name
  );
}

export default function DailyGuideRecommendationCard({
  regionCode,
  regionLabel,
  lat,
  lng,
}: {
  regionCode: string;
  regionLabel: string;
  lat: number;
  lng: number;
}) {
  const [result, setResult] = useState<DailyGuideResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const date = browserKstDate();
    const storageKey = `sc_daily_guide:${date}:${regionCode}`;

    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed: unknown = JSON.parse(cached);
        if (isDailyGuideResponse(parsed, date)) {
          setResult(parsed);
          setLoading(false);
          return;
        }
      }
    } catch {
      // 저장 공간을 사용할 수 없어도 서버 결과는 정상적으로 표시한다.
    }

    const params = new URLSearchParams({
      region_code: regionCode,
      region: regionLabel,
      lat: String(lat),
      lng: String(lng),
    });
    setLoading(true);
    fetch(`/api/guide/daily?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json: unknown) => {
        if (cancelled || !isDailyGuideResponse(json, date)) return;
        setResult(json);
        try {
          localStorage.setItem(storageKey, JSON.stringify(json));
        } catch {
          // 캐시 실패는 화면 표시에 영향을 주지 않는다.
        }
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng, regionCode, regionLabel]);

  if (loading) return <div className="mb-4 h-36 animate-pulse rounded-2xl bg-white shadow-card" />;
  if (!result) return null;

  const { recommendation } = result;
  const categoryLabel = recommendation.guide.category === "natural" ? "자연재난" : "사회재난";
  const dotClass = recommendation.guide.category === "natural" ? "bg-sky-500" : "bg-orange-500";

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card" aria-labelledby="daily-guide-title">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-brand-600">
            <Sparkles size={13} />
            오늘의 맞춤 행동요령
          </p>
          <h2 id="daily-guide-title" className="text-lg font-bold text-slate-800">
            {recommendation.guide.name}
          </h2>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-500">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
          {categoryLabel}
        </span>
      </div>

      <p className="text-sm leading-relaxed text-slate-600">{recommendation.reason}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {recommendation.signals.map((signal) => (
          <span key={signal} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">
            {signal}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <p className="text-[11px] text-slate-400">
          하루 1회 · 재난문자 {recommendation.sources.disasterMessageCount}건
          {recommendation.sources.weatherAlertCount > 0
            ? ` · 기상특보 ${recommendation.sources.weatherAlertCount}건`
            : ""}
          {recommendation.sources.weatherAvailable ? " · 동네예보 반영" : " · 계절 기준 보완"}
        </p>
        <Link
          href={`/guide/${encodeURIComponent(recommendation.guide.id)}`}
          className="flex items-center gap-0.5 text-xs font-bold text-brand-600"
        >
          자세히 <ArrowRight size={13} />
        </Link>
      </div>
    </section>
  );
}
