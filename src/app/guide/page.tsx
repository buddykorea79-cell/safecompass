"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocationStore } from "@/store/useLocationStore";
import SituationTypeCard from "@/components/SituationTypeCard";
import DailyGuideRecommendationCard from "@/components/DailyGuideRecommendationCard";
import GuideChat from "@/components/GuideChat";
import GuideTypeGrid from "@/components/GuideTypeGrid";

function GuidePageInner() {
  const location = useLocationStore((s) => s.location);
  const searchParams = useSearchParams();
  const highlightIds = (searchParams.get("types") ?? "").split(",").filter(Boolean);
  const [disasterTypes, setDisasterTypes] = useState<string[]>([]);

  useEffect(() => {
    fetch(
      `/api/situation?region_code=${encodeURIComponent(location.region_code)}&region_keyword=${encodeURIComponent(location.label)}`
    )
      .then((res) => res.json())
      .then((json) => {
        const situation = json.situation;
        if (situation && situation.level >= 2) setDisasterTypes(situation.disaster_types ?? []);
      })
      .catch(() => setDisasterTypes([]));
  }, [location.region_code, location.label]);

  return (
    <main className="min-h-screen px-5 pt-5 pb-8">
      <h1 className="mb-4 text-lg font-bold text-slate-800">행동요령</h1>
      <DailyGuideRecommendationCard
        regionCode={location.region_code}
        regionLabel={location.label}
        lat={location.lat}
        lng={location.lng}
      />
      <SituationTypeCard disasterTypes={disasterTypes} />
      <div className="mb-5">
        <GuideChat />
      </div>
      <GuideTypeGrid highlightIds={highlightIds} />
    </main>
  );
}

export default function GuidePage() {
  return (
    <Suspense fallback={<div className="p-5 text-sm text-slate-400">불러오는 중...</div>}>
      <GuidePageInner />
    </Suspense>
  );
}
