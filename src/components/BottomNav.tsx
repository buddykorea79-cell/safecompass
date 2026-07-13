"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, Bell, BookOpen } from "lucide-react";
import clsx from "clsx";

const ITEMS = [
  { href: "/", label: "홈", icon: Home },
  { href: "/map", label: "안전지도", icon: Map },
  { href: "/alerts", label: "공식알림", icon: Bell },
  { href: "/guide", label: "행동요령", icon: BookOpen },
];

export default function BottomNav() {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/70 bg-white/90 backdrop-blur safe-bottom">
      <div className="mx-auto flex max-w-lg items-stretch justify-between px-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname?.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
            >
              <Icon
                size={22}
                strokeWidth={active ? 2.4 : 1.8}
                className={clsx(active ? "text-brand-600" : "text-slate-400")}
              />
              <span className={clsx(active ? "text-brand-600" : "text-slate-400")}>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
