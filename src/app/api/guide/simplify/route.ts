import { NextRequest, NextResponse } from "next/server";
import { getGuideById, guideText } from "@/lib/guideData";
import { chatComplete, bizrouterAvailable } from "@/lib/bizrouter";
import { logApiCall } from "@/lib/apiLog";

const SYSTEM_PROMPT =
  "당신은 국민행동요령 원문을 초등학생도 이해할 수 있는 쉬운 말로 다시 쓰는 도우미입니다. 원문의 사실과 순서를 바꾸지 말고, 짧은 문장과 번호 목록으로 다시 쓰세요.";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const id: string = body?.id ?? "";
  const guide = getGuideById(id);
  if (!guide) {
    return NextResponse.json({ error: "행동요령을 찾을 수 없습니다" }, { status: 404 });
  }
  if (!bizrouterAvailable()) {
    return NextResponse.json({ available: false });
  }

  const start = Date.now();
  const result = await chatComplete(SYSTEM_PROMPT, guideText(guide).slice(0, 4000));
  logApiCall({ provider: "bizrouter", endpoint: "guideSimplify", ok: !result.fallback, durationMs: Date.now() - start });

  if (result.fallback || !result.text.trim()) {
    return NextResponse.json({ available: false });
  }
  return NextResponse.json({ available: true, text: result.text.trim() });
}
