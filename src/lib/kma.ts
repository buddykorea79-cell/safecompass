// 기상청 API 허브(apihub.kma.go.kr) 동네예보 어댑터
// 실제 엔드포인트/파라미터는 docs/단기예보.txt (VilageFcstInfoService_2.0) 기준
// - getUltraSrtNcst: 초단기실황(매시, 10분 이후 제공) — T1H/RN1/PTY/REH/WSD/VEC 등
// - getVilageFcst:   단기예보(1일 8회, 02/05/08/11/14/17/20/23시 생산) — TMP/TMX/TMN/SKY/PTY/POP 등

import { env, hasKma } from "./env";
import { lonLatToGrid } from "./geo";
import type { WeatherAlert, WeatherSnapshot } from "@/types";

const BASE_URL = "https://apihub.kma.go.kr/api/typ02/openApi/VilageFcstInfoService_2.0";
// 기상특보 현황(typ01/url) — docs/예특보.txt에 상세 응답 필드가 문서화되어 있지 않아
// KMA API 허브의 공개된 특보 조회 표준 엔드포인트를 best-effort로 사용한다.
// 실제 키 등록 후 응답 필드명 보정이 필요할 수 있다.
const WARNING_URL = "https://apihub.kma.go.kr/api/typ01/url/wrn_now_data.php";

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

interface KmaItem {
  category: string;
  obsrValue?: string;
  fcstValue?: string;
  fcstDate?: string;
  fcstTime?: string;
}

async function callKma(endpoint: string, params: Record<string, string>): Promise<KmaItem[]> {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "300");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("authKey", env.kmaAuthKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`KMA API 응답 오류 (${endpoint}): HTTP ${res.status}`);
  }
  const json = await res.json();
  const header = json?.response?.header;
  if (header && header.resultCode !== "00") {
    throw new Error(`KMA API 오류 (${endpoint}): ${header.resultMsg ?? header.resultCode}`);
  }
  const items = json?.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}

function skyFromCode(code?: string): WeatherSnapshot["sky"] {
  switch (code) {
    case "1":
      return "clear";
    case "3":
      return "partly_cloudy";
    case "4":
      return "cloudy";
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
    default:
      return "unknown";
  }
}

function fallbackSnapshot(message: string): WeatherSnapshot {
  return {
    temp: null,
    feelsLike: null,
    sky: "unknown",
    precipType: "unknown",
    precipProbability: null,
    humidity: null,
    tmx: null,
    tmn: null,
    baseDate: "",
    baseTime: "",
    fallback: true,
    message,
  };
}

export async function getWeatherSnapshot(lat: number, lng: number): Promise<WeatherSnapshot> {
  if (!hasKma()) {
    return fallbackSnapshot("KMA_AUTH_KEY 미설정 — 날씨 정보를 불러올 수 없습니다");
  }

  const { nx, ny } = lonLatToGrid(lng, lat);
  const now = nowKst();

  try {
    const ncstBase = ultraSrtNcstBase(now);
    const fcstBase = vilageFcstBase(now);

    const [ncstItems, fcstItems] = await Promise.all([
      callKma("getUltraSrtNcst", { ...ncstBase, nx: String(nx), ny: String(ny) }),
      callKma("getVilageFcst", { ...fcstBase, nx: String(nx), ny: String(ny) }),
    ]);

    const ncst: Record<string, string> = {};
    for (const item of ncstItems) {
      if (item.obsrValue !== undefined) ncst[item.category] = item.obsrValue;
    }

    // 단기예보에서 "오늘" 항목 중 가장 이른 시각의 TMX/TMN/SKY/PTY/POP를 사용
    const today = fmtDate(now);
    const todayItems = fcstItems.filter((i) => i.fcstDate === today);
    const byCategory: Record<string, KmaItem[]> = {};
    for (const item of todayItems) {
      (byCategory[item.category] ??= []).push(item);
    }
    const earliest = (cat: string): string | undefined => {
      const arr = byCategory[cat];
      if (!arr || arr.length === 0) return undefined;
      return arr.sort((a, b) => (a.fcstTime ?? "").localeCompare(b.fcstTime ?? ""))[0].fcstValue;
    };

    const temp = ncst.T1H !== undefined ? Number(ncst.T1H) : null;
    const humidity = ncst.REH !== undefined ? Number(ncst.REH) : null;
    const windSpeed = ncst.WSD !== undefined ? Number(ncst.WSD) : null;

    // 단순 체감온도 근사(겨울철 바람냉각 공식, 그 외엔 실측기온과 동일 처리)
    let feelsLike = temp;
    if (temp !== null && temp <= 10 && windSpeed !== null && windSpeed > 1.3) {
      const v = Math.pow(windSpeed * 3.6, 0.16);
      feelsLike = Math.round((13.12 + 0.6215 * temp - 11.37 * v + 0.3965 * temp * v) * 10) / 10;
    }

    const tmxRaw = earliest("TMX");
    const tmnRaw = earliest("TMN");
    const popRaw = earliest("POP");

    return {
      temp,
      feelsLike,
      sky: skyFromCode(ncst.SKY ?? earliest("SKY")),
      precipType: ptyFromCode(ncst.PTY ?? earliest("PTY")),
      precipProbability: popRaw !== undefined ? Number(popRaw) : null,
      humidity,
      tmx: tmxRaw !== undefined ? Number(tmxRaw) : null,
      tmn: tmnRaw !== undefined ? Number(tmnRaw) : null,
      baseDate: ncstBase.base_date,
      baseTime: ncstBase.base_time,
      fallback: false,
    };
  } catch (err) {
    return fallbackSnapshot(err instanceof Error ? err.message : "날씨 정보를 불러오는 중 오류가 발생했습니다");
  }
}

export interface WeatherAlertResult {
  alerts: WeatherAlert[];
  fallback: boolean;
  message?: string;
}

const ALERT_LEVEL_MAP: Record<string, WeatherAlert["alert_level"]> = {
  예비특보: "예비특보",
  주의보: "주의보",
  경보: "경보",
  중대경보: "중대경보",
};

// regionKeyword: 지역명 일부(예: "세종")로 필터링
export async function getWeatherAlerts(regionKeyword?: string): Promise<WeatherAlertResult> {
  if (!hasKma()) {
    return { alerts: [], fallback: true, message: "KMA_AUTH_KEY 미설정 — 기상특보를 불러올 수 없습니다" };
  }
  try {
    const url = new URL(WARNING_URL);
    url.searchParams.set("authKey", env.kmaAuthKey);
    url.searchParams.set("disp", "1");
    url.searchParams.set("help", "0");

    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) throw new Error(`기상특보 조회 오류: HTTP ${res.status}`);
    const text = await res.text();

    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));

    const alerts: WeatherAlert[] = lines
      .map((line, idx) => {
        const cols = line.split(",").map((c) => c.trim());
        // 표준 특보 CSV 컬럼 순서(best-effort): TM_FC,STN,REG_UP,REG_ID,TM_EF,WRN,LVL,CMD,...
        const [tmFc, , regUp, , tmEf, wrn, lvl] = cols;
        if (!wrn) return null;
        const alertLevel = ALERT_LEVEL_MAP[lvl] ?? "주의보";
        const alert: WeatherAlert = {
          id: `${tmFc ?? idx}-${regUp ?? idx}-${idx}`,
          alert_kind: wrn,
          alert_level: alertLevel,
          region_codes: [regUp ?? ""].filter(Boolean),
          issued_at: tmFc ?? new Date().toISOString(),
          effective_until: tmEf ?? null,
          source: "kma" as const,
        };
        return alert;
      })
      .filter((a): a is WeatherAlert => a !== null)
      .filter((a) => (regionKeyword ? a.region_codes.some((r) => r.includes(regionKeyword)) : true));

    return { alerts, fallback: false };
  } catch (err) {
    return { alerts: [], fallback: true, message: err instanceof Error ? err.message : "기상특보 조회 중 오류가 발생했습니다" };
  }
}
