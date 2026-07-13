"use client";

// 전역 위치 상태 (설계서 4.6/12장) — Zustand, localStorage에 영속화

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_REGION } from "@/lib/regions";
import type { LocationState } from "@/types";

interface LocationStore {
  location: LocationState;
  setLocation: (location: LocationState) => void;
}

export const useLocationStore = create<LocationStore>()(
  persist(
    (set) => ({
      location: {
        region_code: DEFAULT_REGION.region_code,
        label: DEFAULT_REGION.label,
        lat: DEFAULT_REGION.lat,
        lng: DEFAULT_REGION.lng,
        source: "default",
      },
      setLocation: (location) => set({ location }),
    }),
    { name: "safecompass-location" }
  )
);
