import { LEVEL_COLOR_KEYS, LEVEL_NAMES } from "@/types";
import type { DisasterLevel } from "@/types";
import clsx from "clsx";

const DOT_CLASS: Record<string, string> = {
  normal: "bg-level-normal",
  interest: "bg-level-interest",
  caution: "bg-level-caution",
  alert: "bg-level-alert",
  severe: "bg-level-severe",
};

const TEXT_CLASS: Record<string, string> = {
  normal: "text-level-normal",
  interest: "text-level-interest",
  caution: "text-level-caution",
  alert: "text-level-alert",
  severe: "text-level-severe",
};

const BG_CLASS: Record<string, string> = {
  normal: "bg-level-normal/10",
  interest: "bg-level-interest/10",
  caution: "bg-level-caution/10",
  alert: "bg-level-alert/10",
  severe: "bg-level-severe/10",
};

export default function LevelBadge({
  level,
  size = "md",
  pulse = false,
}: {
  level: DisasterLevel;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
}) {
  const key = LEVEL_COLOR_KEYS[level];
  const sizeClass = size === "lg" ? "text-base px-4 py-2" : size === "sm" ? "text-xs px-2 py-1" : "text-sm px-3 py-1.5";

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full font-semibold",
        sizeClass,
        BG_CLASS[key],
        TEXT_CLASS[key]
      )}
    >
      <span className={clsx("h-2 w-2 rounded-full", DOT_CLASS[key], pulse && "animate-pulseSoft")} />
      {LEVEL_NAMES[level]}
    </span>
  );
}
