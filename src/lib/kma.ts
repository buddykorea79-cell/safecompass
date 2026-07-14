// 기상청 API허브(apihub.kma.go.kr) / 공공데이터포털 동네예보 어댑터.
// 실제 엔드포인트/파라미터는 docs/단기예보.txt (VilageFcstInfoService_2.0) 기준
// - getUltraSrtNcst: 초단기실황(매시, 10분 이후 제공) — T1H/RN1/PTY/REH/WSD/VEC 등
// - getVilageFcst:   단기예보(1일 8회, 02/05/08/11/14/17/20/23시 생산) — TMP/TMX/TMN/SKY/PTY/POP 등

import { env, hasKma, hasKmaApiHub } from "./env";
import { lonLatToGrid } from "./geo";
import { regionKeywordMatch } from "./regions";
import type { WeatherAlert, WeatherSnapshot } from "../types";

const APIHUB_BASE_URL = "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0";
// API허브 authKey와 공공데이터포털 serviceKey는 서로 발급처와 권한이 다르다.
// 두 포털을 폴백으로 사용하더라도 각 포털에 해당하는 키만 보낸다.
const DATA_GO_KR_BASE_URL = "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0";
// 기상특보 현황(typ01/url) — docs/예특보.txt에 상세 응답 필드가 문서화되어 있지 않아
// KMA API 허브의 공개된 특보 조회 표준 엔드포인트를 best-effort로 사용한다.
// 실제 키 등록 후 응답 필드명 보정이 필요할 수 있다.
const WARNING_URL = "https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php";
const KMA_PROVIDER_TIMEOUT_MS = 3_500;
const KMA_TOTAL_TIMEOUT_MS = 7_500;
const KMA_ALERT_TIMEOUT_MS = 8_000;

// 일부 공공 API 앞단 방화벽이 User-Agent 없는 요청을 403으로 차단하는 사례가 있어 항상 붙인다.
const COMMON_HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; SafeCompass/1.0)", Accept: "*/*" };

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

// KST 기준 현재시각 (서버가 UTC로 도는 환경 대비)
function nowKst(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 9 * 60 * 60000);
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

// 초단기실황: 매시 40분 이후 해당 시(정시) 자료 제공 → 40분 이전엔 한 시간 전 자료 사용
function ultraSrtNcstBase(d: Date): { base_date: string; base_time: string } {
  const t = new Date(d.getTime());
  if (t.getMinutes() < 40) {
    t.setHours(t.getHours() - 1);
  }
  t.setMinutes(0, 0, 0);
  return { base_date: fmtDate(t), base_time: `${pad(t.getHours())}00` };
}

// 단기예보: 02,05,08,11,14,17,20,23시 발표(약 10분 후 제공 가정)
const VILAGE_FCST_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

function vilageFcstBase(d: Date): { base_date: string; base_time: string } {
  const t = new Date(d.getTime());
  t.setMinutes(t.getMinutes() - 10); // 발표 후 딜레이 보정
  let hour = t.getHours();
  let candidate = [...VILAGE_FCST_HOURS].reverse().find((h) => h <= hour);
  if (candidate === undefined) {
    // 자정~새벽2시10분: 전날 23시 자료 사용
    t.setDate(t.getDate() - 1);
    candidate = 23;
  }
  t.setHours(candidate, 0, 0, 0);
  return { base_date: fmtDate(t), base_time: `${pad(candidate)}00` };
}

// 오늘 최저(06시)·최고(15시)가 모두 포함되는 02시 발표본.
// 02:10 이전에는 아직 오늘 02시 자료가 없으므로 전날 23시 발표본을 사용한다.
function dailyExtremaBase(d: Date): { base_date: string; base_time: string } {
  const latestPublished = vilageFcstBase(d);
  return latestPublished.base_date === fmtDate(d)
    ? { base_date: fmtDate(d), base_time: "0200" }
    : latestPublished;
}

interface KmaItem {
  category: string;
  obsrValue?: string;
  fcstValue?: string;
  fcstDate?: string;
  fcstTime?: string;
}

type KmaPortal = "apihub" | "datagokr";

interface KmaPortalConfig {
  label: string;
  baseUrl: string;
  keyName: "authKey" | "serviceKey";
  key: string;
}

interface KmaCallResult {
  items: KmaItem[];
  portal: KmaPortal;
}

interface TimedKmaCallResult extends KmaCallResult {
  base_date: string;
  base_time: string;
}

function portalConfig(portal: KmaPortal): KmaPortalConfig {
  return portal === "apihub"
    ? {
        label: "기상청 API허브",
        baseUrl: APIHUB_BASE_URL,
        keyName: "authKey",
        key: env.kmaApiHubAuthKey,
      }
    : {
        label: "공공데이터포털",
        baseUrl: DATA_GO_KR_BASE_URL,
        keyName: "serviceKey",
        key: env.kmaServiceKey,
      };
}

function configuredPortals(): KmaPortal[] {
  const portals: KmaPortal[] = [];
  if (env.kmaApiHubAuthKey) portals.push("apihub");
  if (env.kmaServiceKey) portals.push("datagokr");
  return portals;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sanitizeResponseText(text: string): string {
  let sanitized = text;
  for (const secret of [env.kmaApiHubAuthKey, env.kmaServiceKey]) {
    if (!secret) continue;
    for (const value of new Set([secret, encodeURIComponent(secret)])) {
      sanitized = sanitized.replace(new RegExp(escapeRegExp(value), "g"), "[REDACTED]");
    }
  }
  sanitized = sanitized.replace(
    /([?&](?:authKey|serviceKey)=)[^&\s"'<>\]}]+/gi,
    "$1[REDACTED]",
  );
  return sanitized.replace(/https?:\/\/[^\s"'<>]+/gi, (url) => {
    const queryIndex = url.indexOf("?");
    return queryIndex === -1 ? url : `${url.slice(0, queryIndex)}?[REDACTED]`;
  });
}

function bodySnippet(text: string): string {
  const t = sanitizeResponseText(text).replace(/\s+/g, " ").trim();
  return t ? ` — 응답: ${t.slice(0, 160)}` : "";
}

async function callKmaPortal(
  portal: KmaPortal,
  endpoint: string,
  params: Record<string, string>,
  parentSignal?: AbortSignal
): Promise<KmaItem[]> {
  const config = portalConfig(portal);
  if (!config.key) throw new Error(`${config.label} 인증키가 설정되지 않았습니다.`);
  const url = new URL(`${config.baseUrl}/${endpoint}`);
  url.searchParams.set("pageNo", "1");
  // 한 지점의 단기예보 전체 범위를 받아 일 최저·최고와 현재 이후의 가장 가까운 값을 함께 고른다.
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set(config.keyName, config.key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    cache: "no-store",
    headers: COMMON_HEADERS,
    signal: parentSignal
      ? AbortSignal.any([parentSignal, AbortSignal.timeout(KMA_PROVIDER_TIMEOUT_MS)])
      : AbortSignal.timeout(KMA_PROVIDER_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}${bodySnippet(text)}`);
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`응답 파싱 실패${bodySnippet(text)}`);
  }
  const header = json?.response?.header;
  if (header && header.resultCode !== "00") {
    throw new Error(`응답 오류: ${sanitizeResponseText(String(header.resultMsg ?? header.resultCode))}`);
  }
  const items = json?.response?.body?.items?.item;
  const normalizedItems = items ? (Array.isArray(items) ? items : [items]) : [];
  if (normalizedItems.length === 0) {
    throw new Error("응답 자료가 비어 있습니다");
  }
  return normalizedItems;
}

async function callKma(
  endpoint: string,
  params: Record<string, string>,
  signal?: AbortSignal
): Promise<KmaCallResult> {
  const order = configuredPortals();
  if (order.length === 0) {
    throw new Error("KMA_AUTH_KEY 또는 KMA_SERVICE_KEY가 설정되지 않았습니다.");
  }
  const failures: Array<{ portal: KmaPortal; error: unknown }> = [];
  for (const portal of order) {
    try {
      const items = await callKmaPortal(portal, endpoint, params, signal);
      return { items, portal };
    } catch (err) {
      failures.push({ portal, error: err });
    }
  }
  const detail = failures
    .map(({ portal, error }) => {
      const message = error instanceof Error ? error.message : "알 수 없는 오류";
      return `${portalConfig(portal).label}: ${sanitizeResponseText(message)}`;
    })
    .join(" · ");
  throw new Error(`KMA API 호출 실패 (${endpoint}) · ${detail}`);
}

function errorMessage(error: unknown): string {
  return sanitizeResponseText(error instanceof Error ? error.message : "알 수 없는 오류");
}

async function callKmaWithPreviousBase(
  endpoint: string,
  primaryBase: { base_date: string; base_time: string },
  previousBase: { base_date: string; base_time: string },
  nx: number,
  ny: number,
  signal?: AbortSignal
): Promise<TimedKmaCallResult> {
  const callAt = async (base: { base_date: string; base_time: string }) => ({
    ...(await callKma(
      endpoint,
      {
        ...base,
        nx: String(nx),
        ny: String(ny),
      },
      signal
    )),
    ...base,
  });

  try {
    return await callAt(primaryBase);
  } catch (primaryError) {
    const primaryMessage = errorMessage(primaryError);
    // 인증·네트워크 오류는 발표시각을 바꿔도 같으므로 빈/미발표 응답만 직전 회차로 재시도한다.
    if (!/(응답 자료가 비어|NO_DATA)/i.test(primaryMessage)) throw primaryError;
    try {
      return await callAt(previousBase);
    } catch (previousError) {
      throw new Error(
        `최신 발표 ${primaryBase.base_date} ${primaryBase.base_time}: ${errorMessage(
          primaryError
        )} · 직전 발표 ${previousBase.base_date} ${previousBase.base_time}: ${errorMessage(
          previousError
        )}`
      );
    }
  }
}

function finiteNumber(value: string | undefined): number | null {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function skyFromCode(code?: string): WeatherSnapshot["sky"] {
  switch (code) {
    case "1":
      return "clear";
    case "3":
      return "cloudy";
    case "4":
      return "overcast";
    default:
      return "unknown";
  }
}

function ptyFromCode(code?: string): WeatherSnapshot["precipType"] {
  switch (code) {
    case "0":
      return "none";
    case "1":
      return "rain";
    case "2":
      return "rain_snow";
    case "3":
      return "snow";
    case "4":
      return "shower";
    // 초단기실황의 빗방울/빗방울·눈날림/눈날림 코드
    case "5":
      return "rain";
    case "6":
      return "rain_snow";
    case "7":
      return "snow";
    default:
      return "unknown";
  }
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
  if (!hasKma()) {
    return fallbackSnapshot("KMA_AUTH_KEY / KMA_SERVICE_KEY 미설정 — 날씨 정보를 불러올 수 없습니다");
  }

  const { nx, ny } = lonLatToGrid(lng, lat);
  const now = nowKst();
  const requestController = new AbortController();
  const requestTimeout = setTimeout(() => requestController.abort(), KMA_TOTAL_TIMEOUT_MS);

  try {
    const ncstBase = ultraSrtNcstBase(now);
    const previousNcstBase = ultraSrtNcstBase(new Date(now.getTime() - 60 * 60 * 1000));
    const fcstBase = vilageFcstBase(now);
    const previousFcstBase = vilageFcstBase(new Date(now.getTime() - 3 * 60 * 60 * 1000));

    const [ncstSettled, fcstSettled] = await Promise.allSettled([
      callKmaWithPreviousBase(
        "getUltraSrtNcst",
        ncstBase,
        previousNcstBase,
        nx,
        ny,
        requestController.signal
      ),
      callKmaWithPreviousBase(
        "getVilageFcst",
        fcstBase,
        previousFcstBase,
        nx,
        ny,
        requestController.signal
      ),
    ]);
    const ncstResult = ncstSettled.status === "fulfilled" ? ncstSettled.value : null;
    const fcstResult = fcstSettled.status === "fulfilled" ? fcstSettled.value : null;
    const ncstFailure =
      ncstSettled.status === "rejected" ? errorMessage(ncstSettled.reason) : "";
    const fcstFailure =
      fcstSettled.status === "rejected" ? errorMessage(fcstSettled.reason) : "";

    if (!ncstResult && !fcstResult) {
      throw new Error(`초단기실황: ${ncstFailure} · 단기예보: ${fcstFailure}`);
    }

    const ncstItems = ncstResult?.items ?? [];
    const fcstItems = fcstResult?.items ?? [];

    const ncst: Record<string, string> = {};
    for (const item of ncstItems) {
      if (item.obsrValue !== undefined) ncst[item.category] = item.obsrValue;
    }

    // SKY/PTY/POP/TMP 등은 날짜 경계를 포함해 현재 KST 이후 가장 가까운 예보를 사용한다.
    // 최신 발표본에서 지난 TMN/TMX가 빠졌으면 오늘 극값이 함께 있는 02시(또는 전날 23시) 발표본으로 보완한다.
    const today = fmtDate(now);
    const byCategory: Record<string, KmaItem[]> = {};
    const todayByCategory: Record<string, KmaItem[]> = {};
    for (const item of fcstItems) {
      if (!item.fcstDate || !item.fcstTime) continue;
      (byCategory[item.category] ??= []).push(item);
      if (item.fcstDate === today) (todayByCategory[item.category] ??= []).push(item);
    }
    const currentForecastKey = `${today}${pad(now.getHours())}${pad(now.getMinutes())}`;
    const forecastKey = (item: KmaItem) =>
      `${item.fcstDate ?? ""}${(item.fcstTime ?? "").padStart(4, "0")}`;
    const nearest = (cat: string): string | undefined => {
      const arr = byCategory[cat];
      if (!arr || arr.length === 0) return undefined;
      const sorted = [...arr].sort((a, b) => forecastKey(a).localeCompare(forecastKey(b)));
      return (
        sorted.find((item) => forecastKey(item) >= currentForecastKey) ?? sorted.at(-1)
      )?.fcstValue;
    };
    const daily = (cat: string): string | undefined => {
      const arr = todayByCategory[cat];
      if (!arr || arr.length === 0) return undefined;
      return [...arr].sort((a, b) => forecastKey(a).localeCompare(forecastKey(b)))[0]
        ?.fcstValue;
    };

    const temp = finiteNumber(ncst.T1H ?? nearest("TMP"));
    const humidity = finiteNumber(ncst.REH ?? nearest("REH"));
    const windSpeed = finiteNumber(ncst.WSD ?? nearest("WSD"));

    if (temp === null) {
      throw new Error("초단기실황과 단기예보 응답에 표시 가능한 기온 값이 없습니다");
    }

    // 단순 체감온도 근사(겨울철 바람냉각 공식, 그 외엔 실측기온과 동일 처리)
    let feelsLike = temp;
    if (temp <= 10 && windSpeed !== null && windSpeed > 1.3) {
      const v = Math.pow(windSpeed * 3.6, 0.16);
      feelsLike = Math.round((13.12 + 0.6215 * temp - 11.37 * v + 0.3965 * temp * v) * 10) / 10;
    }

    let tmxRaw = daily("TMX");
    let tmnRaw = daily("TMN");
    let extremaResult: KmaCallResult | null = null;
    let extremaFailure = "";
    const responseContainsExtrema = fcstItems.some(
      (item) => item.category === "TMX" || item.category === "TMN"
    );
    if (fcstResult && responseContainsExtrema && (!tmxRaw || !tmnRaw)) {
      const extremaBase = dailyExtremaBase(now);
      const isDifferentBase =
        extremaBase.base_date !== fcstResult.base_date ||
        extremaBase.base_time !== fcstResult.base_time;
      if (isDifferentBase) {
        try {
          extremaResult = await callKma(
            "getVilageFcst",
            {
              ...extremaBase,
              nx: String(nx),
              ny: String(ny),
            },
            requestController.signal
          );
          for (const item of extremaResult.items) {
            if (!item.fcstDate || !item.fcstTime || item.fcstDate !== today) continue;
            (todayByCategory[item.category] ??= []).push(item);
          }
          tmxRaw = daily("TMX");
          tmnRaw = daily("TMN");
        } catch (error) {
          extremaFailure = errorMessage(error);
        }
      }
    }
    const popRaw = nearest("POP");
    const precipitation1h = ncst.RN1 ?? nearest("PCP") ?? null;
    const usedPortals = Array.from(
      new Set(
        [ncstResult?.portal, fcstResult?.portal, extremaResult?.portal].filter(
          (portal): portal is KmaPortal => Boolean(portal)
        )
      )
    );
    const provider: WeatherSnapshot["provider"] =
      usedPortals.length > 1
        ? "MIXED"
        : usedPortals[0] === "apihub"
          ? "KMA_APIHUB"
          : "DATA_GO_KR";
    const primaryBase = ncstResult ?? fcstResult!;
    const partialMessages = [
      ncstFailure ? `초단기실황: ${ncstFailure}` : "",
      fcstFailure ? `단기예보: ${fcstFailure}` : "",
      extremaFailure ? `오늘 최고·최저: ${extremaFailure}` : "",
    ].filter(Boolean);

    return {
      provider,
      temp,
      feelsLike,
      sky: skyFromCode(ncst.SKY ?? nearest("SKY")),
      precipType: ptyFromCode(ncst.PTY ?? nearest("PTY")),
      precipProbability: finiteNumber(popRaw),
      humidity,
      windSpeed,
      precipitation1h,
      tmx: finiteNumber(tmxRaw),
      tmn: finiteNumber(tmnRaw),
      baseDate: primaryBase.base_date,
      baseTime: primaryBase.base_time,
      observationBaseDate: ncstResult?.base_date ?? null,
      observationBaseTime: ncstResult?.base_time ?? null,
      forecastBaseDate: fcstResult?.base_date ?? null,
      forecastBaseTime: fcstResult?.base_time ?? null,
      fallback: false,
      message:
        partialMessages.length > 0
          ? `일부 날씨 자료 조회 실패 · ${partialMessages.join(" · ")}`
          : undefined,
    };
  } catch (err) {
    return fallbackSnapshot(err instanceof Error ? err.message : "날씨 정보를 불러오는 중 오류가 발생했습니다");
  } finally {
    clearTimeout(requestTimeout);
  }
}

export interface WeatherAlertResult {
  alerts: WeatherAlert[];
  fallback: boolean;
  message?: string;
}

// wrn_now_data.php 특보종류 코드 → 한글명
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

// wrn_now_data.php 특보수준 코드(1:예비, 2:주의보, 3:경보) → 앱 표기
const WRN_LEVEL_MAP: Record<string, WeatherAlert["alert_level"]> = {
  "1": "예비특보",
  "2": "주의보",
  "3": "경보",
};

// 발표시각 "202607141100" → ISO(KST)
function kmaTimeToIso(tm: string | undefined): string | null {
  if (!tm || !/^\d{12}/.test(tm)) return null;
  return `${tm.slice(0, 4)}-${tm.slice(4, 6)}-${tm.slice(6, 8)}T${tm.slice(8, 10)}:${tm.slice(10, 12)}:00+09:00`;
}

// regionKeyword: 지역명 일부(예: "세종")로 필터링
export async function getWeatherAlerts(regionKeyword?: string): Promise<WeatherAlertResult> {
  if (!hasKmaApiHub()) {
    return { alerts: [], fallback: true, message: "KMA_AUTH_KEY 미설정 — 기상특보를 불러올 수 없습니다" };
  }
  try {
    const url = new URL(WARNING_URL);
    url.searchParams.set("authKey", env.kmaApiHubAuthKey);
    url.searchParams.set("disp", "1");
    url.searchParams.set("help", "0");

    const res = await fetch(url.toString(), {
      cache: "no-store",
      headers: COMMON_HEADERS,
      signal: AbortSignal.timeout(KMA_ALERT_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? " · 기상특보는 API허브(apihub.kma.go.kr) 키가 필요합니다. 키 값과 상태를 확인하세요."
          : "";
      throw new Error(`기상특보 조회 오류: HTTP ${res.status}${bodySnippet(text)}${hint}`);
    }

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#") && l !== "=");

    const alerts: WeatherAlert[] = lines
      .map((line, idx) => {
        // wrn_now_data.php 컬럼 순서: REG_UP, REG_UP_KO, REG_ID, REG_KO, TM_FC, TM_EF, WRN, LVL, CMD, ED_TM
        const cols = line.split(",").map((c) => c.trim());
        if (cols.length < 8) return null;
        const [, regUpKo, regId, regKo, tmFc, tmEf, wrn, lvl] = cols;
        if (!wrn) return null;
        const alert: WeatherAlert = {
          id: `${tmFc || idx}-${regId || idx}-${idx}`,
          alert_kind: WRN_KIND_MAP[wrn] ?? wrn,
          alert_level: WRN_LEVEL_MAP[lvl] ?? "주의보",
          region_codes: [regKo || regUpKo || ""].filter(Boolean),
          issued_at: kmaTimeToIso(tmFc) ?? new Date().toISOString(),
          effective_until: kmaTimeToIso(tmEf),
          source: "kma" as const,
        };
        return alert;
      })
      .filter((a): a is WeatherAlert => a !== null)
      .filter((a) => (regionKeyword ? a.region_codes.some((r) => regionKeywordMatch(r, regionKeyword)) : true));

    return { alerts, fallback: false };
  } catch (err) {
    return { alerts: [], fallback: true, message: err instanceof Error ? err.message : "기상특보 조회 중 오류가 발생했습니다" };
  }
}
