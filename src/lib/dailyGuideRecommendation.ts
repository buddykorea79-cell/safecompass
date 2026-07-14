import { GUIDE_TYPES } from "./guideData";
import type { DisasterMessage, GuideType, WeatherAlert, WeatherSnapshot } from "@/types";

export type DailyGuideSelectionBasis = "signals" | "seasonal-fallback";

export interface DailyGuideRecommendation {
  date: string;
  guide: Pick<GuideType, "id" | "category" | "name">;
  reason: string;
  selectionBasis: DailyGuideSelectionBasis;
  signals: string[];
  sources: {
    disasterMessageCount: number;
    weatherAlertCount: number;
    weatherAvailable: boolean;
  };
}

export interface DailyGuideInput {
  date: string;
  messages: DisasterMessage[];
  weatherAlerts: WeatherAlert[];
  weather: WeatherSnapshot;
}

const EXTRA_KEYWORDS: Record<string, string[]> = {
  gale: ["강풍", "돌풍", "태풍", "바람"],
  lightning: ["낙뢰", "벼락", "천둥", "번개"],
  heavySnow: ["대설", "폭설", "적설", "눈길"],
  icyRoadFall: ["빙판", "결빙", "블랙아이스", "낙상"],
  landslide: ["산사태", "토사", "급경사지"],
  earthquake: ["지진", "여진", "진동"],
  tsunami: ["지진해일", "쓰나미"],
  flooding: ["침수", "물에 잠", "지하차도"],
  heatWave: ["폭염", "무더위", "온열질환", "고온"],
  highWaves: ["풍랑", "높은 물결", "높은 파도"],
  coldWave: ["한파", "저체온", "동파", "강추위"],
  stormSurge: ["폭풍해일", "해일", "월파"],
  heavyRain: ["호우", "폭우", "집중호우", "많은 비"],
  flood: ["홍수", "하천 범람", "제방"],
  yellowDust: ["황사"],
  infectiousDiseasePrevention: ["감염병", "전염병", "확진", "방역"],
  buildingCollapse: ["건축물 붕괴", "건물 붕괴", "붕괴"],
  trafficAccident: ["교통사고", "차량 사고"],
  crowdCrush: ["다중운집", "인파", "압사"],
  fineDust: ["미세먼지", "초미세먼지"],
  forestFire: ["산불", "산림 화재"],
  nuclearPowerPlantAccident: ["원전", "방사능", "방사선"],
  powerOutage: ["정전", "전력 부족"],
  railwaySubwayAccident: ["철도 사고", "지하철 사고", "열차 사고"],
  explosion: ["폭발"],
  maritimeShipAccident: ["선박 사고", "해양 사고", "조난"],
  fire: ["화재", "불이 나", "연기"],
  chemicalAccident: ["화학사고", "유해화학", "가스 누출"],
  cbrnAttack: ["화생방", "생물 테러", "방사능 테러"],
};

const SEASONAL_FALLBACK: Record<number, string> = {
  1: "coldWave",
  2: "coldWave",
  3: "forestFire",
  4: "forestFire",
  5: "forestFire",
  6: "heavyRain",
  7: "heatWave",
  8: "heatWave",
  9: "heavyRain",
  10: "earthquake",
  11: "coldWave",
  12: "coldWave",
};

function normalized(value: string): string {
  return value.toLocaleLowerCase("ko-KR").replace(/[^0-9a-z가-힣]/g, "");
}

function guideById(id: string): GuideType {
  return GUIDE_TYPES.find((guide) => guide.id === id) ?? GUIDE_TYPES[0];
}

function weatherScores(weather: WeatherSnapshot): Map<string, { score: number; signal: string }> {
  const scores = new Map<string, { score: number; signal: string }>();
  const add = (id: string, score: number, signal: string) => {
    const previous = scores.get(id);
    if (!previous || previous.score < score) scores.set(id, { score, signal });
  };

  if (weather.fallback) return scores;
  const highTemperature = Math.max(weather.temp ?? -Infinity, weather.tmx ?? -Infinity);
  const lowTemperature = Math.min(weather.temp ?? Infinity, weather.tmn ?? Infinity);
  if (highTemperature >= 33) add("heatWave", 32, `고온 ${highTemperature}℃`);
  if (lowTemperature <= -10) add("coldWave", 32, `저온 ${lowTemperature}℃`);
  if (weather.windSpeed !== null && weather.windSpeed >= 14) {
    add("gale", 30, `강풍 ${weather.windSpeed}m/s`);
  }
  if (weather.precipType === "snow" || weather.precipType === "rain_snow") {
    add("heavySnow", 28, "눈 예보");
  }
  if (
    weather.precipType === "rain" ||
    weather.precipType === "shower" ||
    (weather.precipProbability !== null && weather.precipProbability >= 70)
  ) {
    add("heavyRain", 25, `강수 가능성${weather.precipProbability !== null ? ` ${weather.precipProbability}%` : ""}`);
  }
  return scores;
}

function seasonalFallbackId(date: string): string {
  const month = Number(date.slice(5, 7));
  return SEASONAL_FALLBACK[month] ?? "earthquake";
}

export function kstDateKey(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseCoordinate(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/**
 * 재난문자·기상특보 키워드와 동네예보 위험 임계값을 같은 점수표에 올려 가장 관련도 높은 행동요령을 고른다.
 * 외부 AI가 없어도 같은 입력과 날짜에는 항상 같은 결과를 반환한다.
 */
export function selectDailyGuideRecommendation(input: DailyGuideInput): DailyGuideRecommendation {
  const usableMessages = input.messages.filter((message) => message.content.trim()).slice(0, 10);
  const messageText = normalized(usableMessages.map((message) => message.content).join(" "));
  const usableWeatherAlerts = input.weatherAlerts.slice(0, 10);
  const weatherAlertText = normalized(
    usableWeatherAlerts
      .map((alert) => `${alert.alert_kind} ${alert.alert_level} ${alert.content ?? ""}`)
      .join(" ")
  );
  const weather = weatherScores(input.weather);

  let selected: { guide: GuideType; score: number; signals: string[] } | null = null;
  for (const guide of GUIDE_TYPES) {
    const keywords = Array.from(new Set([guide.name, ...(EXTRA_KEYWORDS[guide.id] ?? [])]));
    let score = 0;
    const signals: string[] = [];
    for (const keyword of keywords) {
      const token = normalized(keyword);
      if (token && messageText.includes(token)) {
        score += keyword === guide.name ? 18 : 10 + Math.min(token.length, 6);
        signals.push(keyword);
      }
      if (token && weatherAlertText.includes(token)) {
        score += keyword === guide.name ? 22 : 14 + Math.min(token.length, 6);
        signals.push(`기상특보 ${keyword}`);
      }
    }
    const weatherScore = weather.get(guide.id);
    if (weatherScore) {
      score += weatherScore.score;
      signals.push(weatherScore.signal);
    }
    if (score > 0 && (!selected || score > selected.score)) {
      selected = { guide, score, signals };
    }
  }

  const weatherAvailable = !input.weather.fallback;
  if (!selected) {
    const guide = guideById(seasonalFallbackId(input.date));
    return {
      date: input.date,
      guide: { id: guide.id, category: guide.category, name: guide.name },
      reason: "특이 위험 신호가 없어 계절에 맞는 기본 안전수칙을 안내합니다.",
      selectionBasis: "seasonal-fallback",
      signals: ["계절 안전수칙"],
      sources: {
        disasterMessageCount: usableMessages.length,
        weatherAlertCount: usableWeatherAlerts.length,
        weatherAvailable,
      },
    };
  }

  const sourceLabel = [
    usableMessages.length > 0 ? "최근 재난문자" : "",
    usableWeatherAlerts.length > 0 ? "기상특보" : "",
    weather.size > 0 ? "동네예보" : "",
  ]
    .filter(Boolean)
    .join("·");
  return {
    date: input.date,
    guide: { id: selected.guide.id, category: selected.guide.category, name: selected.guide.name },
    reason: `${sourceLabel || "현재 정보"}에서 ${selected.guide.name} 관련 신호가 가장 높습니다.`,
    selectionBasis: "signals",
    signals: Array.from(new Set(selected.signals)).slice(0, 3),
    sources: {
      disasterMessageCount: usableMessages.length,
      weatherAlertCount: usableWeatherAlerts.length,
      weatherAvailable,
    },
  };
}
