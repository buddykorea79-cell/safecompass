"use client";

import clsx from "clsx";

export type AlertFilterKey = "all" | "message" | "weather";

const FILTERS: { key: AlertFilterKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "message", label: "재난문자" },
  { key: "weather", label: "기상특보" },
];

export default function AlertFilterBar({
  active,
  onChange,
  region,
  onRegionChange,
}: {
  active: AlertFilterKey;
  onChange: (key: AlertFilterKey) => void;
  region: string;
  onRegionChange: (value: string) => void;
}) {
  return (
    <div className="sticky top-0 z-10 bg-[#f6f7f9] px-5 pt-5 pb-3">
      <h1 className="mb-3 text-lg font-bold text-slate-800">공식 알림</h1>
      <input
        value={region}
        onChange={(e) => onRegionChange(e.target.value)}
        placeholder="지역으로 검색 (예: 세종특별자치시)"
        className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
      />
      <div className="flex gap-2">
        {FILTERS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors",
              active === key ? "bg-brand-600 text-white" : "bg-white text-slate-500 shadow-card"
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
