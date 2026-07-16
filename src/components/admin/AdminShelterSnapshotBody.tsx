"use client";

import { Database, Download, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface SnapshotSummary {
  storage: "vercel-blob" | "local-file";
  pathname: string;
  fetchedAt: string;
  rawCount: number;
  validCount: number;
  skippedCount: number;
  typeCounts: Record<"1" | "2" | "3" | "4", number>;
  size: number;
  downloadUrl: string | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AdminShelterSnapshotBody() {
  const [snapshot, setSnapshot] = useState<SnapshotSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/shelters/sync", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "저장 상태 조회 실패");
      setSnapshot(payload.snapshot ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "저장 상태 조회 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function sync() {
    if (!window.confirm("통합대피소 전체 데이터를 다시 받아 JSON 저장본을 교체할까요?")) return;
    setSyncing(true);
    setMessage("통합대피소 4개 유형의 전체 페이지를 수집하고 있습니다. 창을 닫지 마세요.");
    try {
      const response = await fetch("/api/admin/shelters/sync", { method: "POST" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "통합대피소 JSON 저장 실패");
      setSnapshot(payload.snapshot);
      setMessage(`JSON 저장 완료 · 유효 ${payload.snapshot.validCount.toLocaleString()}건`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "통합대피소 JSON 저장 실패");
    } finally {
      setSyncing(false);
    }
  }

  const downloadUrl = snapshot?.downloadUrl ?? "/api/admin/shelters/sync?download=1";

  return (
    <section className="mb-4 rounded-2xl bg-white p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <Database size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-slate-700">통합대피소 JSON 저장</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
              원본 API(DSSP-IF-10941)는 &lsquo;새로 받기&rsquo;를 누를 때만 한 번 호출합니다. 다시 받기 전까지 앱은
              저장된 JSON만 계속 사용합니다.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={sync}
          disabled={syncing || loading}
          className="flex shrink-0 items-center gap-1 rounded-full bg-brand-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {syncing ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {syncing ? "저장 중" : "새로 받기"}
        </button>
      </div>

      {loading ? (
        <p className="mt-3 text-xs text-slate-400">저장 상태를 확인하고 있습니다...</p>
      ) : snapshot ? (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
          <p>
            저장 시각 <strong>{new Date(snapshot.fetchedAt).toLocaleString("ko-KR")}</strong> · 유효 {snapshot.validCount.toLocaleString()}건 · {formatBytes(snapshot.size)}
          </p>
          <p className="mt-1">
            한파 {snapshot.typeCounts["1"].toLocaleString()} · 무더위 {snapshot.typeCounts["2"].toLocaleString()} · 지진옥외 {snapshot.typeCounts["3"].toLocaleString()} · 지진해일 {snapshot.typeCounts["4"].toLocaleString()}
          </p>
          <a
            href={downloadUrl}
            target={snapshot.downloadUrl ? "_blank" : undefined}
            rel={snapshot.downloadUrl ? "noreferrer" : undefined}
            className="mt-2 inline-flex items-center gap-1 font-semibold text-brand-700"
          >
            <Download size={12} /> JSON 파일 받기
          </a>
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
          저장된 JSON이 없습니다. `SAFETYDATA_SERVICE10941_KEY`와 저장소 설정 후 새로 받기를 실행하세요.
        </p>
      )}

      {message && <p className="mt-2 text-[11px] text-amber-700">{message}</p>}
    </section>
  );
}
