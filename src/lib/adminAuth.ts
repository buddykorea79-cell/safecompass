// 간단한 관리자 인증 (Supabase Auth 대체 — ADMIN_PASSWORD 환경변수 + 서명된 쿠키)

import { createHmac, timingSafeEqual } from "crypto";
import { env, hasAdminPassword } from "./env";

const COOKIE_NAME = "sc_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간

function sign(payload: string): string {
  return createHmac("sha256", env.adminSessionSecret).update(payload).digest("hex");
}

export function createSessionToken(): string {
  const payload = String(Date.now() + SESSION_TTL_MS);
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = sign(payload);
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch {
    return false;
  }
  const expiresAt = Number(payload);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;
  return true;
}

export function checkAdminPassword(password: string): boolean {
  if (!hasAdminPassword()) return false;
  return password === env.adminPassword;
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
