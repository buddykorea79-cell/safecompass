"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import type { ProviderStatus } from "@/lib/env";
import type { ApiLogEntry } from "@/lib/apiLog";

export default function AdminDashboardBody() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [log, setLog] = useState<ApiLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/status")
      .then((res) => res.json())
      .then((json) => {
        setProviders(json.providers ?? []);
        setLog(json.log ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <section className="mb-6">
        <h2 className="mb-3 text-sm font-bold text-slate-700">외부 API 연동 상태</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {providers.map((p) => (
            <div key={p.provider} className="rounded-2xl bg-white p-4 shadow-card">
              <div className="mb-1 flex items-center gap-1.5">
                {p.configured ? (
                  <CheckCircle2 size={15} className="text-brand-600" />
                ) : (
                  <XCircle size={15} className="text-slate-300" />
                )}
                <span className="text-sm font-semibold text-slate-700">{p.label}</span>
              </div>
              <p className="text-[11px] text-slate-400">{p.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-bold text-slate-700">최근 API 호출 로그</h2>
        <p className="mb-3 text-[11px] text-slate-400">
          DB 없이 서버 인스턴스 메모리에만 보관됩니다 — 재배포/재시작 시 초기화됩니다.
        </p>
        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-card" />
        ) : log.length === 0 ? (
          <p className="rounded-2xl bg-white p-5 text-center text-xs text-slate-400 shadow-card">
            아직 기록된 API 호출이 없습니다.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-card">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-medium">시각</th>
                  <th className="px-3 py-2 font-medium">provider</th>
                  <th className="px-3 py-2 font-medium">endpoint</th>
                  <th className="px-3 py-2 font-medium">결과</th>
                  <th className="px-3 py-2 font-medium">ms</th>
                </tr>
              </thead>
              <tbody>
                {log.slice(0, 50).map((entry, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 text-slate-400">{new Date(entry.timestamp).toLocaleTimeString("ko-KR")}</td>
                    <td className="px-3 py-2 text-slate-600">{entry.provider}</td>
                    <td className="px-3 py-2 text-slate-600">{entry.endpoint}</td>
                    <td className="px-3 py-2">
                      {entry.ok ? (
                        <span className="text-brand-600">성공</span>
                      ) : (
                        <span className="text-red-400">{entry.detail ?? "실패"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{entry.durationMs ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
