"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { ProviderStatus } from "@/lib/env";

const TEST_CASES: Record<ProviderStatus["provider"], { label: string; provider: string; params: Record<string, string> }> = {
  kma: { label: "날씨 조회 테스트", provider: "kma-weather", params: { lat: "36.48", lng: "127.289" } },
  safetydata: { label: "대피소 조회 테스트", provider: "safetydata-shelters", params: { lat: "36.48", lng: "127.289" } },
  kakao: { label: "좌표→지역 변환 테스트", provider: "kakao-geocode", params: { lat: "36.48", lng: "127.289" } },
  bizrouter: { label: "채팅 응답 테스트", provider: "bizrouter-chat", params: { message: "안녕하세요" } },
};

type Result = { ok: boolean; durationMs: number; detail?: string };

export default function AdminApiStatusBody({ providers }: { providers: ProviderStatus[] }) {
  const [results, setResults] = useState<Record<string, Result>>({});
  const [testing, setTesting] = useState<string | null>(null);

  async function runTest(provider: ProviderStatus) {
    const testCase = TEST_CASES[provider.provider];
    setTesting(provider.provider);
    const start = Date.now();
    try {
      const res = await fetch("/api/admin/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: testCase.provider, params: testCase.params }),
      });
      const json = await res.json();
      setResults((prev) => ({
        ...prev,
        [provider.provider]: { ok: res.ok && !json.fallback, durationMs: Date.now() - start, detail: json.message ?? json.error },
      }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [provider.provider]: { ok: false, durationMs: Date.now() - start, detail: "요청 실패" },
      }));
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-2.5">
      {providers.map((p) => {
        const testCase = TEST_CASES[p.provider];
        const result = results[p.provider];
        return (
          <div key={p.provider} className="rounded-2xl bg-white p-4 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {p.configured ? (
                  <CheckCircle2 size={15} className="text-brand-600" />
                ) : (
                  <XCircle size={15} className="text-slate-300" />
                )}
                <span className="text-sm font-semibold text-slate-700">{p.label}</span>
              </div>
              <button
                onClick={() => runTest(p)}
                disabled={testing === p.provider}
                className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
              >
                {testing === p.provider && <Loader2 size={11} className="animate-spin" />}
                {testCase.label}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">{p.detail}</p>
            {result && (
              <p className={`mt-2 text-[11px] font-medium ${result.ok ? "text-brand-600" : "text-red-400"}`}>
                {result.ok ? "성공" : "실패"} · {result.durationMs}ms{result.detail ? ` · ${result.detail}` : ""}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
