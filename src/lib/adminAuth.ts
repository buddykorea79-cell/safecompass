// 외부 인증 서비스 없이 고정 접근코드 + 서명 쿠키로 관리자 화면을 구분한다.
// 공개 저장소에 포함되는 코드이므로 강한 보안 경계가 아니라 운영 도구의 오작동 방지용이다.

import { createHash, createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "sc_admin_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간
export const ADMIN_ACCESS_CODE = "21002100";
const SESSION_SIGNING_KEY = createHash("sha256")
  .update(`safecompass-admin:${ADMIN_ACCESS_CODE}`)
  .digest();

function sign(payload: string): string {
  return createHmac("sha256", SESSION_SIGNING_KEY).update(payload).digest("hex");
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
  const supplied = Buffer.from(password);
  const expected = Buffer.from(ADMIN_ACCESS_CODE);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
