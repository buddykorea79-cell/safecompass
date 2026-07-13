"use client";

import clsx from "clsx";

export type MapLayer = "shelter" | "hospital" | "pharmacy";

const LAYERS: { key: MapLayer; label: string }[] = [
  { key: "shelter", label: "대피소" },
  { key: "hospital", label: "병원" },
  { key: "pharmacy", label: "약국" },
];

export default function LayerToggleChips({
  active,
  onToggle,
}: {
  active: Set<MapLayer>;
  onToggle: (layer: MapLayer) => void;
}) {
  return (
    <div className="absolute top-4 left-4 z-10 flex gap-2">
      {LAYERS.map(({ key, label }) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            onClick={() => onToggle(key)}
            className={clsx(
              "rounded-full px-3.5 py-2 text-xs font-semibold shadow-card transition-colors",
              isActive ? "bg-brand-600 text-white" : "bg-white text-slate-500"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
