"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { GuideType } from "@/types";

export default function AdminTypesBody({ types }: { types: GuideType[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => types.filter((t) => t.name.toLowerCase().includes(query.toLowerCase())),
    [types, query]
  );

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="유형명 검색"
        className="mb-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
      />
      <p className="mb-3 text-xs text-slate-400">총 {filtered.length}건 (읽기 전용, 정적 JSON 원본)</p>
      <div className="space-y-2">
        {filtered.map((g) => {
          const open = openId === g.id;
          return (
            <div key={g.id} className="rounded-2xl bg-white shadow-card">
              <button
                onClick={() => setOpenId(open ? null : g.id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div>
                  <span className="mr-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                    {g.category === "natural" ? "자연" : "사회"}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">{g.name}</span>
                </div>
                <ChevronDown size={16} className={clsx("text-slate-400 transition-transform", open && "rotate-180")} />
              </button>
              {open && (
                <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
                  {g.sections.map((s, i) => (
                    <div key={i} className="mb-2">
                      <p className="font-semibold text-slate-700">{s.heading}</p>
                      {s.text && <p className="mt-0.5">{s.text}</p>}
                      {s.items && (
                        <ul className="mt-0.5 list-disc pl-4">
                          {s.items.map((it, j) => (
                            <li key={j}>{it}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {g.source && <p className="mt-1 text-[10px] text-slate-400">출처: {g.source}</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
