"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

const PROVIDERS = [
  { value: "kma-weather", label: "기상청 - 날씨 조회", fields: ["lat", "lng"] },
  { value: "kma-alerts", label: "기상청 - 특보 조회", fields: ["region"] },
  { value: "safetydata-messages", label: "재난안전데이터 - 재난문자", fields: ["region"] },
  { value: "safetydata-shelters", label: "재난안전데이터 - 대피소", fields: ["lat", "lng"] },
  { value: "kakao-places", label: "카카오 - 병원/약국 검색", fields: ["lat", "lng", "category"] },
  { value: "kakao-geocode", label: "카카오 - 좌표→지역 변환", fields: ["lat", "lng"] },
  { value: "bizrouter-chat", label: "bizrouter - 채팅 테스트", fields: ["message"] },
];

const FIELD_LABEL: Record<string, string> = {
  lat: "위도 (lat)",
  lng: "경도 (lng)",
  region: "지역 키워드 (region)",
  category: "카테고리 (hospital/pharmacy)",
  message: "메시지 (message)",
};

export default function AdminApiTestBody() {
  const [providerKey, setProviderKey] = useState(PROVIDERS[0].value);
  const [params, setParams] = useState<Record<string, string>>({ lat: "36.48", lng: "127.289" });
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<string | null>(null);

  const provider = PROVIDERS.find((p) => p.value === providerKey)!;

  async function run() {
    setLoading(true);
    setResponse(null);
    try {
      const res = await fetch("/api/admin/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: providerKey, params }),
      });
      const json = await res.json();
      setResponse(JSON.stringify(json, null, 2));
    } catch {
      setResponse("요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 rounded-2xl bg-white p-4 shadow-card">
        <label className="mb-1.5 block text-xs font-semibold text-slate-500">테스트할 API</label>
        <select
          value={providerKey}
          onChange={(e) => setProviderKey(e.target.value)}
          className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
        >
          {PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>

        <div className="space-y-2.5">
          {provider.fields.map((f) => (
            <div key={f}>
              <label className="mb-1 block text-xs font-medium text-slate-500">{FIELD_LABEL[f]}</label>
              <input
                value={params[f] ?? ""}
                onChange={(e) => setParams((prev) => ({ ...prev, [f]: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
              />
            </div>
          ))}
        </div>

        <button
          onClick={run}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading && <Loader2 size={14} className="animate-spin" />}
          실행
        </button>
      </div>

      {response && (
        <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100 shadow-card">
          {response}
        </pre>
      )}
    </div>
  );
}
