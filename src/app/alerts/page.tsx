"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocationStore } from "@/store/useLocationStore";
import { ALERTS_CACHE_KEY } from "@/lib/alertsCache";
import AlertFilterBar, { type AlertFilterKey } from "@/components/AlertFilterBar";
import AlertListItem, { type UnifiedAlert } from "@/components/AlertListItem";
import type { DisasterMessage, WeatherAlert } from "@/types";

export default function AlertsPage() {
  const location = useLocationStore((s) => s.location);
  const [filter, setFilter] = useState<AlertFilterKey>("all");
  const [region, setRegion] = useState("");
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [fallback, setFallback] = useState({ messages: false, alerts: false });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const q = region.trim() || location.label;
    fetch(`/api/alerts?region=${encodeURIComponent(q)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        const messages: UnifiedAlert[] = (json.messages ?? []).map((m: DisasterMessage) => ({ kind: "message" as const, ...m }));
        const weather: UnifiedAlert[] = (json.alerts ?? []).map((a: WeatherAlert) => ({ kind: "weather" as const, ...a }));
        const merged = [...messages, ...weather].sort(
          (a, b) => new Date(b.issued_at).getTime() - new Date(a.issued_at).getTime()
        );
        setAlerts(merged);
        setFallback({ messages: Boolean(json.messagesFallback), alerts: Boolean(json.alertsFallback) });
        if (typeof window !== "undefined") {
          sessionStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify(merged));
        }
      })
      .catch(() => {
        if (!cancelled) setAlerts([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const filtered = useMemo(
    () =>
      alerts.filter((a) => {
        if (filter === "all") return true;
        if (filter === "weather") return a.kind === "weather";
        if (a.kind !== "message") return false;
        const isBreaking = a.service === "10748" || a.msg_type === "재난문자(속보)";
        return filter === "breaking" ? isBreaking : !isBreaking;
      }),
    [alerts, filter]
  );
  const bothFallback = fallback.messages && fallback.alerts;

  return (
    <main className="min-h-screen">
      <AlertFilterBar active={filter} onChange={setFilter} region={region} onRegionChange={setRegion} />
      <div className="px-5 pb-6">
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-white shadow-card" />
            ))}
          </div>
        ) : bothFallback ? (
          <p className="mt-10 text-center text-sm text-slate-400">
            API 키가 설정되지 않아 알림을 불러올 수 없습니다.
          </p>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-slate-400">해당 조건의 알림이 없습니다.</p>
        ) : (
          filtered.map((alert) => <AlertListItem key={`${alert.kind}-${alert.id}`} alert={alert} />)
        )}
      </div>
    </main>
  );
}
