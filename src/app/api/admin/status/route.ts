import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { providerStatuses } from "@/lib/env";
import { getApiLog } from "@/lib/apiLog";

export async function GET(req: NextRequest) {
  if (!verifySessionToken(req.cookies.get(ADMIN_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "로그인이 필요합니다" }, { status: 401 });
  }
  return NextResponse.json({ providers: providerStatuses(), log: getApiLog() });
}
