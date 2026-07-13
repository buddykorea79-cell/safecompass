"use client";

import Link from "next/link";
import { MapPin, BookOpen, Bell, PhoneCall } from "lucide-react";

const ITEMS = [
  { href: "/map", label: "안전지도", icon: MapPin, bg: "bg-brand-50", fg: "text-brand-600" },
  { href: "/guide", label: "행동요령", icon: BookOpen, bg: "bg-blue-50", fg: "text-blue-500" },
  { href: "/alerts", label: "공식알림", icon: Bell, bg: "bg-amber-50", fg: "text-amber-500" },
  { href: "tel:119", label: "119 신고", icon: PhoneCall, bg: "bg-red-50", fg: "text-red-500" },
];

export default function QuickMenu() {
  return (
    <div className="mx-5 mt-4 grid grid-cols-4 gap-2.5">
      {ITEMS.map(({ href, label, icon: Icon, bg, fg }) => (
        <Link
          key={label}
          href={href}
          className="flex flex-col items-center gap-2 rounded-2xl bg-white py-4 shadow-card active:scale-[0.97]"
        >
          <span className={`flex h-10 w-10 items-center justify-center rounded-full ${bg}`}>
            <Icon size={19} className={fg} />
          </span>
          <span className="text-xs font-medium text-slate-600">{label}</span>
        </Link>
      ))}
    </div>
  );
}
