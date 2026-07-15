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
  message?: string;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" ? (value as UnknownRecord) : null;
}

function contentText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(contentText).filter(Boolean).join("\n").trim();

  const record = asRecord(value);
  if (!record) return "";
  if (typeof record.text === "string") return record.text.trim();
  const textRecord = asRecord(record.text);
  if (textRecord && typeof textRecord.value === "string") return textRecord.value.trim();
  if (typeof record.value === "string") return record.value.trim();
  return "";
}

/** Chat Completions와 Responses 호환 응답에서 사용자에게 보여 줄 텍스트를 추출한다. */
export function extractBizrouterText(response: unknown): string {
  const root = asRecord(response);
  if (!root) return "";

  if (typeof root.output_text === "string" && root.output_text.trim()) return root.output_text.trim();

  const choices = Array.isArray(root.choices) ? root.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice?.message);
  const chatText = contentText(message?.content) || contentText(firstChoice?.text);
  if (chatText) return chatText;

  const output = Array.isArray(root.output) ? root.output : [];
  return output
    .map((item) => contentText(asRecord(item)?.content))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function requestFailureMessage(error: unknown): string {
  const record = asRecord(error);
  const status = record?.status ?? record?.statusCode;
  const code = typeof record?.code === "string" ? record.code : "";
  const suffix = [status ? `HTTP ${status}` : "", code].filter(Boolean).join(" · ");
  return `BizRouter 호출에 실패했습니다${suffix ? ` (${suffix})` : ""}. 관리자 API 테스트와 모델 권한을 확인해 주세요.`;
}

export async function chatComplete(
  systemPrompt: string,
  userPrompt: string,
  opts?: { jsonMode?: boolean }
): Promise<ChatResult> {
  if (!hasBizrouter()) {
    return { text: "", fallback: true, message: "BIZROUTER_API_KEY가 설정되지 않았습니다." };
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
    const text = extractBizrouterText(completion);
    if (!text) {
      return {
        text: "",
        fallback: true,
        message: "BizRouter가 텍스트 없는 응답을 반환했습니다. 모델 ID와 응답 형식을 확인해 주세요.",
      };
    }
    return { text, fallback: false };
  } catch (error) {
    return { text: "", fallback: true, message: requestFailureMessage(error) };
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
