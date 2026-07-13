"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, Flame, Users } from "lucide-react";
import clsx from "clsx";

type GuideSummary = { id: string; category: "natural" | "social"; name: string };

type Tab = "all" | "natural" | "social";

export default function GuideTypeGrid({ highlightIds = [] as string[] }: { highlightIds?: string[] }) {
  const [all, setAll] = useState<GuideSummary[]>([]);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GuideSummary[] | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/guide/list")
      .then((res) => res.json())
      .then((json) => setAll(json.types ?? []));
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/guide/search?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((json) => {
          if (!cancelled) setSearchResults((json.results ?? []).map((r: any) => r.guide));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const list = useMemo(() => {
    const base = searchResults ?? all;
    return tab === "all" ? base : base.filter((g) => g.category === tab);
  }, [searchResults, all, tab]);

  return (
    <div>
      <div className="relative mb-3">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="재난 유형이나 상황을 검색해보세요"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:outline-none"
        />
      </div>

      <div className="mb-3 flex gap-2">
        {[
          { key: "all" as const, label: "전체" },
          { key: "natural" as const, label: "자연재난" },
          { key: "social" as const, label: "사회재난" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold",
              tab === key ? "bg-brand-600 text-white" : "bg-white text-slate-500 shadow-card"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {searching ? (
        <p className="py-6 text-center text-xs text-slate-400">검색 중...</p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-xs text-slate-400">결과가 없습니다.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2.5">
          {list.map((g) => (
            <Link
              key={g.id}
              href={`/guide/${encodeURIComponent(g.id)}`}
              className={clsx(
                "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl bg-white p-2 text-center shadow-card",
                highlightIds.includes(g.id) && "ring-2 ring-brand-400"
              )}
            >
              {g.category === "natural" ? (
                <Flame size={18} className="text-brand-500" />
              ) : (
                <Users size={18} className="text-slate-400" />
              )}
              <span className="line-clamp-2 text-[11px] font-medium leading-tight text-slate-600">{g.name}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
