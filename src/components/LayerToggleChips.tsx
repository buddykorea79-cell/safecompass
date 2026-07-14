"use client";

import clsx from "clsx";

export type MapLayer = "situation" | "shelter" | "hospital" | "pharmacy";

const LAYERS: { key: MapLayer; label: string }[] = [
  { key: "situation", label: "상황정보" },
  { key: "shelter", label: "대피소" },
  { key: "hospital", label: "병원" },
  { key: "pharmacy", label: "약국" },
];

export default function LayerToggleChips({
  active,
  onToggle,
  className,
}: {
  active: Set<MapLayer>;
  onToggle: (layer: MapLayer) => void;
  className?: string;
}) {
  return (
    <div className={clsx("no-scrollbar flex gap-2 overflow-x-auto", className)}>
      {LAYERS.map(({ key, label }) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={isActive}
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
