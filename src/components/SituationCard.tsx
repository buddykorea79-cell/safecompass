"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, ShieldCheck } from "lucide-react";
import LevelBadge from "./LevelBadge";
import type { DisasterSituation } from "@/types";
import clsx from "clsx";

export default function SituationCard({ regionCode, regionLabel }: { regionCode: string; regionLabel: string }) {
  const [situation, setSituation] = useState<DisasterSituation | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/situation?region_code=${encodeURIComponent(regionCode)}&region_keyword=${encodeURIComponent(regionLabel)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setSituation(json.situation ?? null);
      })
      .catch(() => {
        if (!cancelled) setSituation(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regionCode, regionLabel]);

  if (loading) {
    return (
      <div className="mx-5 mt-3 h-24 animate-pulse rounded-2xl bg-white shadow-card" />
    );
  }

  const level = situation?.level ?? 1;
  const isElevated = level >= 3;

  return (
    <button
      onClick={() => router.push(`/situation/${encodeURIComponent(regionCode)}?label=${encodeURIComponent(regionLabel)}`)}
      className={clsx(
        "mx-5 mt-3 flex w-[calc(100%-2.5rem)] items-center justify-between rounded-2xl bg-white p-5 text-left shadow-card transition-transform active:scale-[0.99]",
        isElevated && "animate-pulse-soft ring-1 ring-inset ring-level-alert/30"
      )}
    >
      <div className="flex items-start gap-3">
        {level === 1 ? (
          <ShieldCheck size={26} className="mt-0.5 shrink-0 text-level-normal" />
        ) : (
          <div className="mt-0.5" />
        )}
        <div>
          <LevelBadge level={level} pulse={isElevated} />
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {situation?.summary ?? "현재 안전한 상태입니다."}
          </p>
        </div>
      </div>
      <ChevronRight size={18} className="shrink-0 text-slate-300" />
    </button>
  );
}
