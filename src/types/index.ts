// 공용 타입 정의 (설계서 10장 DB 스키마를 DB 없이도 동일한 shape로 사용하기 위한 타입)

export type DisasterLevel = 1 | 2 | 3 | 4 | 5;

export const LEVEL_NAMES: Record<DisasterLevel, string> = {
  1: "정상",
  2: "관심",
  3: "주의",
  4: "경계",
  5: "심각",
};

export const LEVEL_COLOR_KEYS: Record<DisasterLevel, "normal" | "interest" | "caution" | "alert" | "severe"> = {
  1: "normal",
  2: "interest",
  3: "caution",
  4: "alert",
  5: "severe",
};

export interface RegionSeed {
  region_code: string;
  sido: string;
  sigungu?: string;
  eupmyeondong?: string;
  label: string; // "세종특별자치시 어진동" 처럼 화면에 보여줄 전체 표기
  lat: number;
  lng: number;
}

export interface LocationState {
  region_code: string;
  label: string;
  lat: number;
  lng: number;
  source: "gps" | "map" | "manual" | "url" | "default";
}

export interface WeatherSnapshot {
  provider: "KMA_APIHUB" | null;
  temp: number | null; // 현재기온
  feelsLike: number | null; // 체감온도(단순 근사)
  sky: "clear" | "partly_cloudy" | "cloudy" | "overcast" | "unknown";
  precipType: "none" | "rain" | "rain_snow" | "snow" | "shower" | "unknown";
  precipProbability: number | null; // %
  humidity: number | null;
  windSpeed: number | null; // m/s
  precipitation1h: string | null;
  tmx: number | null; // 최고기온
  tmn: number | null; // 최저기온
  baseDate: string;
  baseTime: string;
  observationBaseDate: string | null;
  observationBaseTime: string | null;
  forecastBaseDate: string | null;
  forecastBaseTime: string | null;
  fallback: boolean; // 실제 데이터 조회 실패 시 true
  message?: string;
}

export type MessageType = "긴급재난문자" | "안전안내문자" | "위급재난문자" | "재난문자" | "재난문자(속보)";

export interface DisasterMessage {
  id: string;
  msg_type: MessageType;
  region_codes: string[];
  content: string;
  issued_at: string;
  source: "safetydata";
  // 어떤 포털 서비스에서 수집됐는지 (00247: 긴급재난문자, 10748: 재난문자 속보)
  service?: "00247" | "10748";
}

export type AlertLevel = "예비특보" | "주의보" | "경보" | "중대경보";

export interface WeatherAlert {
  id: string;
  alert_kind: string; // 강풍/호우/대설/한파/태풍/폭염/황사/건조/풍랑/폭풍해일 등
  alert_level: AlertLevel;
  region_codes: string[];
  content?: string;
  issued_at: string;
  effective_until?: string | null;
  source: "kma";
}

export interface DisasterSituation {
  region_code: string;
  level: DisasterLevel;
  level_name: string;
  disaster_types: string[];
  summary: string;
  reasoning: string;
  confidence: number;
  source_messages: DisasterMessage[];
  source_alerts: WeatherAlert[];
  needs_review: boolean;
  used_llm: boolean;
  updated_at: string;
}

export type ShelterType =
  | "민방위대피소"
  | "지진옥외대피장소"
  | "지진해일긴급대피장소"
  | "이재민임시주거시설"
  | "무더위쉼터"
  | "한파쉼터"
  | "일반";

export type ShelterTypeCode = "1" | "2" | "3" | "4";

export interface Shelter {
  id: string;
  name: string;
  shelter_type: ShelterType;
  shelter_type_code?: ShelterTypeCode;
  shelter_type_name?: string;
  address: string;
  lat: number;
  lng: number;
  source?: "DSSP-IF-10941";
  capacity?: number | null;
  distanceMeters?: number;
}

export interface Place {
  id: string;
  name: string;
  category: "hospital" | "pharmacy";
  address: string;
  phone?: string;
  lat: number;
  lng: number;
  distanceMeters?: number;
}

export interface GuideSection {
  heading: string;
  text: string | null;
  items: string[] | null;
}

export interface GuideType {
  id: string;
  category: "natural" | "social";
  name: string;
  source?: string;
  sections: GuideSection[];
}
