// 기상청 API허브 단기예보 격자자료 어댑터.
// 날씨는 typ01 nph-dfs_shrt_grd만 사용하며 공공데이터포털로 폴백하지 않는다.

import { env, hasKmaApiHub } from "./env";
import { lonLatToGrid } from "./geo";
import { regionKeywordMatch } from "./regions";
import type { WeatherAlert, WeatherSnapshot } from "../types";

const SHORT_FORECAST_GRID_URL =
  "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-dfs_shrt_grd";
const WARNING_URL = "https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php";
const KMA_GRID_TIMEOUT_MS = 10_000;
const KMA_TOTAL_TIMEOUT_MS = 15_000;
const KMA_ALERT_TIMEOUT_MS = 8_000;
const GRID_CACHE_TTL_MS = 65 * 60 * 1000;
const GRID_NX = 149;
const GRID_NY = 253;
const GRID_CELL_COUNT = GRID_NX * GRID_NY;
const FORECAST_GRACE_MINUTES = 15;
const SHORT_FORECAST_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];
const CURRENT_VARIABLES = ["TMP", "SKY", "PTY", "POP", "PCP", "REH", "WSD"] as const;

type ShortForecastVariable = (typeof CURRENT_VARIABLES)[number] | "TMX" | "TMN";

const MISSING_VALUE: Record<ShortForecastVariable, number> = {
  TMP: -50,
  TMX: -50,
  TMN: -50,
  SKY: -1,
  PTY: -1,
  POP: -1,
  PCP: -1,
  REH: -1,
  WSD: -1,
};

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (compatible; SafeCompass/1.0)",
  Accept: "text/plain,*/*",
};

const gridCache = new Map<string, { values: number[]; expiresAt: number }>();

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

function nowKst(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  return new Date(utcMs + 9 * 60 * 60_000);
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function formatHour(d: Date): string {
  return `${formatDate(d)}${pad(d.getHours())}`;
}

export function shortForecastBase(d: Date): string {
  const available = new Date(d.getTime());
  available.setMinutes(available.getMinutes() - FORECAST_GRACE_MINUTES);
  let hour = [...SHORT_FORECAST_HOURS].reverse().find((candidate) => candidate <= available.getHours());
  if (hour === undefined) {
    available.setDate(available.getDate() - 1);
    hour = 23;
  }
  return `${formatDate(available)}${pad(hour)}`;
}

function previousShortForecastBase(d: Date): string {
  return shortForecastBase(new Date(d.getTime() - 3 * 60 * 60_000));
}

function previousBaseValue(base: string): string {
  const value = new Date(
    Number(base.slice(0, 4)),
    Number(base.slice(4, 6)) - 1,
    Number(base.slice(6, 8)),
    Number(base.slice(8, 10)),
    0,
    0,
    0
  );
  value.setHours(value.getHours() - 3);
  return formatHour(value);
}

export function nearestForecastEffect(d: Date): string {
  const effect = new Date(d.getTime());
  if (effect.getMinutes() > 0 || effect.getSeconds() > 0 || effect.getMilliseconds() > 0) {
    effect.setHours(effect.getHours() + 1);
  }
  effect.setMinutes(0, 0, 0);
  return formatHour(effect);
}

function extremaBase(d: Date): string {
  const latest = shortForecastBase(d);
  return latest.slice(0, 8) === formatDate(d) ? `${formatDate(d)}02` : latest;
}

function effectAt(d: Date, hour: number): string {
  const value = new Date(d.getTime());
  value.setHours(hour, 0, 0, 0);
  return formatHour(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeResponseText(text: string): string {
  let sanitized = text;
  const secret = env.kmaApiHubAuthKey;
  if (secret) {
    for (const value of new Set([secret, encodeURIComponent(secret)])) {
      sanitized = sanitized.replace(new RegExp(escapeRegExp(value), "g"), "[REDACTED]");
    }
  }
  sanitized = sanitized.replace(/([?&]authKey=)[^&\s"'<>\]}]+/gi, "$1[REDACTED]");
  return sanitized.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    const queryIndex = url.indexOf("?");
    return queryIndex === -1 ? url : `${url.slice(0, queryIndex)}?[REDACTED]`;
  });
}

function bodySnippet(text: string): string {
  const normalized = sanitizeResponseText(text).replace(/\s+/g, " ").trim();
  return normalized ? ` — 응답: ${normalized.slice(0, 160)}` : "";
}

export function parseShortForecastGrid(text: string): number[] {
  const withoutComments = text
    .split(/\r?\n/)
    .filter((line) => !line.trim().startsWith("#"))
    .join(" ")
    .trim();
  const tokens = withoutComments ? withoutComments.split(/[,\s]+/).filter(Boolean) : [];
  let dataTokens = tokens;
  if (
    tokens.length === GRID_CELL_COUNT + 2 &&
    Number(tokens[0]) === GRID_NX &&
    Number(tokens[1]) === GRID_NY
  ) {
    dataTokens = tokens.slice(2);
  }
  if (dataTokens.length !== GRID_CELL_COUNT) {
    throw new Error(`단기예보 격자자료 개수 오류: ${dataTokens.length}/${GRID_CELL_COUNT}${bodySnippet(text)}`);
  }
  const values = dataTokens.map(Number);
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`단기예보 격자자료에 숫자가 아닌 값이 있습니다${bodySnippet(text)}`);
  }
  return values;
}

export function shortForecastGridValue(
  values: number[],
  nx: number,
  ny: number,
  variable: ShortForecastVariable
): number | null {
  if (!Number.isInteger(nx) || !Number.isInteger(ny) || nx < 1 || nx > GRID_NX || ny < 1 || ny > GRID_NY) {
    throw new Error(`동네예보 격자 범위를 벗어났습니다: nx=${nx}, ny=${ny}`);
  }
  if (values.length !== GRID_CELL_COUNT) throw new Error("단기예보 격자자료 크기가 올바르지 않습니다");
  const value = values[(ny - 1) * GRID_NX + (nx - 1)];
  return value === -99 || value === MISSING_VALUE[variable] ? null : value;
}

async function loadGrid(
  variable: ShortForecastVariable,
  tmfc: string,
  tmef: string,
  parentSignal?: AbortSignal
): Promise<number[]> {
  const cacheKey = `${tmfc}:${tmef}:${variable}`;
  const cached = gridCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.values;
  if (!env.kmaApiHubAuthKey) throw new Error("KMA_AUTH_KEY가 설정되지 않았습니다");

  const url = new URL(SHORT_FORECAST_GRID_URL);
  url.searchParams.set("tmfc", tmfc);
  url.searchParams.set("tmef", tmef);
  url.searchParams.set("vars", variable);
  url.searchParams.set("authKey", env.kmaApiHubAuthKey);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      cache: "no-store",
      headers: COMMON_HEADERS,
      signal: parentSignal
        ? AbortSignal.any([parentSignal, AbortSignal.timeout(KMA_GRID_TIMEOUT_MS)])
        : AbortSignal.timeout(KMA_GRID_TIMEOUT_MS),
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError" || name === "TimeoutError") throw new Error("기상청 API허브 응답 시간 초과");
    throw new Error("기상청 API허브 연결 오류");
  }
  const text = await response.text();
  if (!response.ok) throw new Error(`기상청 API허브 HTTP ${response.status}${bodySnippet(text)}`);
  const values = parseShortForecastGrid(text);
  gridCache.set(cacheKey, { values, expiresAt: Date.now() + GRID_CACHE_TTL_MS });
  if (gridCache.size > 64) {
    const oldest = gridCache.keys().next().value;
    if (oldest) gridCache.delete(oldest);
  }
  return values;
}

async function loadPointValue(
  variable: ShortForecastVariable,
  primaryBase: string,
  previousBase: string,
  effect: string,
  nx: number,
  ny: number,
  signal: AbortSignal
): Promise<{ value: number | null; base: string }> {
  try {
    const values = await loadGrid(variable, primaryBase, effect, signal);
    return { value: shortForecastGridValue(values, nx, ny, variable), base: primaryBase };
  } catch (primaryError) {
    const message = sanitizeResponseText(primaryError instanceof Error ? primaryError.message : String(primaryError));
    if (!/격자자료 개수 오류|자료가 비어|NO_DATA/i.test(message)) throw primaryError;
    try {
      const values = await loadGrid(variable, previousBase, effect, signal);
      return { value: shortForecastGridValue(values, nx, ny, variable), base: previousBase };
    } catch (previousError) {
      throw new Error(
        `최신 발표 ${primaryBase}: ${message} · 직전 발표 ${previousBase}: ${sanitizeResponseText(
          previousError instanceof Error ? previousError.message : String(previousError)
        )}`
      );
    }
  }
}

function skyFromCode(code: number | null): WeatherSnapshot["sky"] {
  if (code === 1) return "clear";
  if (code === 3) return "cloudy";
  if (code === 4) return "overcast";
  return "unknown";
}

function precipitationFromCode(code: number | null): WeatherSnapshot["precipType"] {
  if (code === 0) return "none";
  if (code === 1) return "rain";
  if (code === 2) return "rain_snow";
  if (code === 3) return "snow";
  if (code === 4) return "shower";
  return "unknown";
}

function precipitationText(value: number | null): string | null {
  if (value === null || value <= 0) return null;
  return `${value}mm`;
}

function fallbackSnapshot(message: string): WeatherSnapshot {
  return {
    provider: null,
    temp: null,
    feelsLike: null,
    sky: "unknown",
    precipType: "unknown",
    precipProbability: null,
    humidity: null,
    windSpeed: null,
    precipitation1h: null,
    tmx: null,
    tmn: null,
    baseDate: "",
    baseTime: "",
    observationBaseDate: null,
    observationBaseTime: null,
    forecastBaseDate: null,
    forecastBaseTime: null,
    fallback: true,
    message,
  };
}

export async function getWeatherSnapshot(lat: number, lng: number): Promise<WeatherSnapshot> {
  if (!hasKmaApiHub()) {
    return fallbackSnapshot("KMA_AUTH_KEY 미설정 — API허브 단기예보를 불러올 수 없습니다");
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return fallbackSnapshot("날씨 조회 좌표가 올바르지 않습니다");
  }

  const { nx, ny } = lonLatToGrid(lng, lat);
  const now = nowKst();
  const primaryBase = shortForecastBase(now);
  const previousBase = previousShortForecastBase(now);
  const currentEffect = nearestForecastEffect(now);
  const extremaForecastBase = extremaBase(now);
  const extremaPreviousBase = previousBaseValue(extremaForecastBase);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KMA_TOTAL_TIMEOUT_MS);

  try {
    const variableResults = await Promise.allSettled(
      CURRENT_VARIABLES.map(async (variable) => ({
        variable,
        ...(await loadPointValue(variable, primaryBase, previousBase, currentEffect, nx, ny, controller.signal)),
      }))
    );
    const values = new Map<ShortForecastVariable, number | null>();
    const failures: string[] = [];
    let usedBase = primaryBase;
    for (const result of variableResults) {
      if (result.status === "fulfilled") {
        values.set(result.value.variable, result.value.value);
        if (result.value.variable === "TMP") usedBase = result.value.base;
      } else {
        failures.push(sanitizeResponseText(result.reason instanceof Error ? result.reason.message : String(result.reason)));
      }
    }

    const [tmnResult, tmxResult] = await Promise.allSettled([
      loadPointValue("TMN", extremaForecastBase, extremaPreviousBase, effectAt(now, 6), nx, ny, controller.signal),
      loadPointValue("TMX", extremaForecastBase, extremaPreviousBase, effectAt(now, 15), nx, ny, controller.signal),
    ]);
    if (tmnResult.status === "fulfilled") values.set("TMN", tmnResult.value.value);
    else failures.push(`최저기온: ${sanitizeResponseText(tmnResult.reason instanceof Error ? tmnResult.reason.message : String(tmnResult.reason))}`);
    if (tmxResult.status === "fulfilled") values.set("TMX", tmxResult.value.value);
    else failures.push(`최고기온: ${sanitizeResponseText(tmxResult.reason instanceof Error ? tmxResult.reason.message : String(tmxResult.reason))}`);

    const temp = values.get("TMP") ?? null;
    if (temp === null) throw new Error(`단기예보 TMP 값이 없습니다${failures.length ? ` · ${failures[0]}` : ""}`);
    const windSpeed = values.get("WSD") ?? null;
    let feelsLike = temp;
    if (temp <= 10 && windSpeed !== null && windSpeed > 1.3) {
      const velocity = Math.pow(windSpeed * 3.6, 0.16);
      feelsLike =
        Math.round((13.12 + 0.6215 * temp - 11.37 * velocity + 0.3965 * temp * velocity) * 10) /
        10;
    }

    return {
      provider: "KMA_APIHUB",
      temp,
      feelsLike,
      sky: skyFromCode(values.get("SKY") ?? null),
      precipType: precipitationFromCode(values.get("PTY") ?? null),
      precipProbability: values.get("POP") ?? null,
      humidity: values.get("REH") ?? null,
      windSpeed,
      precipitation1h: precipitationText(values.get("PCP") ?? null),
      tmx: values.get("TMX") ?? null,
      tmn: values.get("TMN") ?? null,
      baseDate: usedBase.slice(0, 8),
      baseTime: `${usedBase.slice(8, 10)}00`,
      observationBaseDate: null,
      observationBaseTime: null,
      forecastBaseDate: usedBase.slice(0, 8),
      forecastBaseTime: `${usedBase.slice(8, 10)}00`,
      fallback: false,
      message: failures.length ? `일부 단기예보 요소 조회 실패 · ${failures.slice(0, 2).join(" · ")}` : undefined,
    };
  } catch (error) {
    return fallbackSnapshot(
      sanitizeResponseText(error instanceof Error ? error.message : "날씨 정보를 불러오는 중 오류가 발생했습니다")
    );
  } finally {
    clearTimeout(timeout);
  }
}

export interface WeatherAlertResult {
  alerts: WeatherAlert[];
  fallback: boolean;
  message?: string;
}

const WRN_KIND_MAP: Record<string, string> = {
  W: "강풍",
  R: "호우",
  C: "한파",
  D: "건조",
  O: "폭풍해일",
  V: "풍랑",
  T: "태풍",
  S: "대설",
  Y: "황사",
  H: "폭염",
  F: "안개",
};

const WRN_LEVEL_MAP: Record<string, WeatherAlert["alert_level"]> = {
  "1": "예비특보",
  "2": "주의보",
  "3": "경보",
};

function kmaTimeToIso(tm: string | undefined): string | null {
  if (!tm || !/^\d{12}/.test(tm)) return null;
  return `${tm.slice(0, 4)}-${tm.slice(4, 6)}-${tm.slice(6, 8)}T${tm.slice(8, 10)}:${tm.slice(10, 12)}:00+09:00`;
}

export async function getWeatherAlerts(regionKeyword?: string): Promise<WeatherAlertResult> {
  if (!hasKmaApiHub()) {
    return { alerts: [], fallback: true, message: "KMA_AUTH_KEY 미설정 — 기상특보를 불러올 수 없습니다" };
  }
  try {
    const url = new URL(WARNING_URL);
    url.searchParams.set("authKey", env.kmaApiHubAuthKey);
    url.searchParams.set("disp", "1");
    url.searchParams.set("help", "0");

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(KMA_ALERT_TIMEOUT_MS),
    });
    const text = await response.text();
    if (!response.ok) {
      const hint =
        response.status === 401 || response.status === 403
          ? " · 기상특보 API 활용승인과 API허브 키 상태를 확인하세요."
          : "";
      throw new Error(`기상특보 조회 오류: HTTP ${response.status}${bodySnippet(text)}${hint}`);
    }

    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line !== "=");
    const alerts: WeatherAlert[] = lines
      .map((line, index): WeatherAlert | null => {
        const columns = line.split(",").map((column) => column.trim());
        if (columns.length < 8) return null;
        const [, regionUpperName, regionId, regionName, issuedAt, effectiveAt, warning, level] = columns;
        if (!warning) return null;
        return {
          id: `${issuedAt || index}-${regionId || index}-${index}`,
          alert_kind: WRN_KIND_MAP[warning] ?? warning,
          alert_level: WRN_LEVEL_MAP[level] ?? "주의보",
          region_codes: [regionName || regionUpperName || ""].filter(Boolean),
          issued_at: kmaTimeToIso(issuedAt) ?? new Date().toISOString(),
          effective_until: kmaTimeToIso(effectiveAt),
          source: "kma" as const,
        };
      })
      .filter((alert): alert is WeatherAlert => alert !== null)
      .filter((alert) =>
        regionKeyword
          ? alert.region_codes.some((region) => regionKeywordMatch(region, regionKeyword))
          : true
      );

    return { alerts, fallback: false };
  } catch (error) {
    return {
      alerts: [],
      fallback: true,
      message: sanitizeResponseText(
        error instanceof Error ? error.message : "기상특보 조회 중 오류가 발생했습니다"
      ),
    };
  }
}
