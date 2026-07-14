"use client";

import clsx from "clsx";
import { Bell, BookOpen, Compass, MapPin, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import LocationSheet from "./LocationSheet";

const LINKS = [
  { href: "/#safety-info", label: "안전정보", icon: ShieldCheck, path: "/" },
  { href: "/alerts", label: "공식알림", icon: Bell, path: "/alerts" },
  { href: "/guide", label: "행동요령", icon: BookOpen, path: "/guide" },
] as const;

export default function PublicHeader() {
  const pathname = usePathname();
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

          <nav
            aria-label="상단 주요 메뉴"
            className="ml-auto min-w-0"
          >
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => setLocationOpen(true)}
                className={clsx(
                  "flex h-12 min-w-[40px] flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[8px] font-semibold transition-colors min-[380px]:min-w-[46px] min-[380px]:px-1 min-[380px]:text-[9px]",
                  locationOpen
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                )}
                aria-expanded={locationOpen}
              >
                <MapPin size={13} aria-hidden="true" />
                위치정보
              </button>
              {LINKS.map(({ href, label, icon: Icon, path }) => {
                const active = path === "/" ? pathname === "/" : pathname?.startsWith(path);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex h-12 min-w-[40px] flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 text-[8px] font-semibold transition-colors min-[380px]:min-w-[46px] min-[380px]:px-1 min-[380px]:text-[9px]",
                      active
                        ? "bg-brand-50 text-brand-700"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    )}
                  >
                    <Icon size={13} aria-hidden="true" />
                    {label}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>
      </header>
      <LocationSheet open={locationOpen} onClose={() => setLocationOpen(false)} />
    </>
  );
}
