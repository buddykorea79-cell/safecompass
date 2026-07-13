"use client";

import { useLocationStore } from "@/store/useLocationStore";
import LocationBar from "@/components/LocationBar";
import WeatherCard from "@/components/WeatherCard";
import SituationCard from "@/components/SituationCard";
import QuickMenu from "@/components/QuickMenu";
import ShelterPreviewCard from "@/components/ShelterPreviewCard";

export default function HomePage() {
  const location = useLocationStore((s) => s.location);

  return (
    <main className="pb-8">
      <LocationBar />
      <WeatherCard lat={location.lat} lng={location.lng} />
      <SituationCard regionCode={location.region_code} regionLabel={location.label} />
      <QuickMenu />
      <ShelterPreviewCard lat={location.lat} lng={location.lng} />
    </main>
  );
}
