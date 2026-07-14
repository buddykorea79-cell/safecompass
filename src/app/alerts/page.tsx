"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ALERTS_CACHE_KEY } from "@/lib/alertsCache";
import AlertFilterBar, { type AlertFilterKey } from "@/components/AlertFilterBar";
import AlertListItem, { type UnifiedAlert } from "@/components/AlertListItem";

const PAGE_SIZE = 10;

interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

const EMPTY_PAGINATION: Pagination = {
  page: 1,
  pageSize: PAGE_SIZE,
  total: 0,
  totalPages: 1,
  hasPrevious: false,
  hasNext: false,
};

function visiblePages(current: number, total: number): number[] {
  const start = Math.max(1, Math.min(current - 2, total - 4));
  const end = Math.min(total, start + 4);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export default function AlertsPage() {
  const [filter, setFilter] = useState<AlertFilterKey>("all");
  const [region, setRegion] = useState("");
  const deferredRegion = useDeferredValue(region);
  const [page, setPage] = useState(1);
  const [alerts, setAlerts] = useState<UnifiedAlert[]>([]);
  const [pagination, setPagination] = useState<Pagination>(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [fallback, setFallback] = useState({ messages: false, alerts: false });

  useEffect(() => {
    let cancelled = false;
    const queryRegion = deferredRegion.trim();
    const params = new URLSearchParams({
      filter,
      page: String(page),
      pageSize: String(PAGE_SIZE),
    });
    // 기본 목록은 전국 최신 알림이다. 사용자가 직접 검색한 경우에만 지역을 좁힌다.
    if (queryRegion) params.set("region", queryRegion);

    setLoading(true);
    setLoadError(false);
    fetch(`/api/alerts?${params.toString()}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        const nextAlerts = (json.items ?? []) as UnifiedAlert[];
        const nextPagination = (json.pagination ?? EMPTY_PAGINATION) as Pagination;
        setAlerts(nextAlerts);
        setPagination(nextPagination);
        setFallback({ messages: Boolean(json.messagesFallback), alerts: Boolean(json.alertsFallback) });
        if (nextPagination.page !== page) setPage(nextPagination.page);
        try {
          sessionStorage.setItem(ALERTS_CACHE_KEY, JSON.stringify(nextAlerts));
        } catch {
          // 저장 공간을 사용할 수 없어도 목록 표시는 유지한다.
        }
      })
      .catch(() => {
        if (cancelled) return;
        setAlerts([]);
        setPagination(EMPTY_PAGINATION);
        setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [deferredRegion, filter, page]);

  function changeFilter(nextFilter: AlertFilterKey) {
    setFilter(nextFilter);
    setPage(1);
  }

  function changeRegion(value: string) {
    setRegion(value);
    setPage(1);
  }

  function movePage(nextPage: number) {
    if (nextPage < 1 || nextPage > pagination.totalPages || nextPage === page) return;
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const bothFallback = fallback.messages && fallback.alerts;

  return (
    <main className="min-h-screen">
      <AlertFilterBar
        active={filter}
        onChange={changeFilter}
        region={region}
        onRegionChange={changeRegion}
      />
      <div className="px-5 pb-8">
        {!loading && pagination.total > 0 && (
          <p className="mb-2.5 text-right text-xs text-slate-400">
            최신순 {pagination.total.toLocaleString("ko-KR")}건 · {pagination.page}/{pagination.totalPages}페이지
          </p>
        )}

        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-white shadow-card" />
            ))}
          </div>
        ) : loadError ? (
          <p className="mt-10 text-center text-sm text-slate-400">공식 알림을 불러오는 중 오류가 발생했습니다.</p>
        ) : bothFallback ? (
          <p className="mt-10 text-center text-sm text-slate-400">
            API 키가 설정되지 않아 공식 알림을 불러올 수 없습니다.
          </p>
        ) : alerts.length === 0 ? (
          <p className="mt-10 text-center text-sm text-slate-400">해당 조건의 공식 알림이 없습니다.</p>
        ) : (
          <>
            {(fallback.messages || fallback.alerts) && (
              <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
                일부 제공기관의 응답이 없어 조회 가능한 알림만 표시합니다.
              </p>
            )}
            {alerts.map((alert) => (
              <AlertListItem key={`${alert.kind}-${alert.id}`} alert={alert} />
            ))}
          </>
        )}

        {!loading && !loadError && alerts.length > 0 && pagination.totalPages > 1 && (
          <nav className="mt-5 flex items-center justify-center gap-1.5" aria-label="공식 알림 페이지">
            <button
              type="button"
              onClick={() => movePage(page - 1)}
              disabled={!pagination.hasPrevious}
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500 shadow-card disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="이전 페이지"
            >
              <ChevronLeft size={17} />
            </button>
            {visiblePages(pagination.page, pagination.totalPages).map((pageNumber) => (
              <button
                type="button"
                key={pageNumber}
                onClick={() => movePage(pageNumber)}
                aria-current={pageNumber === pagination.page ? "page" : undefined}
                className={
                  pageNumber === pagination.page
                    ? "h-9 min-w-9 rounded-full bg-brand-600 px-2 text-xs font-bold text-white"
                    : "h-9 min-w-9 rounded-full bg-white px-2 text-xs font-semibold text-slate-500 shadow-card"
                }
              >
                {pageNumber}
              </button>
            ))}
            <button
              type="button"
              onClick={() => movePage(page + 1)}
              disabled={!pagination.hasNext}
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-slate-500 shadow-card disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="다음 페이지"
            >
              <ChevronRight size={17} />
            </button>
          </nav>
        )}
      </div>
    </main>
  );
}
