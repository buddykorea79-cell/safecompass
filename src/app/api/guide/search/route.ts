import { NextRequest, NextResponse } from "next/server";
import { searchGuides } from "@/lib/guideData";
import { logApiCall } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const start = Date.now();
  const results = await searchGuides(q);
  logApiCall({
    provider: "bizrouter",
    endpoint: "searchGuides",
    ok: true,
    durationMs: Date.now() - start,
  });
  return NextResponse.json({
    results: results.map((r) => ({ guide: r.guide, score: r.score })),
  });
}
