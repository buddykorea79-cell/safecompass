"use client";

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import type { GuideType } from "@/types";

export default function GuideDetailBody({ guide }: { guide: GuideType }) {
  const [mode, setMode] = useState<"original" | "simple">("original");
  const [simpleText, setSimpleText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  async function showSimple() {
    if (simpleText) {
      setMode("simple");
      return;
    }
    setLoading(true);
    setUnavailable(false);
    try {
      const res = await fetch("/api/guide/simplify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: guide.id }),
      });
      const json = await res.json();
      if (json.available) {
        setSimpleText(json.text);
        setMode("simple");
      } else {
        setUnavailable(true);
      }
    } catch {
      setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setMode("original")}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            mode === "original" ? "bg-brand-600 text-white" : "bg-white text-slate-500 shadow-card"
          }`}
        >
          원문
        </button>
        <button
          onClick={showSimple}
          disabled={loading}
          className={`flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            mode === "simple" ? "bg-brand-600 text-white" : "bg-white text-slate-500 shadow-card"
          }`}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          쉬운말
        </button>
      </div>

      {unavailable && (
        <p className="mb-3 text-xs text-amber-500">
          쉬운말 변환은 AI(LLM) 연동 이후 사용할 수 있습니다. 지금은 원문을 표시합니다.
        </p>
      )}

      {mode === "simple" && simpleText ? (
        <div className="whitespace-pre-line rounded-2xl bg-white p-5 text-sm leading-relaxed text-slate-700 shadow-card">
          {simpleText}
        </div>
      ) : (
        <div className="space-y-4">
          {guide.sections.map((section, i) => (
            <div key={i} className="rounded-2xl bg-white p-5 shadow-card">
              <h3 className="mb-2 text-sm font-bold text-slate-800">{section.heading}</h3>
              {section.text && <p className="text-sm leading-relaxed text-slate-600">{section.text}</p>}
              {section.items && section.items.length > 0 && (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
                  {section.items.map((it, j) => (
                    <li key={j}>{it}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {guide.source && <p className="mt-4 text-[11px] text-slate-400">출처: {guide.source}</p>}
    </div>
  );
}
