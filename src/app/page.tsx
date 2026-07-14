"use client";

import { useLocationStore } from "@/store/useLocationStore";
import LocationBar from "@/components/LocationBar";
import HomeSafetyMap from "@/components/HomeSafetyMap";
import WeatherCard from "@/components/WeatherCard";
import QuickMenu from "@/components/QuickMenu";

export default function HomePage() {
  const location = useLocationStore((s) => s.location);

  return (
    <main className="pb-8">
      <LocationBar />
      <HomeSafetyMap
        lat={location.lat}
        lng={location.lng}
        regionCode={location.region_code}
        regionLabel={location.label}
      />
      <WeatherCard lat={location.lat} lng={location.lng} />
      <QuickMenu />
    </main>
  );
}
