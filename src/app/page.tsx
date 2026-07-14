"use client";

import { useLocationStore } from "@/store/useLocationStore";
import HomeSafetyMap from "@/components/HomeSafetyMap";
import WeatherCard from "@/components/WeatherCard";

export default function HomePage() {
  const location = useLocationStore((s) => s.location);

  return (
    <main className="pb-8">
      <HomeSafetyMap
        lat={location.lat}
        lng={location.lng}
        regionCode={location.region_code}
        regionLabel={location.label}
      />
      <WeatherCard lat={location.lat} lng={location.lng} />
    </main>
  );
}
