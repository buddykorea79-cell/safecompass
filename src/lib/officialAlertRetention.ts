const KST_OFFSET_MS = 9 * 60 * 60 * 1_000;

function kstDateKey(value: Date): string | null {
  const timestamp = value.getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + KST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * 공식 알림은 한국시간 기준 당일과 전일 자료만 노출·캐시한다.
 * 공급자 시각이 해석되지 않는 자료도 현재 시각으로 보정하지 않고 제거한다.
 */
export function isOfficialAlertRetained(issuedAt: string, now = new Date()): boolean {
  const issuedDate = new Date(issuedAt);
  const issuedKey = kstDateKey(issuedDate);
  const todayKey = kstDateKey(now);
  const yesterdayKey = kstDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1_000));
  return Boolean(issuedKey && todayKey && yesterdayKey && (issuedKey === todayKey || issuedKey === yesterdayKey));
}

export function retainCurrentOfficialAlerts<T extends { issued_at: string }>(
  alerts: T[],
  now = new Date()
): T[] {
  return alerts.filter((alert) => isOfficialAlertRetained(alert.issued_at, now));
}
