"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

type GuideSummary = { id: string; category: "natural" | "social"; name: string };

export default function SituationTypeCard({ disasterTypes }: { disasterTypes: string[] }) {
  const [guides, setGuides] = useState<GuideSummary[]>([]);

  useEffect(() => {
    if (disasterTypes.length === 0) {
      setGuides([]);
      return;
    }
    fetch(`/api/guide/similar?types=${encodeURIComponent(disasterTypes.join(","))}`)
      .then((res) => res.json())
      .then((json) => setGuides(json.guides ?? []))
      .catch(() => setGuides([]));
  }, [disasterTypes]);

  if (guides.length === 0) return null;

  return (
    <div className="mb-4 rounded-2xl border border-level-alert/20 bg-level-alert/5 p-4">
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-level-alert">
        <AlertCircle size={14} />
        현재 상황과 관련된 행동요령
      </p>
      <div className="flex flex-wrap gap-2">
        {guides.map((g) => (
          <Link
            key={g.id}
            href={`/guide/${encodeURIComponent(g.id)}`}
            className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-card"
          >
            {g.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
