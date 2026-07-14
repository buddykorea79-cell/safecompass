import { NextRequest, NextResponse } from "next/server";
import { checkAdminPassword, createSessionToken, ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const password: string = body?.password ?? "";

  if (!checkAdminPassword(password)) {
    return NextResponse.json({ error: "접근코드가 올바르지 않습니다" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE_NAME, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return res;
}
