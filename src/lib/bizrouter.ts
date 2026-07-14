// bizrouter(OpenAI 호환 게이트웨이) 어댑터
// baseURL/apiKey만 다르고 나머지는 표준 OpenAI SDK 사용을 가정(사용자 확인 사항).
// 키가 없으면 이 모듈의 모든 함수는 사용 불가 상태를 반환하고,
// 호출부(levelEngine/guideData/GuideChat)는 규칙기반/키워드/브라우저 API로 자동 폴백한다.

import OpenAI from "openai";
import { env, hasBizrouter } from "./env";

let client: OpenAI | null = null;
const BIZROUTER_TIMEOUT_MS = 8_000;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: env.bizrouterBaseUrl,
      apiKey: env.bizrouterApiKey,
      timeout: BIZROUTER_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
  return client;
}

export function bizrouterAvailable(): boolean {
  return hasBizrouter();
}

export interface ChatResult {
  text: string;
  fallback: boolean;
}

export async function chatComplete(
  systemPrompt: string,
  userPrompt: string,
  opts?: { jsonMode?: boolean }
): Promise<ChatResult> {
  if (!hasBizrouter()) {
    return { text: "", fallback: true };
  }
  try {
    const completion = await getClient().chat.completions.create({
      model: env.bizrouterChatModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(opts?.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      temperature: 0.2,
    });
    return { text: completion.choices[0]?.message?.content ?? "", fallback: false };
  } catch {
    return { text: "", fallback: true };
  }
}

export interface EmbeddingResult {
  vectors: number[][];
  fallback: boolean;
}

export async function embedTexts(texts: string[]): Promise<EmbeddingResult> {
  if (!hasBizrouter() || texts.length === 0) {
    return { vectors: [], fallback: true };
  }
  try {
    const res = await getClient().embeddings.create({
      model: env.bizrouterEmbeddingModel,
      input: texts,
    });
    return { vectors: res.data.map((d) => d.embedding), fallback: false };
  } catch {
    return { vectors: [], fallback: true };
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface SpeechToTextResult {
  text: string;
  fallback: boolean;
}

export async function transcribeAudio(file: File): Promise<SpeechToTextResult> {
  if (!hasBizrouter()) {
    return { text: "", fallback: true };
  }
  try {
    const res = await getClient().audio.transcriptions.create({
      file,
      model: "whisper-1",
      language: "ko",
    });
    return { text: res.text, fallback: false };
  } catch {
    return { text: "", fallback: true };
  }
}
