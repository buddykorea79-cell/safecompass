"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";

export default function AdminLoginPage() {
  const [accessCode, setAccessCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: accessCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "로그인에 실패했습니다");
        return;
      }
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={submit} className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-card">
        <div className="mb-5 flex flex-col items-center gap-2">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
            <Lock size={20} className="text-brand-600" />
          </span>
          <h1 className="text-base font-bold text-slate-800">관리자 접속</h1>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          value={accessCode}
          onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, ""))}
          placeholder="접근코드 8자리"
          autoFocus
          className="mb-3 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm focus:border-brand-400 focus:outline-none"
        />
        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={loading || accessCode.length !== 8}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? "확인 중..." : "접속"}
        </button>
      </form>
    </main>
  );
}
