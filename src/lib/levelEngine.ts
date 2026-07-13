// 재난 심각도 판정 엔진 (설계서 5.3)
// 1차: 규칙기반(특보/재난문자 등급 → 5단계 매핑, data/levelCriteria.ts)
// 2차: bizrouter 키가 있으면 LLM이 사회재난/복합상황을 검토해 "상향(escalate)"만 가능
//      (규칙기반보다 낮은 단계로 내리는 것은 금지 — 안전 우선 원칙)

import { LEVEL_REASONING_TEMPLATE, MESSAGE_TYPE_LEVEL, WEATHER_ALERT_LEVEL } from "@/data/levelCriteria";
import { chatComplete, bizrouterAvailable } from "./bizrouter";
import { LEVEL_NAMES } from "@/types";
import type { DisasterLevel, DisasterMessage, DisasterSituation, WeatherAlert } from "@/types";

function ruleBasedLevel(messages: DisasterMessage[], alerts: WeatherAlert[]): { level: DisasterLevel; types: string[] } {
  let level: DisasterLevel = 1;
  const types = new Set<string>();

  for (const alert of alerts) {
    const l = WEATHER_ALERT_LEVEL[alert.alert_level] ?? 2;
    if (l > level) level = l;
    types.add(alert.alert_kind);
  }
  for (const msg of messages) {
    const l = MESSAGE_TYPE_LEVEL[msg.msg_type] ?? 2;
    if (l > level) level = l;
    types.add(msg.msg_type);
  }

  return { level, types: Array.from(types) };
}

const LLM_SYSTEM_PROMPT = `당신은 대한민국 재난안전 상황판단 보조 시스템입니다.
아래 규칙기반 1차 판정 결과와 원문 데이터를 검토해, 사회재난이나 복합 상황으로 인해
실제 위험도가 1차 판정보다 더 높다고 판단되면만 상향 조정하세요.
- 반드시 1차 판정 단계 이상의 값만 반환할 수 있습니다(하향 금지).
- JSON으로만 응답하세요: {"level": 1-5의 정수, "reasoning": "한국어 근거 설명"}`;

export async function judgeSituation(
  region_code: string,
  messages: DisasterMessage[],
  alerts: WeatherAlert[]
): Promise<DisasterSituation> {
  const { level: ruleLevel, types } = ruleBasedLevel(messages, alerts);

  let finalLevel: DisasterLevel = ruleLevel;
  let reasoning = LEVEL_REASONING_TEMPLATE[ruleLevel];
  let usedLlm = false;
  let needsReview = false;

  if (bizrouterAvailable() && (messages.length > 0 || alerts.length > 0)) {
    const userPrompt = JSON.stringify({
      ruleBasedLevel: ruleLevel,
      messages: messages.map((m) => ({ type: m.msg_type, content: m.content })),
      alerts: alerts.map((a) => ({ kind: a.alert_kind, level: a.alert_level })),
    });
    const result = await chatComplete(LLM_SYSTEM_PROMPT, userPrompt, { jsonMode: true });
    if (!result.fallback) {
      try {
        const parsed = JSON.parse(result.text);
        const llmLevel = Math.min(5, Math.max(1, Math.round(parsed.level))) as DisasterLevel;
        if (llmLevel > ruleLevel) {
          finalLevel = llmLevel;
          reasoning = typeof parsed.reasoning === "string" ? parsed.reasoning : reasoning;
          usedLlm = true;
        }
      } catch {
        needsReview = true;
      }
    }
  }

  const summary =
    finalLevel === 1
      ? "현재 특별한 재난 상황이 확인되지 않았습니다."
      : `${LEVEL_NAMES[finalLevel]} 단계 — ${types.slice(0, 3).join(", ") || "재난 상황"} 관련 정보가 확인되었습니다.`;

  return {
    region_code,
    level: finalLevel,
    level_name: LEVEL_NAMES[finalLevel],
    disaster_types: types,
    summary,
    reasoning,
    confidence: usedLlm ? 0.75 : 0.9,
    source_messages: messages,
    source_alerts: alerts,
    needs_review: needsReview,
    used_llm: usedLlm,
    updated_at: new Date().toISOString(),
  };
}
