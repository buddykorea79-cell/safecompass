"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Database, Activity, FlaskConical, LogOut } from "lucide-react";
import clsx from "clsx";

const NAV = [
  { href: "/admin", label: "대시보드", icon: LayoutDashboard },
  { href: "/admin/types", label: "마스터데이터", icon: Database },
  { href: "/admin/api-status", label: "API 상태", icon: Activity },
  { href: "/admin/api-test", label: "API 테스트", icon: FlaskConical },
];

export default function AdminShell({ active, children }: { active: string; children: React.ReactNode }) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="min-h-screen px-5 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">안전나침판 관리자</h1>
        <button onClick={logout} className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-600">
          <LogOut size={14} />
          접속 종료
        </button>
      </div>

      <div className="mb-6 flex gap-2 overflow-x-auto no-scrollbar">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold",
              active === href ? "bg-brand-600 text-white" : "bg-white text-slate-500 shadow-card"
            )}
          >
            <Icon size={14} />
            {label}
          </Link>
        ))}
      </div>

      {children}
    </div>
  );
}
