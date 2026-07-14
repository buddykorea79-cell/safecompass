import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, verifySessionToken } from "@/lib/adminAuth";
import { fetchAllIntegratedShelters } from "@/lib/safetydata";
import {
  getShelterSnapshotSummary,
  loadShelterSnapshot,
  saveShelterSnapshot,
} from "@/lib/shelterSnapshot";

export const runtime = "nodejs";
export const maxDuration = 300;

let syncInProgress = false;

function requireAdmin(req: NextRequest): boolean {
  return verifySessionToken(req.cookies.get(ADMIN_COOKIE_NAME)?.value);
}

function validOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === req.nextUrl.host;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "접근코드 확인이 필요합니다" }, { status: 401 });

  if (req.nextUrl.searchParams.get("download") === "1") {
    try {
      const snapshot = await loadShelterSnapshot();
      return new NextResponse(JSON.stringify(snapshot), {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": 'attachment; filename="integrated-shelters.json"',
        },
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "통합대피소 JSON을 읽을 수 없습니다" },
        { status: 404 }
      );
    }
  }

  try {
    return NextResponse.json({ snapshot: await getShelterSnapshotSummary(), syncInProgress });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "통합대피소 저장 상태를 읽을 수 없습니다" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) return NextResponse.json({ error: "접근코드 확인이 필요합니다" }, { status: 401 });
  if (!validOrigin(req)) return NextResponse.json({ error: "허용되지 않은 요청 출처입니다" }, { status: 403 });
  if (syncInProgress) return NextResponse.json({ error: "통합대피소 JSON 저장이 이미 진행 중입니다" }, { status: 409 });

  syncInProgress = true;
  try {
    const download = await fetchAllIntegratedShelters();
    const snapshot = await saveShelterSnapshot(download);
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "통합대피소 JSON 저장 중 오류가 발생했습니다" },
      { status: 502 }
    );
  } finally {
    syncInProgress = false;
  }
}
