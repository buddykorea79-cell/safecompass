"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocationStore } from "@/store/useLocationStore";
import KakaoMap, { type MapMarkerItem } from "@/components/KakaoMap";
import LayerToggleChips, { type MapLayer } from "@/components/LayerToggleChips";
import MarkerSheet from "@/components/MarkerSheet";
import type { DisasterLevel, Place, Shelter } from "@/types";

function MapScreenInner() {
  const location = useLocationStore((s) => s.location);
  const setLocation = useLocationStore((s) => s.setLocation);
  const router = useRouter();
  const searchParams = useSearchParams();
  const picking = searchParams.get("pick") === "1";

  const [center, setCenter] = useState({ lat: location.lat, lng: location.lng });
  const [activeLayers, setActiveLayers] = useState<Set<MapLayer>>(new Set(["shelter"]));
  const [markers, setMarkers] = useState<MapMarkerItem[]>([]);
  const [selected, setSelected] = useState<MapMarkerItem | null>(null);
  const [level, setLevel] = useState<DisasterLevel | undefined>(undefined);

  const loadMarkers = useCallback(
    async (c: { lat: number; lng: number }, layers: Set<MapLayer>) => {
      const results: MapMarkerItem[] = [];
      if (layers.has("shelter")) {
        const res = await fetch(`/api/shelters?lat=${c.lat}&lng=${c.lng}`);
        const json = await res.json();
        (json.shelters ?? []).forEach((s: Shelter) => results.push({ kind: "shelter", ...s }));
      }
      if (layers.has("hospital")) {
        const res = await fetch(`/api/places?lat=${c.lat}&lng=${c.lng}&category=hospital`);
        const json = await res.json();
        (json.places ?? []).forEach((p: Place) => results.push({ kind: "place", ...p }));
      }
      if (layers.has("pharmacy")) {
        const res = await fetch(`/api/places?lat=${c.lat}&lng=${c.lng}&category=pharmacy`);
        const json = await res.json();
        (json.places ?? []).forEach((p: Place) => results.push({ kind: "place", ...p }));
      }
      setMarkers(results);
    },
    []
  );

  useEffect(() => {
    if (picking) return;
    loadMarkers(center, activeLayers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picking]);

  useEffect(() => {
    if (picking) return;
    fetch(`/api/situation?region_code=${encodeURIComponent(location.region_code)}&region_keyword=${encodeURIComponent(location.label)}`)
      .then((res) => res.json())
      .then((json) => setLevel(json.situation?.level))
      .catch(() => setLevel(undefined));
  }, [picking, location.region_code, location.label]);

  function toggleLayer(layer: MapLayer) {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      loadMarkers(center, next);
      return next;
    });
  }

  async function handlePickConfirm(c: { lat: number; lng: number }) {
    try {
      const res = await fetch(`/api/geocode?lat=${c.lat}&lng=${c.lng}`);
      const json = await res.json();
      setLocation({
        region_code: json.region_code ?? `map-${c.lat.toFixed(3)}-${c.lng.toFixed(3)}`,
        label: json.label ?? "선택한 위치",
        lat: c.lat,
        lng: c.lng,
        source: "map",
      });
    } finally {
      router.replace("/");
    }
  }

  return (
    <main className="relative h-[calc(100vh-6rem)] w-full overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-between bg-gradient-to-b from-white/90 to-transparent px-5 pt-5 pb-8">
        <h1 className="text-lg font-bold text-slate-800">{picking ? "위치 선택" : "안전지도"}</h1>
      </div>

      {!picking && <LayerToggleChips active={activeLayers} onToggle={toggleLayer} />}

      <div className="h-full w-full">
        <KakaoMap
          center={center}
          markers={picking ? [] : markers}
          situationLevel={picking ? undefined : level}
          picking={picking}
          onMarkerClick={setSelected}
          onCenterSearch={(c) => {
            setCenter(c);
            loadMarkers(c, activeLayers);
          }}
          onPickConfirm={handlePickConfirm}
        />
      </div>

      {selected && <MarkerSheet item={selected} onClose={() => setSelected(null)} />}
    </main>
  );
}

export default function MapPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-sm text-slate-400">불러오는 중...</div>}>
      <MapScreenInner />
    </Suspense>
  );
}
