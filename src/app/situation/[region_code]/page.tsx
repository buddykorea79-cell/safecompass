"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MapPin, BookOpen, Sparkles } from "lucide-react";
import LevelBadge from "@/components/LevelBadge";
import type { DisasterSituation } from "@/types";

function SituationDetailInner() {
  const params = useParams<{ region_code: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const label = searchParams.get("label") ?? "";
  const regionCode = decodeURIComponent(params.region_code);

  const [situation, setSituation] = useState<DisasterSituation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/situation?region_code=${encodeURIComponent(regionCode)}&region_keyword=${encodeURIComponent(label)}`)
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setSituation(json.situation ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [regionCode, label]);

  return (
    <main className="min-h-screen pb-8">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={() => router.back()} className="rounded-full p-1.5 hover:bg-slate-100">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h1 className="text-base font-bold text-slate-800">{label || regionCode} 재난상황</h1>
      </div>

      {loading || !situation ? (
        <div className="mx-5 h-40 animate-pulse rounded-2xl bg-white shadow-card" />
      ) : (
        <>
          <div className="mx-5 rounded-2xl bg-white p-5 shadow-card">
            <LevelBadge level={situation.level} size="lg" pulse={situation.level >= 3} />
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{situation.summary}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">{situation.reasoning}</p>
            {situation.used_llm && (
              <p className="mt-3 flex items-center gap-1 text-[11px] font-medium text-brand-600">
                <Sparkles size={12} />
                AI 2차 판정이 반영되었습니다
              </p>
            )}
            {situation.needs_review && (
              <p className="mt-1 text-[11px] font-medium text-amber-500">
                일부 판정 근거는 검토가 필요할 수 있습니다
              </p>
            )}
          </div>

          <div className="mx-5 mt-3 grid grid-cols-2 gap-2.5">
            <Link
              href={`/guide?types=${encodeURIComponent(situation.disaster_types.join(","))}`}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-brand-600 py-4 text-white shadow-card"
            >
              <BookOpen size={20} />
              <span className="text-xs font-semibold">행동요령 보기</span>
            </Link>
            <Link
              href="/map"
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-white py-4 text-slate-700 shadow-card"
            >
              <MapPin size={20} className="text-brand-600" />
              <span className="text-xs font-semibold">안전지도 보기</span>
            </Link>
          </div>

          {situation.source_messages.length > 0 && (
            <div className="mx-5 mt-5">
              <h2 className="mb-2 text-xs font-bold text-slate-500">재난문자 원문</h2>
              <div className="space-y-2">
                {situation.source_messages.map((m) => (
                  <div key={m.id} className="rounded-xl bg-white p-3.5 text-xs text-slate-600 shadow-card">
                    <p className="mb-1 font-semibold text-slate-700">{m.msg_type}</p>
                    <p>{m.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {situation.source_alerts.length > 0 && (
            <div className="mx-5 mt-5">
              <h2 className="mb-2 text-xs font-bold text-slate-500">기상특보 원문</h2>
              <div className="space-y-2">
                {situation.source_alerts.map((a) => (
                  <div key={a.id} className="rounded-xl bg-white p-3.5 text-xs text-slate-600 shadow-card">
                    <p className="mb-1 font-semibold text-slate-700">
                      {a.alert_kind} {a.alert_level}
                    </p>
                    {a.content && <p>{a.content}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function SituationDetailPage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm text-slate-400">불러오는 중...</div>}>
      <SituationDetailInner />
    </Suspense>
  );
}
