"use client";

import { ChevronDown, Compass, MapPin } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useLocationStore } from "@/store/useLocationStore";
import LocationSheet from "./LocationSheet";

export default function PublicHeader() {
  const pathname = usePathname();
  const location = useLocationStore((state) => state.location);
  const [locationOpen, setLocationOpen] = useState(false);

  if (pathname?.startsWith("/admin")) return null;

  return (
    <>
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="flex h-full items-center gap-2 px-3 sm:px-4">
          <Link
            href="/"
            aria-label="안전나침판 홈"
            className="flex shrink-0 items-center gap-1.5 font-bold tracking-tight text-slate-800"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm">
              <Compass size={18} strokeWidth={2.4} aria-hidden="true" />
            </span>
            <span className="text-[13px] min-[380px]:text-[15px]">안전나침판</span>
          </Link>

          <button
            type="button"
            onClick={() => setLocationOpen(true)}
            className="ml-auto flex min-w-0 max-w-[58%] items-center gap-1.5 rounded-xl px-2 py-2 text-left text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
            aria-label={`현재 위치 ${location.label}. 위치 변경`}
            aria-expanded={locationOpen}
          >
            <MapPin size={16} className="shrink-0 text-brand-600" aria-hidden="true" />
            <span className="truncate text-xs font-semibold min-[380px]:text-sm">
              {location.label}
            </span>
            <ChevronDown size={14} className="shrink-0 text-slate-400" aria-hidden="true" />
          </button>
        </div>
      </header>
      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
    </>
  );
}
