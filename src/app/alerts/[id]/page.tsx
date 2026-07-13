"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle, CloudLightning, Sparkles } from "lucide-react";
import { useLocationStore } from "@/store/useLocationStore";
import { ALERTS_CACHE_KEY } from "@/lib/alertsCache";
import type { UnifiedAlert } from "@/components/AlertListItem";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const location = useLocationStore((s) => s.location);
  const [alert, setAlert] = useState<UnifiedAlert | null | undefined>(undefined);
  const [summary, setSummary] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [summarizing, setSummarizing] = useState(false);

  useEffect(() => {
    const id = decodeURIComponent(params.id);
    const cached = sessionStorage.getItem(ALERTS_CACHE_KEY);
    if (cached) {
      const list: UnifiedAlert[] = JSON.parse(cached);
      const found = list.find((a) => `${a.kind}-${a.id}` === id);
      if (found) {
        setAlert(found);
        return;
      }
    }
    fetch(`/api/alerts?region=${encodeURIComponent(location.label)}`)
      .then((res) => res.json())
      .then((json) => {
        const messages: UnifiedAlert[] = (json.messages ?? []).map((m: any) => ({ kind: "message" as const, ...m }));
        const weather: UnifiedAlert[] = (json.alerts ?? []).map((a: any) => ({ kind: "weather" as const, ...a }));
        const found = [...messages, ...weather].find((a) => `${a.kind}-${a.id}` === id);
        setAlert(found ?? null);
      })
      .catch(() => setAlert(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function toggleSummary() {
    if (!alert) return;
    if (showSummary) {
      setShowSummary(false);
      return;
    }
    if (summary) {
      setShowSummary(true);
      return;
    }
    setSummarizing(true);
    try {
      const content = alert.kind === "message" ? alert.content : alert.content ?? `${alert.alert_kind} ${alert.alert_level} 발표`;
      const res = await fetch("/api/alerts/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      setSummary(json.summary);
      setShowSummary(true);
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <main className="min-h-screen pb-8">
      <div className="flex items-center gap-3 px-5 pt-5 pb-3">
        <button onClick={() => router.back()} className="rounded-full p-1.5 hover:bg-slate-100">
          <ArrowLeft size={20} className="text-slate-600" />
        </button>
        <h1 className="text-base font-bold text-slate-800">알림 상세</h1>
      </div>

      {alert === undefined ? (
        <div className="mx-5 h-40 animate-pulse rounded-2xl bg-white shadow-card" />
      ) : alert === null ? (
        <p className="mt-10 text-center text-sm text-slate-400">알림 정보를 찾을 수 없습니다.</p>
      ) : (
        <div className="mx-5 rounded-2xl bg-white p-5 shadow-card">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-brand-600">
            {alert.kind === "message" ? <AlertTriangle size={13} /> : <CloudLightning size={13} />}
            {alert.kind === "message" ? alert.msg_type : `${alert.alert_kind} ${alert.alert_level}`}
          </div>
          <p className="mb-1 text-xs text-slate-400">{formatTime(alert.issued_at)}</p>
          <p className="mb-4 text-xs text-slate-400">{alert.region_codes.join(", ") || "전국"}</p>

          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {showSummary && summary ? summary : alert.kind === "message" ? alert.content : alert.content ?? "상세 내용이 제공되지 않았습니다."}
          </p>

          <button
            onClick={toggleSummary}
            disabled={summarizing}
            className="mt-4 flex items-center gap-1.5 rounded-full bg-brand-50 px-3.5 py-2 text-xs font-semibold text-brand-600"
          >
            <Sparkles size={13} />
            {summarizing ? "요약 중..." : showSummary ? "원문 보기" : "쉬운 요약 보기"}
          </button>
        </div>
      )}
    </main>
  );
}
