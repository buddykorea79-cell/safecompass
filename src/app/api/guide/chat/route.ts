import { NextRequest, NextResponse } from "next/server";
import { searchGuides, guideText } from "@/lib/guideData";
import { chatComplete, bizrouterAvailable } from "@/lib/bizrouter";
import { logApiCall } from "@/lib/apiLog";

const FALLBACK_MESSAGE =
  "정확한 정보를 찾지 못했습니다. 119 또는 재난안전상황실(044-205-1541~3)에 문의해 주세요.";

const SYSTEM_PROMPT = `당신은 대한민국 국민안전24 국민행동요령을 바탕으로 답하는 재난 대응 안내 챗봇입니다.
아래 제공된 "참고 자료"에 있는 내용만 근거로 답하세요. 참고 자료에 답이 없으면 절대 추측하지 말고
정확히 다음 문장으로만 답하세요: "${FALLBACK_MESSAGE}"
답변은 한국어로, 간결하고 실행 가능한 행동 중심으로 작성하세요.`;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const message: string = body?.message ?? "";
  if (!message.trim()) {
    return NextResponse.json({ error: "message가 필요합니다" }, { status: 400 });
  }

  if (!bizrouterAvailable()) {
    return NextResponse.json({ reply: FALLBACK_MESSAGE, grounded: false, fallback: true });
  }

  const start = Date.now();
  const matches = await searchGuides(message, 3);
  const context = matches.map((m) => `[${m.guide.name}]\n${guideText(m.guide).slice(0, 1200)}`).join("\n\n");

  if (!context.trim()) {
    logApiCall({ provider: "bizrouter", endpoint: "guideChat", ok: true, detail: "관련 자료 없음 → 폴백" });
    return NextResponse.json({ reply: FALLBACK_MESSAGE, grounded: false, fallback: false });
  }

  const result = await chatComplete(SYSTEM_PROMPT, `참고 자료:\n${context}\n\n질문: ${message}`);
  logApiCall({
    provider: "bizrouter",
    endpoint: "guideChat",
    ok: !result.fallback,
    durationMs: Date.now() - start,
  });

  if (result.fallback || !result.text.trim()) {
    return NextResponse.json({ reply: FALLBACK_MESSAGE, grounded: false, fallback: true });
  }

  return NextResponse.json({
    reply: result.text,
    grounded: true,
    fallback: false,
    sources: matches.map((m) => ({ id: m.guide.id, name: m.guide.name })),
  });
}
