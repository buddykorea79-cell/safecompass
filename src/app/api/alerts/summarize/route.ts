import { NextRequest, NextResponse } from "next/server";
import { chatComplete, bizrouterAvailable } from "@/lib/bizrouter";
import { logApiCall } from "@/lib/apiLog";

const SYSTEM_PROMPT =
  "당신은 재난 문자/기상특보 원문을 시민이 바로 행동할 수 있도록 3문장 이내로 쉽게 요약하는 도우미입니다. 과장하지 말고 원문에 있는 사실만 사용하세요.";

function naiveSummary(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(" ") || text.slice(0, 120);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const content: string = body?.content ?? "";
  if (!content.trim()) {
    return NextResponse.json({ error: "content가 필요합니다" }, { status: 400 });
  }

  if (!bizrouterAvailable()) {
    return NextResponse.json({ summary: naiveSummary(content), aiGenerated: false });
  }

  const start = Date.now();
  const result = await chatComplete(SYSTEM_PROMPT, content);
  logApiCall({ provider: "bizrouter", endpoint: "alertSummarize", ok: !result.fallback, durationMs: Date.now() - start });

  if (result.fallback || !result.text.trim()) {
    return NextResponse.json({ summary: naiveSummary(content), aiGenerated: false });
  }
  return NextResponse.json({ summary: result.text.trim(), aiGenerated: true });
}
