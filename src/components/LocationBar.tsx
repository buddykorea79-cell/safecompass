"use client";

import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useLocationStore } from "@/store/useLocationStore";
import LocationSheet from "./LocationSheet";

export default function LocationBar() {
  const location = useLocationStore((s) => s.location);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 px-5 pt-5 pb-1 text-left"
      >
        <MapPin size={18} className="shrink-0 text-brand-600" />
        <span className="truncate text-[15px] font-semibold text-slate-800">{location.label}</span>
        <ChevronDown size={16} className="text-slate-400" />
      </button>
      <LocationSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
